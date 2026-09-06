import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useSessionTimeoutContext } from '@/contexts/SessionTimeoutContext'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'
import { refreshAccessToken, api } from '@/services/api'
import { SessionTimeoutDialog } from '@/components/SessionTimeoutDialog'
import { QuickSearch } from '@/components/QuickSearch'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ProductTour } from '@/components/ProductTour'
import { openGlobalHelp } from '@/lib/globalHelpEvent'
import { userTourSteps, adminTourSteps } from '@/lib/tourSteps'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { cn, getInitials, hexToHslTriplet } from '@/lib/utils'
import {
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  Video,
  Bell,
  Award,
  BarChart3,
  FileText,
  Settings,
  Users,
  Building2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Search,
  Menu,
  Bot,
  GraduationCap,
  User,
  Newspaper,
  UserPlus,
  Mail,
  ScrollText,
  HelpCircle,
  LifeBuoy,
  Globe,
  UploadCloud,
  PlugZap,
  Disc,
  MailCheck,
  UsersRound,
  Library,
} from 'lucide-react'

const mainNavItems = [
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

const adminNavItems = [
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
  { icon: PlugZap, labelKey: 'adminNav.videoConferencing', path: '/admin/livekit-settings' },
  { icon: Disc, labelKey: 'adminNav.recording', path: '/admin/recording-settings' },
  { icon: ScrollText, labelKey: 'adminNav.logs', path: '/admin/logs', tourId: 'logs' },
]

function tourSeenKey(section: 'main' | 'admin') {
  return `eformation_tour_seen_${section}`
}

export default function MainLayout() {
  const { t } = useTranslation('layout')
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'director' || user?.role === 'manager'
  const isAdminSection = location.pathname.startsWith('/admin')
  const hasTeam = ['admin', 'super_admin', 'director', 'manager', 'supervisor'].includes(user?.role || '')
  const navItems = isAdminSection
    ? user?.role === 'super_admin'
      ? [...adminNavItems, { icon: Globe, labelKey: 'adminNav.platform', path: '/admin/platform' }]
      : adminNavItems
    : hasTeam
      ? [mainNavItems[0], { icon: Users, labelKey: 'nav.myTeam', path: '/my-team' }, ...mainNavItems.slice(1)]
      : mainNavItems
  const tourSection = isAdminSection ? 'admin' : 'main'
  const tourSteps = isAdminSection ? adminTourSteps : userTourSteps

  useEffect(() => {
    if (!localStorage.getItem(tourSeenKey(tourSection))) {
      const timer = setTimeout(() => setTourOpen(true), 600)
      return () => clearTimeout(timer)
    }
  }, [tourSection])

  const closeTour = () => {
    localStorage.setItem(tourSeenKey(tourSection), '1')
    setTourOpen(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const response = await api.get('/notifications')
      return response.data.meta?.unreadCount ?? 0
    },
    refetchInterval: 60000,
  })

  // Shares the ['organization'] cache key with AdminOrganizationPage.tsx.
  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const response = await api.get('/organizations/current')
      return response.data.data as { name: string; logo: string | null; primaryColor: string } | undefined
    },
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    const hsl = organization?.primaryColor ? hexToHslTriplet(organization.primaryColor) : null
    if (hsl) {
      document.documentElement.style.setProperty('--primary', hsl)
      document.documentElement.style.setProperty('--ring', hsl)
    }
    return () => {
      document.documentElement.style.removeProperty('--primary')
      document.documentElement.style.removeProperty('--ring')
    }
  }, [organization?.primaryColor])

  const { idleLimitOverrideMs } = useSessionTimeoutContext()

  const { isWarning, secondsLeft, stayActive } = useIdleTimeout(
    () => {
      // Survives the hard `window.location.href` redirect the API client's 401
      // interceptor may trigger from a request that was already in flight —
      // that redirect drops any query string, so the flag can't live there alone.
      sessionStorage.setItem('sessionTimeout', '1')
      // So the next successful login lands back where the user was, not on the
      // generic dashboard — read by AuthContext's applySession().
      sessionStorage.setItem('postLoginRedirect', location.pathname + location.search)
      logout()
      navigate('/login?timeout=1')
    },
    {
      idleLimitMs: idleLimitOverrideMs ?? undefined,
      onActivity: () => {
        refreshAccessToken().catch(() => {
          // A failed proactive refresh isn't fatal — the reactive 401 handler
          // (or the idle-timeout warning) still covers session expiry.
        })
      },
    }
  )

  return (
    <div className="min-h-screen bg-background">
      <SessionTimeoutDialog open={isWarning} secondsLeft={secondsLeft} onStayActive={stayActive} />
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background px-4 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo name={organization?.name} logo={organization?.logo} />
            <span className="text-xl font-bold">{organization?.name || 'E-Formation'}</span>
          </Link>
        </div>
        <UserMenu user={user} onLogout={handleLogout} />
      </header>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300",
          sidebarCollapsed ? "w-16" : "w-64",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b">
          {!sidebarCollapsed && (
            <Link to="/" className="flex items-center gap-2" data-tour="logo">
              <BrandLogo name={organization?.name} logo={organization?.logo} />
              <span className="text-xl font-bold">{organization?.name || 'E-Formation'}</span>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 p-2 overflow-y-auto h-[calc(100vh-8rem)]">
          {/* Section Toggle */}
          {isAdmin && (
            <div className="mb-2">
              <Button
                variant={isAdminSection ? "default" : "outline"}
                size="sm"
                className={cn("w-full justify-start", sidebarCollapsed && "justify-center px-2")}
                onClick={() => navigate(isAdminSection ? '/dashboard' : '/admin/users')}
                data-tour="section-toggle"
              >
                {isAdminSection ? <User className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
                {!sidebarCollapsed && (
                  <span className="ml-2">{isAdminSection ? t('sectionToggle.userSpace') : t('sectionToggle.administration')}</span>
                )}
              </Button>
            </div>
          )}

          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                data-tour={item.tourId ? `nav-${item.tourId}` : undefined}
              >
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3",
                    sidebarCollapsed && "justify-center px-2",
                    isActive && "bg-primary/10 text-primary"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!sidebarCollapsed && <span>{t(item.labelKey)}</span>}
                </Button>
              </Link>
            )
          })}
        </nav>

        {/* User Section */}
        <div className="absolute bottom-0 left-0 right-0 border-t p-2 bg-card">
          {sidebarCollapsed ? (
            <UserMenu user={user} onLogout={handleLogout} />
          ) : (
            <div className="flex items-center gap-3 p-2">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user?.avatarUrl} />
                <AvatarFallback>
                  {getInitials(user?.displayName || 'User')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.displayName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "md:ml-16" : "md:ml-64"
      )}>
        {/* Desktop Header */}
        <header className="sticky top-0 z-30 hidden md:flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
          {/* Search */}
          <div className="flex-1 max-w-md" data-tour="search">
            <QuickSearch />
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-4">
            <LanguageSwitcher />

            {/* Contextual help for the current page (F1 also opens it) */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openGlobalHelp()}
              title={t('header.helpTooltip')}
            >
              <LifeBuoy className="h-5 w-5" />
            </Button>

            {/* Guided tour */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTourOpen(true)}
              title={t('header.tourTooltip')}
            >
              <HelpCircle className="h-5 w-5" />
            </Button>

            {/* Notifications */}
            <Link to="/notifications">
              <Button variant="ghost" size="icon" className="relative" data-tour="notifications">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Badge>
                )}
              </Button>
            </Link>

            {/* User Menu */}
            <UserMenu user={user} onLogout={handleLogout} dataTour="user-menu" />
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {tourOpen && <ProductTour steps={tourSteps} onFinish={closeTour} />}
    </div>
  )
}

function BrandLogo({ name, logo }: { name?: string | null; logo?: string | null }) {
  if (logo) {
    return <img src={logo} alt={name || 'E-Formation'} className="h-8 w-8 rounded-lg object-contain" />
  }
  return (
    <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
      <span className="text-lg font-bold text-primary-foreground">
        {(name || 'E-Formation').charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

function UserMenu({ user, onLogout, dataTour }: { user: any; onLogout: () => void; dataTour?: string }) {
  const { t } = useTranslation('layout')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full" data-tour={dataTour}>
          <Avatar className="h-10 w-10">
            <AvatarImage src={user?.avatarUrl} />
            <AvatarFallback>
              {getInitials(user?.displayName || 'User')}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">
              {user?.displayName}
            </p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User className="mr-2 h-4 w-4" />
            {t('userMenu.profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="mr-2 h-4 w-4" />
            {t('userMenu.settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          {t('userMenu.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
