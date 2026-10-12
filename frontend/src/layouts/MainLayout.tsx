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
import { adminSectionNavItems, canAccessAdmin, userSpaceNavItems } from '@/lib/navigation'
import { useOrganization, useTenantDefaultLanguage, useTenantFeatures } from '@/lib/tenantSettings'
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
import { useExternalTheme } from '@/lib/externalTheme'
import {
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  User,
  HelpCircle,
  LifeBuoy,
  Scale,
  Briefcase,
} from 'lucide-react'

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

  const isAdmin = canAccessAdmin(user?.role)
  // External participants get the partner theme (Administration > Organisation >
  // Personnalisation): dark sidebar, their own accent, a ribbon. Staff UI is unchanged.
  const isExternal = user?.role === 'externe'
  const isAdminSection = location.pathname.startsWith('/admin')
  const modules = useTenantFeatures()
  const navItems = isAdminSection ? adminSectionNavItems(user?.role, modules) : userSpaceNavItems(user?.role, modules)
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

  // logout() itself sends external participants back to their own portal.
  const handleLogout = () => {
    logout()
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
  const { data: organization } = useOrganization()
  useTenantDefaultLanguage(organization?.settings?.defaultLanguage)

  useEffect(() => {
    // For external participants useExternalTheme() sets --primary to their accent.
    if (isExternal) return
    const hsl = organization?.primaryColor ? hexToHslTriplet(organization.primaryColor) : null
    if (hsl) {
      document.documentElement.style.setProperty('--primary', hsl)
      document.documentElement.style.setProperty('--ring', hsl)
    }
    return () => {
      document.documentElement.style.removeProperty('--primary')
      document.documentElement.style.removeProperty('--ring')
    }
  }, [organization?.primaryColor, isExternal])

  useExternalTheme(
    isExternal ? { accent: organization?.externalAccentColor, surface: organization?.externalSurfaceColor } : null,
    { asPrimary: true }
  )

  const { idleLimitOverrideMs } = useSessionTimeoutContext()
  // The organization's inactivity limit (Administration > Organisation) is the
  // total until logout: the warning takes its last minute. A long lesson may
  // still ask for more (idleLimitOverrideMs), never for less.
  const idleMinutes = organization?.settings?.sessionIdleMinutes
  const tenantIdleLimitMs = idleMinutes ? Math.max(1, idleMinutes - 1) * 60 * 1000 : undefined
  const idleLimitMs =
    idleLimitOverrideMs != null ? Math.max(idleLimitOverrideMs, tenantIdleLimitMs ?? 0) : tenantIdleLimitMs

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
      navigate(user?.role === 'externe' ? '/external/login' : '/login?timeout=1')
    },
    {
      idleLimitMs,
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
          isExternal && EXTERNAL_SIDEBAR_CLASS,
          sidebarCollapsed ? "w-16" : "w-64",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className={cn("flex h-16 items-center justify-between px-4 border-b", isExternal && "border-[color:var(--ext-surface-border)]")}>
          {!sidebarCollapsed && (
            <Link to="/" className="flex min-w-0 items-center gap-2" data-tour="logo">
              <BrandLogo name={organization?.name} logo={organization?.logo} />
              {isExternal ? (
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-lg font-bold">{organization?.name || 'E-Formation'}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ext-surface-accent-text)]">
                    {t('externalSpace.label')}
                  </span>
                </span>
              ) : (
                <span className="text-xl font-bold">{organization?.name || 'E-Formation'}</span>
              )}
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("hidden md:flex", isExternal && EXTERNAL_GHOST_CLASS)}
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
                    isActive && "bg-primary/10 text-primary",
                    isExternal && (isActive ? EXTERNAL_ACTIVE_NAV_CLASS : EXTERNAL_GHOST_CLASS)
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
        <div className={cn("absolute bottom-0 left-0 right-0 border-t p-2 bg-card", isExternal && "border-[color:var(--ext-surface-border)] bg-[color:var(--ext-surface)]")}>
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
                <p className={cn("text-xs text-muted-foreground truncate", isExternal && "text-[color:var(--ext-surface-muted)]")}>
                  {user?.email}
                </p>
                <ExternalProfileBadge user={user} className="mt-1" />
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className={cn(isExternal && EXTERNAL_GHOST_CLASS)}>
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
        {isExternal && <ExternalRibbon company={user?.externalCompany} />}

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

// Partner theme of the sidebar (colors come from useExternalTheme's --ext-* variables).
const EXTERNAL_SIDEBAR_CLASS =
  'border-[color:var(--ext-surface-border)] bg-[color:var(--ext-surface)] text-[color:var(--ext-surface-foreground)]'
const EXTERNAL_GHOST_CLASS =
  'text-[color:var(--ext-surface-foreground)] hover:bg-[color:var(--ext-surface-raised)] hover:text-[color:var(--ext-surface-foreground)]'
const EXTERNAL_ACTIVE_NAV_CLASS =
  'bg-[color:var(--ext-accent)] text-[color:var(--ext-accent-foreground)] hover:bg-[color:var(--ext-accent-hover)] hover:text-[color:var(--ext-accent-foreground)]'

/** Thin strip above the header reminding an external participant which space they are in. */
function ExternalRibbon({ company }: { company?: string | null }) {
  const { t } = useTranslation('layout')
  return (
    <div
      className="flex h-7 items-center justify-between gap-3 bg-[color:var(--ext-accent)] px-4 text-xs font-medium text-[color:var(--ext-accent-foreground)] md:px-6"
      data-testid="external-ribbon"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Briefcase className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {t('userMenu.externalBadge')}
          {company ? ` · ${company}` : ''}
        </span>
      </span>
      <span className="hidden shrink-0 uppercase tracking-wider opacity-80 sm:inline">{t('externalSpace.label')}</span>
    </div>
  )
}

/** Makes an external participant's profile stand out: a badge in the partner accent color, with their company. */
function ExternalProfileBadge({ user, className }: { user: any; className?: string }) {
  const { t } = useTranslation('layout')
  if (user?.role !== 'externe') return null
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full bg-[color:var(--ext-accent)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ext-accent-foreground)]',
        className
      )}
      title={user.externalCompany ? `${t('userMenu.externalBadge')} · ${user.externalCompany}` : t('userMenu.externalBadge')}
    >
      <Briefcase className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {t('userMenu.externalBadge')}
        {user.externalCompany ? ` · ${user.externalCompany}` : ''}
      </span>
    </span>
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
            <ExternalProfileBadge user={user} className="mt-1" />
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
        <DropdownMenuItem asChild>
          <Link to="/legal">
            <Scale className="mr-2 h-4 w-4" />
            {t('userMenu.legal')}
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
