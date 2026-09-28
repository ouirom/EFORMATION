import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import i18n, { LANGUAGE_CHOSEN_KEY, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from '@/i18n'
import { api } from '@/services/api'

/**
 * Organization settings (Administration > Organisation) as the rest of the UI needs
 * them: module switches, default language... Shares the ['organization'] cache
 * with MainLayout and AdminOrganizationPage, so saving the settings updates the
 * menu and the guarded pages right away.
 */
export interface TenantPlatformSettings {
  allowSelfRegistration: boolean
  defaultLanguage: string
  timezone: string
  enableNotifications: boolean
  enableChat: boolean
  enableLiveSessions: boolean
  maxUsersPerGroup: number
  certificateValidity: number
  passwordMinLength: number
  passwordRequireComplexity: boolean
  passwordExpiryDays: number
  maxLoginAttempts: number
  lockoutMinutes: number
  sessionIdleMinutes: number
  sessionMaxDays: number
  allowedEmailDomains: string[]
  requireRegistrationApproval: boolean
  quizDefaultPassingScore: number
  quizDefaultMaxAttempts: number
  certificateReminderDays: number
  assignmentReminderDays: number
  assignmentUrgentDays: number
  escalationDaysOverdue: number
  enableBadges: boolean
  enableXp: boolean
  leaderboardScope: LeaderboardScope
  xpPerCourse: number
  xpPerQuiz: number
  xpPerLesson: number
  xpPerLevel: number
}

export type LeaderboardScope = 'organization' | 'direction' | 'service' | 'hidden'

export interface Organization {
  id: number
  name: string
  logo: string | null
  primaryColor: string
  settings?: TenantPlatformSettings
  [key: string]: any
}

export type TenantFeature = 'chat' | 'liveSessions' | 'badges'

export function useOrganization() {
  return useQuery<Organization | undefined>({
    queryKey: ['organization'],
    queryFn: async () => {
      const response = await api.get('/organizations/current')
      return response.data.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Whether each optional module is on. While the settings load, modules count as
 * enabled so the menu doesn't flicker for the (default) enabled case; the server
 * still refuses a disabled module's API with FEATURE_DISABLED.
 */
export function useTenantFeatures(): Record<TenantFeature, boolean> & {
  loaded: boolean
  /** XP, levels and leaderboard. */
  xp: boolean
  leaderboardScope: LeaderboardScope
  xpPerLevel: number
} {
  const { data } = useOrganization()
  const settings = data?.settings
  return {
    loaded: !!settings,
    chat: settings?.enableChat ?? true,
    liveSessions: settings?.enableLiveSessions ?? true,
    badges: settings?.enableBadges ?? true,
    xp: settings?.enableXp ?? true,
    leaderboardScope: settings?.leaderboardScope ?? 'organization',
    xpPerLevel: settings?.xpPerLevel ?? 250,
  }
}

/**
 * Uses the organization's default language for people who never picked one with
 * the language switcher. The choice is not stored, so it keeps following the
 * organization default if an admin changes it later; an explicit pick (switcher)
 * is stored and always wins.
 */
export function useTenantDefaultLanguage(defaultLanguage?: string) {
  useEffect(() => {
    if (!defaultLanguage || !(SUPPORTED_LANGUAGES as readonly string[]).includes(defaultLanguage)) return
    let explicitChoice = false
    try {
      // The switcher sets the marker. A stored language other than the app fallback
      // ('fr') also counts: the detector only ever auto-caches 'fr', so anything
      // else was picked by the user before the marker existed.
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
      explicitChoice = localStorage.getItem(LANGUAGE_CHOSEN_KEY) === '1' || (!!stored && stored !== 'fr')
    } catch {
      return
    }
    if (explicitChoice || i18n.language === defaultLanguage) return
    i18n.changeLanguage(defaultLanguage).then(() => {
      try {
        // changeLanguage() caches the language; undo that, it wasn't the user's choice.
        localStorage.removeItem(LANGUAGE_STORAGE_KEY)
      } catch {
        // storage unavailable: nothing was cached either
      }
    })
  }, [defaultLanguage])
}
