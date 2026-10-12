import { useEffect } from 'react'
import { LIGHT_FOREGROUND, contrastRatio, mixHex, normalizeHexColor, readableForeground } from '@/lib/externalTheme'

/**
 * Side menu color of the staff interface, set in Administration > Organisation >
 * Personnalisation. null = the default look (bg-card, follows light/dark mode).
 * External participants keep their partner theme (externalTheme.ts) instead.
 * Exposed as CSS variables (--sb-*) holding plain hex colors, consumed with
 * Tailwind arbitrary values such as bg-[color:var(--sb-bg)].
 */
export const DEFAULT_PRIMARY_COLOR = '#3B82F6'

/** WCAG minimum contrast for large text / UI components (the active item pill). */
export const MIN_ACTIVE_CONTRAST = 3

export interface SidebarActiveColors {
  background: string
  foreground: string
  /** false when the primary color lacks contrast with the sidebar and a neutral pill is used instead. */
  usesPrimary: boolean
}

/**
 * Active menu item: the organization's primary color when it stands out from the
 * sidebar (ratio >= 3), otherwise a pill tinted with the sidebar's text color.
 */
export function sidebarActiveColors(sidebar: string, primary: string): SidebarActiveColors {
  if (contrastRatio(primary, sidebar) >= MIN_ACTIVE_CONTRAST) {
    return { background: primary, foreground: readableForeground(primary), usesPrimary: true }
  }
  const foreground = readableForeground(sidebar)
  // A translucent white / black pill, flattened onto the sidebar color.
  return { background: mixHex(foreground, sidebar, foreground === LIGHT_FOREGROUND ? 0.2 : 0.12), foreground, usesPrimary: false }
}

/** Every --sb-* variable derived from the sidebar color and the primary color. */
export function sidebarThemeVars(sidebar: string, primary: string): Record<string, string> {
  const foreground = readableForeground(sidebar)
  const active = sidebarActiveColors(sidebar, primary)
  return {
    '--sb-bg': sidebar,
    '--sb-fg': foreground,
    '--sb-muted': mixHex(foreground, sidebar, 0.7),
    '--sb-hover': mixHex(foreground, sidebar, 0.1),
    '--sb-border': mixHex(foreground, sidebar, 0.15),
    '--sb-active-bg': active.background,
    '--sb-active-fg': active.foreground,
    '--sb-active-hover': mixHex(active.foreground, active.background, 0.1),
  }
}

/**
 * Readability of a sidebar color: `text` = menu text on the sidebar (aim for 4.5),
 * `active` = how well the active item stands out (aim for 3): the primary color
 * against the sidebar, or for the neutral pill, its text against the pill.
 */
export function sidebarContrast(sidebar: string, primary: string) {
  const active = sidebarActiveColors(sidebar, primary)
  return {
    text: contrastRatio(sidebar, readableForeground(sidebar)),
    active: active.usesPrimary
      ? contrastRatio(active.background, sidebar)
      : contrastRatio(active.background, active.foreground),
    usesPrimary: active.usesPrimary,
  }
}

/** Sets the --sb-* variables on <html> while the caller is mounted (nothing when `sidebar` is null). */
export function useSidebarTheme(sidebar: string | null | undefined, primary: string | null | undefined) {
  const color = sidebar ? normalizeHexColor(sidebar, '') || null : null
  const primaryColor = normalizeHexColor(primary, DEFAULT_PRIMARY_COLOR)

  useEffect(() => {
    if (!color) return
    const style = document.documentElement.style
    const vars = sidebarThemeVars(color, primaryColor)
    for (const [name, value] of Object.entries(vars)) style.setProperty(name, value)
    return () => {
      for (const name of Object.keys(vars)) style.removeProperty(name)
    }
  }, [color, primaryColor])

  return color
}
