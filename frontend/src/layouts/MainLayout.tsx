import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSessionTimeoutContext } from '@/contexts/SessionTimeoutContext'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'
import { refreshAccessToken } from '@/services/api'
import { SessionTimeoutDialog } from '@/components/SessionTimeoutDialog'
import { QuickSearch } from '@/components/QuickSearch'
import { ProductTour } from '@/components/ProductTour'
import { openGlobalHelp } from '@/components/GlobalHelp'
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
import { cn, getInitials } from '@/lib/utils'
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
} from 'lucide-react'

const mainNavItems = [
  { icon: LayoutDashboard, label: 'Tableau de bord', path: '/dashboard', tourId: 'dashboard' },
  { icon: BookOpen, label: 'Formations', path: '/courses', tourId: 'courses' },
  { icon: Video, label: 'Sessions live', path: '/live', tourId: 'live' },
  { icon: MessageSquare, label: 'Chat', path: '/chat' },
  { icon: Award, label: 'Badges', path: '/badges', tourId: 'badges' },
  { icon: GraduationCap, label: 'Certificats', path: '/certificates' },
  { icon: Bell, label: 'Notifications', path: '/notifications' },
  { icon: Newspaper, label: 'Blog', path: '/blog' },
  { icon: Bot, label: 'Assistant IA', path: '/ai-tutor' },
  { icon: Search, label: 'Recherche', path: '/search' },
]

const adminNavItems = [
  { icon: BarChart3, label: 'Analytics', path: '/admin/analytics', tourId: 'analytics' },
  { icon: Users, label: 'Utilisateurs', path: '/admin/users', tourId: 'users' },
  { icon: BookOpen, label: 'Cours', path: '/admin/courses', tourId: 'courses' },
  { icon: UserPlus, label: 'Attributions', path: '/admin/assignments' },
  { icon: Award, label: 'Badges', path: '/admin/badges' },
  { icon: GraduationCap, label: 'Certificats', path: '/admin/certificates' },
  { icon: Video, label: 'Sessions live', path: '/admin/live-sessions', tourId: 'live-sessions' },
  { icon: Bell, label: 'Notifications', path: '/admin/notifications' },
  { icon: Newspaper, label: 'Blog', path: '/admin/blog' },
  { icon: FileText, label: 'Rapports', path: '/admin/reports' },
  { icon: Building2, label: 'Organisation', path: '/admin/organization' },
  { icon: Mail, label: 'Email', path: '/admin/email-settings' },
  { icon: ScrollText, label: 'Journaux d\'audit', path: '/admin/logs', tourId: 'logs' },
]

function tourSeenKey(section: 'main' | 'admin') {
  return `eformation_tour_seen_${section}`
}

export default function MainLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)

  const isAdmin = user?.role === 'admin' || user?.role === 'director' || user?.role === 'manager'
  const isAdminSection = location.pathname.startsWith('/admin')
  const hasTeam = ['admin', 'super_admin', 'director', 'manager', 'supervisor'].includes(user?.role || '')
  const navItems = isAdminSection
    ? adminNavItems
    : hasTeam
      ? [mainNavItems[0], { icon: Users, label: 'Mon équipe', path: '/my-team' }, ...mainNavItems.slice(1)]
      : mainNavItems
  const tourSection = isAdminSection ? 'admin' : 'main'
  const tourSteps = isAdminSection ? adminTourSteps : userTourSteps

  useEffect(() => {
    if (!localStorage.getItem(tourSeenKey(tourSection))) {
      const timer = setTimeout(() => setTourOpen(true), 600)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourSection])

  const closeTour = () => {
    localStorage.setItem(tourSeenKey(tourSection), '1')
    setTourOpen(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

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
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-lg font-bold text-primary-foreground">E</span>
            </div>
            <span className="text-xl font-bold">E-Formation</span>
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
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-lg font-bold text-primary-foreground">E</span>
              </div>
              <span className="text-xl font-bold">E-Formation</span>
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
                  <span className="ml-2">{isAdminSection ? 'Espace utilisateur' : 'Administration'}</span>
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
                  {!sidebarCollapsed && <span>{item.label}</span>}
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
            {/* Contextual help for the current page (F1 also opens it) */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openGlobalHelp()}
              title="Aide de cette page (F1)"
            >
              <LifeBuoy className="h-5 w-5" />
            </Button>

            {/* Guided tour */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTourOpen(true)}
              title="Lancer la visite guidée"
            >
              <HelpCircle className="h-5 w-5" />
            </Button>

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative" data-tour="notifications">
              <Bell className="h-5 w-5" />
              <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                3
              </Badge>
            </Button>

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

function UserMenu({ user, onLogout, dataTour }: { user: any; onLogout: () => void; dataTour?: string }) {
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
            Mon profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="mr-2 h-4 w-4" />
            Paramètres
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
