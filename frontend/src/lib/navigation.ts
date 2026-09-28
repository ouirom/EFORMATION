import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  Video,
  Bell,
  Award,
  BarChart3,
  FileText,
  Users,
  Building2,
  Search,
  Bot,
  GraduationCap,
  Newspaper,
  UserPlus,
  Mail,
  ScrollText,
  Globe,
  UploadCloud,
  PlugZap,
  Disc,
  MailCheck,
  UsersRound,
  Library,
  KeyRound,
} from 'lucide-react'

/**
 * The app's navigation tabs, shared by the sidebar (MainLayout) and the header's
 * quick search, so "jump to a tab" always offers exactly what the menu shows.
 * Labels are keys in the `layout` namespace.
 */
export interface NavItem {
  icon: ComponentType<{ className?: string }>
  labelKey: string
  path: string
  tourId?: string
}

export const mainNavItems: NavItem[] = [
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/dashboard', tourId: 'dashboard' },
  { icon: BookOpen, labelKey: 'nav.courses', path: '/courses', tourId: 'courses' },
  { icon: Library, labelKey: 'nav.lessons', path: '/lessons' },
  { icon: Video, labelKey: 'nav.live', path: '/live', tourId: 'live' },
  { icon: MessageSquare, labelKey: 'nav.chat', path: '/chat' },
  { icon: Award, labelKey: 'nav.badges', path: '/badges', tourId: 'badges' },
  { icon: GraduationCap, labelKey: 'nav.certificates', path: '/certificates' },
  { icon: Bell, labelKey: 'nav.notifications', path: '/notifications' },
  { icon: Newspaper, labelKey: 'nav.blog', path: '/blog' },
  { icon: Bot, labelKey: 'nav.aiTutor', path: '/ai-tutor' },
  { icon: Search, labelKey: 'nav.search', path: '/search' },
]

const myTeamNavItem: NavItem = { icon: Users, labelKey: 'nav.myTeam', path: '/my-team' }

export const adminNavItems: NavItem[] = [
  { icon: BarChart3, labelKey: 'adminNav.analytics', path: '/admin/analytics', tourId: 'analytics' },
  { icon: Users, labelKey: 'adminNav.users', path: '/admin/users', tourId: 'users' },
  { icon: BookOpen, labelKey: 'adminNav.courses', path: '/admin/courses', tourId: 'courses' },
  { icon: UserPlus, labelKey: 'adminNav.assignments', path: '/admin/assignments' },
  { icon: UsersRound, labelKey: 'adminNav.teams', path: '/admin/teams' },
  { icon: Award, labelKey: 'adminNav.badges', path: '/admin/badges' },
  { icon: GraduationCap, labelKey: 'adminNav.certificates', path: '/admin/certificates' },
  { icon: Video, labelKey: 'adminNav.liveSessions', path: '/admin/live-sessions', tourId: 'live-sessions' },
  { icon: Bell, labelKey: 'adminNav.notifications', path: '/admin/notifications' },
  { icon: MailCheck, labelKey: 'adminNav.emailQueue', path: '/admin/email-queue' },
  { icon: Newspaper, labelKey: 'adminNav.blog', path: '/admin/blog' },
  { icon: FileText, labelKey: 'adminNav.reports', path: '/admin/reports' },
  { icon: Building2, labelKey: 'adminNav.organization', path: '/admin/organization' },
  { icon: UploadCloud, labelKey: 'adminNav.import', path: '/admin/import' },
  { icon: Mail, labelKey: 'adminNav.email', path: '/admin/email-settings' },
  { icon: KeyRound, labelKey: 'adminNav.sso', path: '/admin/sso-settings' },
  { icon: PlugZap, labelKey: 'adminNav.videoConferencing', path: '/admin/livekit-settings' },
  { icon: Disc, labelKey: 'adminNav.recording', path: '/admin/recording-settings' },
  { icon: ScrollText, labelKey: 'adminNav.logs', path: '/admin/logs', tourId: 'logs' },
]

const platformNavItem: NavItem = { icon: Globe, labelKey: 'adminNav.platform', path: '/admin/platform' }

/** Optional modules an organization can turn off (Administration > Organisation). */
export interface EnabledModules {
  chat: boolean
  liveSessions: boolean
  badges: boolean
}

const ALL_MODULES: EnabledModules = { chat: true, liveSessions: true, badges: true }

// Tabs that belong to an optional module disappear when it is turned off.
const MODULE_PATHS: Record<keyof EnabledModules, string[]> = {
  chat: ['/chat'],
  liveSessions: ['/live', '/admin/live-sessions'],
  // Admins keep /admin/badges to prepare badges before turning them on.
  badges: ['/badges'],
}

function withoutDisabledModules(items: NavItem[], modules: EnabledModules): NavItem[] {
  const hidden = (Object.keys(MODULE_PATHS) as (keyof EnabledModules)[])
    .filter((module) => !modules[module])
    .flatMap((module) => MODULE_PATHS[module])
  return items.filter((item) => !hidden.includes(item.path))
}

const ADMIN_ROLES = ['super_admin', 'admin', 'director', 'manager']
const TEAM_ROLES = ['admin', 'super_admin', 'director', 'manager', 'supervisor']

export function canAccessAdmin(role?: string): boolean {
  return ADMIN_ROLES.includes(role || '')
}

/** Tabs of the personal space for this role (the sidebar outside /admin). */
export function userSpaceNavItems(role?: string, modules: EnabledModules = ALL_MODULES): NavItem[] {
  const items = TEAM_ROLES.includes(role || '')
    ? [mainNavItems[0], myTeamNavItem, ...mainNavItems.slice(1)]
    : mainNavItems
  return withoutDisabledModules(items, modules)
}

/** Tabs of the administration section for this role (empty if it has no access). */
export function adminSectionNavItems(role?: string, modules: EnabledModules = ALL_MODULES): NavItem[] {
  if (!canAccessAdmin(role)) return []
  return withoutDisabledModules(role === 'super_admin' ? [...adminNavItems, platformNavItem] : adminNavItems, modules)
}
