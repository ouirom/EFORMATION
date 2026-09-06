export interface TourStep {
  target: string
  /** Full i18next key under the 'tour' namespace, e.g. 'user.logo' -> 'user.logo.title'/'user.logo.content' */
  key: string
  /** Where to place the tooltip relative to the target. Defaults to 'below'. */
  placement?: 'right' | 'below'
}

export const userTourSteps: TourStep[] = [
  { target: '[data-tour="logo"]', key: 'user.logo', placement: 'right' },
  { target: '[data-tour="search"]', key: 'user.search', placement: 'below' },
  { target: '[data-tour="nav-dashboard"]', key: 'user.navDashboard', placement: 'right' },
  { target: '[data-tour="nav-courses"]', key: 'user.navCourses', placement: 'right' },
  { target: '[data-tour="nav-live"]', key: 'user.navLive', placement: 'right' },
  { target: '[data-tour="nav-badges"]', key: 'user.navBadges', placement: 'right' },
  { target: '[data-tour="notifications"]', key: 'user.notifications', placement: 'below' },
  { target: '[data-tour="user-menu"]', key: 'user.userMenu', placement: 'below' },
]

export const adminTourSteps: TourStep[] = [
  { target: '[data-tour="logo"]', key: 'admin.logo', placement: 'right' },
  { target: '[data-tour="section-toggle"]', key: 'admin.sectionToggle', placement: 'right' },
  { target: '[data-tour="search"]', key: 'admin.search', placement: 'below' },
  { target: '[data-tour="nav-analytics"]', key: 'admin.navAnalytics', placement: 'right' },
  { target: '[data-tour="nav-users"]', key: 'admin.navUsers', placement: 'right' },
  { target: '[data-tour="nav-courses"]', key: 'admin.navCourses', placement: 'right' },
  { target: '[data-tour="nav-live-sessions"]', key: 'admin.navLiveSessions', placement: 'right' },
  { target: '[data-tour="nav-logs"]', key: 'admin.navLogs', placement: 'right' },
  { target: '[data-tour="notifications"]', key: 'admin.notifications', placement: 'below' },
  { target: '[data-tour="user-menu"]', key: 'admin.userMenu', placement: 'below' },
]
