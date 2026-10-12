import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth, TwoFactorChallenge } from '@/contexts/AuthContext'
import { TwoFactorStep } from '@/components/auth/TwoFactorStep'
import { api } from '@/services/api'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Eye, EyeOff, Zap, AlarmClock, KeyRound, ShieldCheck, ShieldAlert, Briefcase, ArrowRight } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { useBranding, useBrandPrimaryColor } from '@/lib/branding'
import { SessionReplacedBanner } from '@/components/auth/SessionReplacedBanner'

// Comptes de démonstration — connexion en un clic
const TEST_ACCOUNTS = [
  {
    label: 'Super Admin',
    email: 'superadmin@demo.local',
    password: 'Admin123!',
    color: 'bg-slate-800 text-white hover:bg-slate-900 border border-slate-900',
  },
  {
    label: 'Admin',
    email: 'admin@demo.local',
    password: 'Admin123!',
    color: 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-300',
  },
  {
    label: 'Director',
    email: 'director@demo.local',
    password: 'Admin123!',
    color: 'bg-purple-100 text-purple-700 hover:bg-purple-200 border border-purple-300',
  },
  {
    label: 'Manager',
    email: 'manager@demo.local',
    password: 'Admin123!',
    color: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300',
  },
  {
    label: 'Supervisor',
    email: 'supervisor@demo.local',
    password: 'Admin123!',
    color: 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300',
  },
  {
    label: 'Agent',
    email: 'agent@demo.local',
    password: 'Admin123!',
    color: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-300',
  },
] as const

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

export default function LoginPage() {
  const { t } = useTranslation('auth')
  const { t: tCommon } = useTranslation('common')
  const { login, loginWithLdap, verifyTwoFactor, resendTwoFactor, isLoading } = useAuth()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const [timedOut] = useState(() => {
    const flagged = searchParams.get('timeout') === '1' || sessionStorage.getItem('sessionTimeout') === '1'
    sessionStorage.removeItem('sessionTimeout')
    return flagged
  })
  // Set by api.ts when the session was closed elsewhere (logout from another
  // device, admin force-logout, stolen token detected).
  const [sessionRevoked] = useState(() => {
    const flagged = sessionStorage.getItem('sessionRevoked') === '1'
    sessionStorage.removeItem('sessionRevoked')
    return flagged
  })
  const [showPassword, setShowPassword] = useState(false)
  const [quickLoading, setQuickLoading] = useState<string | null>(null)
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [ldapData, setLdapData] = useState({ username: '', password: '' })
  const [ldapSubmitting, setLdapSubmitting] = useState(false)
  // Two-step sign-in: set once the password (or LDAP) step passed and a code was emailed.
  const [twoFactor, setTwoFactor] = useState<TwoFactorChallenge | null>(null)

  const { data: providers } = useQuery({
    queryKey: ['sso-providers'],
    queryFn: async () => {
      const response = await api.get('/auth/sso/providers')
      return response.data.data as { azure: boolean; google: boolean; ldap: boolean }
    },
    staleTime: Infinity,
  })

  // Identité de l'organisation (Administration > Organisation > Personnalisation)
  const { data: branding } = useBranding()
  useBrandPrimaryColor(branding?.primaryColor)
  const [logoFailed, setLogoFailed] = useState(false)
  const logoUrl = branding?.logoUrl && !logoFailed ? branding.logoUrl : null
  const orgName = branding?.name || 'E-Formation'
  const accent = branding?.primaryColor || 'hsl(var(--primary))'
  const accentSoft = branding?.secondaryColor || accent

  const busy = isLoading || quickLoading !== null

  // FIX: login() navigue lui-même — plus besoin de navigate() ici
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.email || !formData.password) {
      toast({ title: tCommon('status.error'), description: t('login.errors.fillAllFields'), variant: 'destructive' })
      return
    }
    try {
      const outcome = await login(formData.email, formData.password)
      if (outcome?.twoFactor) setTwoFactor(outcome.twoFactor)
    } catch (error: any) {
      toast({
        title: t('login.errors.loginFailedTitle'),
        description: error?.response?.data?.error?.message || error.message || t('login.errors.invalidCredentials'),
        variant: 'destructive',
      })
    }
  }

  const handleQuickLogin = async (email: string, password: string, label: string) => {
    setQuickLoading(label)
    setFormData({ email, password })
    try {
      const outcome = await login(email, password)
      if (outcome?.twoFactor) setTwoFactor(outcome.twoFactor)
    } catch (error: any) {
      toast({
        title: t('login.errors.loginFailedTitle'),
        description: error?.response?.data?.error?.message || error.message || t('login.errors.invalidCredentialsGeneric'),
        variant: 'destructive',
      })
    } finally {
      setQuickLoading(null)
    }
  }

  const handleLdapSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ldapData.username || !ldapData.password) {
      toast({ title: tCommon('status.error'), description: t('login.errors.fillAllFields'), variant: 'destructive' })
      return
    }
    setLdapSubmitting(true)
    try {
      const outcome = await loginWithLdap(ldapData.username, ldapData.password)
      if (outcome?.twoFactor) setTwoFactor(outcome.twoFactor)
    } catch (error: any) {
      toast({
        title: t('login.errors.ldapLoginFailedTitle'),
        description: error?.response?.data?.error?.message || error.message || t('login.errors.invalidCredentialsGeneric'),
        variant: 'destructive',
      })
    } finally {
      setLdapSubmitting(false)
    }
  }

  const startSSO = (provider: 'google' | 'azure') => {
    window.location.href = `${API_BASE_URL}/auth/sso/${provider}`
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Bloc gauche — logo de l'organisation, bienvenue, description, copyright.
          Fond clair : les logos sont en général prévus pour un fond blanc. */}
      <div className="hidden lg:flex relative overflow-hidden flex-col justify-between bg-gradient-to-br from-white via-slate-50 to-primary/10 border-r border-slate-200 p-12 text-slate-900">
        {/* Arcs décoratifs aux couleurs de l'organisation */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-32 h-[30rem] w-[30rem]"
          viewBox="0 0 200 200"
          fill="none"
        >
          <path d="M 20 110 A 80 80 0 0 1 180 110" style={{ stroke: accent }} strokeOpacity={0.14} strokeWidth={14} strokeLinecap="round" />
          <path d="M 44 110 A 56 56 0 0 1 156 110" style={{ stroke: accentSoft }} strokeOpacity={0.3} strokeWidth={4} strokeLinecap="round" />
        </svg>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-40 h-[26rem] w-[26rem]"
          viewBox="0 0 200 200"
          fill="none"
        >
          <circle cx="100" cy="100" r="80" style={{ stroke: accent }} strokeOpacity={0.08} strokeWidth={20} />
        </svg>

        <Link to="/" className="relative w-fit">
          {logoUrl ? (
            <div className="rounded-2xl bg-white px-8 py-6 shadow-sm ring-1 ring-slate-200/80">
              <img
                src={logoUrl}
                alt={orgName}
                className="h-28 w-auto max-w-[18rem] object-contain"
                onError={() => setLogoFailed(true)}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-foreground">E</span>
              </div>
              <span className="text-2xl font-bold text-primary">E-Formation</span>
            </div>
          )}
        </Link>

        <div className="relative max-w-md">
          <div
            aria-hidden="true"
            className="mb-6 h-1.5 w-16 rounded-full"
            style={{ background: `linear-gradient(90deg, ${accent}, ${accentSoft})` }}
          />
          <h1 className="text-4xl font-bold leading-tight mb-4 text-slate-900">
            {branding?.name ? t('brand.welcomeTitleOrg', { name: branding.name }) : t('brand.welcomeTitle')}
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed">
            {t('brand.welcomeDescription')}
          </p>
        </div>

        <p className="relative text-sm text-slate-500">
          {t('brand.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>

      {/* Bloc droite — formulaire de connexion */}
      <div className="flex flex-col items-center justify-center p-4 py-10 sm:p-8">
        {/* Logo compact, visible uniquement quand le bloc gauche est masqué (mobile) */}
        {logoUrl ? (
          <Link to="/" className="lg:hidden mb-8 rounded-xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-200/80">
            <img src={logoUrl} alt={orgName} className="h-16 w-auto max-w-[14rem] object-contain" onError={() => setLogoFailed(true)} />
          </Link>
        ) : (
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-xl font-bold text-primary-foreground">E</span>
            </div>
            <span className="text-2xl font-bold text-primary">
              E-Formation
            </span>
          </Link>
        )}

        <div className="w-full max-w-md space-y-4">
          {timedOut && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlarmClock className="h-4 w-4 shrink-0" />
              {t('login.timedOut')}
            </div>
          )}
          {sessionRevoked && !timedOut && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {t('login.sessionRevoked')}
            </div>
          )}
          <SessionReplacedBanner />

          {/* Connexion rapide — comptes de démo */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-blue-600" />
              <h3 className="font-semibold text-blue-900 text-sm">{t('login.quickLoginTitle')}</h3>
            </div>
            <div className="flex flex-wrap gap-2">

              {TEST_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={busy || !!twoFactor}
                  onClick={() => handleQuickLogin(account.email, account.password, account.label)}
                  title={`${account.email} — ${account.password}`}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer ${account.color}`}
                >
                  {quickLoading === account.label ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  {account.label}
                </button>
              ))}
            </div>
            {/* <p className="mt-2 text-xs text-blue-600">
              🔑 {t('login.commonPassword')}{' '}
              <code className="bg-blue-100 rounded px-1 font-mono">Admin123!</code>
            </p> */}
          </div>

          {twoFactor ? (
            <Card className="shadow-lg">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl text-center">{t('twoFactor.title')}</CardTitle>
                <CardDescription className="text-center">{t('twoFactor.subtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                <TwoFactorStep
                  challenge={twoFactor}
                  onSubmit={(code) => verifyTwoFactor(twoFactor.challengeToken, code)}
                  onResend={() => resendTwoFactor(twoFactor.challengeToken)}
                  onCancel={() => {
                    setTwoFactor(null)
                    setFormData((current) => ({ ...current, password: '' }))
                    setLdapData((current) => ({ ...current, password: '' }))
                  }}
                />
              </CardContent>
            </Card>
          ) : (
          <Card className="shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-center">{t('login.title')}</CardTitle>
              <CardDescription className="text-center">
                {t('login.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="local">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="local">{t('login.tabLocal')}</TabsTrigger>
                  <TabsTrigger value="sso">{t('login.tabSso')}</TabsTrigger>
                  <TabsTrigger value="ldap">{t('login.tabLdap')}</TabsTrigger>
                </TabsList>

                {/* --- Local --- */}
                <TabsContent value="local">
                  <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">{t('login.email')}</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder={t('login.emailPlaceholder')}
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={busy}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">{t('login.password')}</Label>
                        <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                          {t('login.forgotPassword')}
                        </Link>
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          disabled={busy}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('login.submit')}
                    </Button>
                  </form>
                </TabsContent>

                {/* --- SSO --- */}
                <TabsContent value="sso">
                  <div className="space-y-3 pt-4">
                    <p className="text-sm text-muted-foreground text-center">
                      {t('login.ssoIntro')}
                    </p>
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full"
                      disabled={busy || !providers?.google}
                      onClick={() => startSSO('google')}
                    >
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      {t('login.continueWithGoogle')}
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full"
                      disabled={busy || !providers?.azure}
                      onClick={() => startSSO('azure')}
                    >
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
                      </svg>
                      {t('login.continueWithMicrosoft')}
                    </Button>
                    {providers && !providers.google && !providers.azure && (
                      <p className="text-xs text-muted-foreground text-center">
                        {t('login.noSsoProvider')}
                      </p>
                    )}
                  </div>
                </TabsContent>

                {/* --- LDAP --- */}
                <TabsContent value="ldap">
                  {providers && !providers.ldap ? (
                    <div className="pt-4 text-center text-sm text-muted-foreground">
                      <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      {t('login.ldapNotConfigured')}
                    </div>
                  ) : (
                    <form onSubmit={handleLdapSubmit} className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="ldap-username">{t('login.ldapUsername')}</Label>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="ldap-username"
                            placeholder={t('login.ldapUsernamePlaceholder')}
                            className="pl-9"
                            value={ldapData.username}
                            onChange={(e) => setLdapData({ ...ldapData, username: e.target.value })}
                            disabled={ldapSubmitting}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ldap-password">{t('login.password')}</Label>
                        <Input
                          id="ldap-password"
                          type="password"
                          placeholder="••••••••"
                          value={ldapData.password}
                          onChange={(e) => setLdapData({ ...ldapData, password: e.target.value })}
                          disabled={ldapSubmitting}
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={ldapSubmitting}>
                        {ldapSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('login.ldapSubmit')}
                      </Button>
                    </form>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter>
              <p className="w-full text-center text-sm text-muted-foreground">
                {t('login.noAccount')}{' '}
                <Link to="/register" className="text-primary hover:underline">
                  {t('login.createAccount')}
                </Link>
              </p>
            </CardFooter>
          </Card>
          )}

          {/* Entrée de l'espace dédié aux intervenants externes */}
          <Link
            to="/external/login"
            className="group flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm transition-colors hover:border-amber-300 hover:bg-amber-100"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-950 text-amber-300">
              <Briefcase className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-amber-900">{t('login.externalPrompt')}</span>
              <span className="font-semibold text-amber-800">{t('login.externalLink')}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-amber-700 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <p className="lg:hidden mt-8 text-center text-sm text-muted-foreground">
          {t('brand.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  )
}
