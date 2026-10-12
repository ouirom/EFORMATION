import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { hexToHslTriplet } from '@/lib/utils'

export interface Branding {
  name: string | null
  logoUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  /** Partner theme of the external portal (#RRGGBB, defaults applied by the server). */
  externalAccentColor?: string
  externalSurfaceColor?: string
}

/** The organization's name, logo and colors (Administration > Organisation > Personnalisation), public. */
export function useBranding() {
  return useQuery<Branding>({
    queryKey: ['branding'],
    queryFn: async () => (await api.get('/auth/branding')).data.data,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Applies the organization's primary color to the theme while the calling
 * page is mounted, the same way MainLayout does once signed in.
 */
export function useBrandPrimaryColor(primaryColor: string | null | undefined) {
  useEffect(() => {
    const hsl = primaryColor ? hexToHslTriplet(primaryColor) : null
    if (!hsl) return
    const root = document.documentElement.style
    root.setProperty('--primary', hsl)
    root.setProperty('--ring', hsl)
    return () => {
      root.removeProperty('--primary')
      root.removeProperty('--ring')
    }
  }, [primaryColor])
}
