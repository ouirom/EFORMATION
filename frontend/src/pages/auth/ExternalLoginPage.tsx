import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth, TwoFactorChallenge } from '@/contexts/AuthContext'
import { TwoFactorStep } from '@/components/auth/TwoFactorStep'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Loader2, ShieldAlert, Zap } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { SessionReplacedBanner } from '@/components/auth/SessionReplacedBanner'
import {
  ExternalAuthShell,
  EXTERNAL_BUTTON_CLASS,
  EXTERNAL_CARD_CLASS,
  EXTERNAL_TEXT_CLASS,
  EXTERNAL_TINT_CLASS,
} from '@/components/ExternalAuthShell'

// Comptes de démonstration externes (rôle 'externe') — connexion en un clic
const EXTERNAL_TEST_ACCOUNTS = [
  {
    labelKey: 'external.login.quickLogin.consultant',
    email: 'externe@demo.local',
    password: 'Admin123!',
    color:
      'border border-[color:var(--ext-surface)] bg-[color:var(--ext-surface)] text-[color:var(--ext-surface-foreground)] hover:bg-[color:var(--ext-surface-raised)]',
  },
  {
    labelKey: 'external.login.quickLogin.trainer',
    email: 'consultant@demo.local',
    password: 'Admin123!',
    color:
      'border border-[color:var(--ext-accent-border)] bg-white text-[color:var(--ext-accent-text)] hover:bg-[color:var(--ext-accent-soft)]',
  },
] as const

/**
 * Sign-in for external participants only (role 'externe'): the server refuses
 * any other account here (WRONG_PORTAL) and points staff to /login.
 */
export default function ExternalLoginPage() {
  const { t } = useTranslation('auth')
  const { t: tCommon } = useTranslation('common')
  const { login, verifyTwoFactor, resendTwoFactor } = useAuth()
  const { toast } = useToast()
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [wrongPortal, setWrongPortal] = useState<string | null>(null)
  const [quickLoading, setQuickLoading] = useState<string | null>(null)
  // Two-step sign-in: set once the password step passed and a code was emailed.
  const [twoFactor, setTwoFactor] = useState<TwoFactorChallenge | null>(null)

  const busy = submitting || quickLoading !== null

  // Shared by the form and the quick-login buttons: WRONG_PORTAL gets the inline alert, the rest a toast.
  const reportLoginError = (error: any) => {
    const apiError = error?.response?.data?.error
    if (apiError?.code === 'WRONG_PORTAL') {
      setWrongPortal(apiError.message)
      return
    }
    toast({
      title: t('login.errors.loginFailedTitle'),
      description: apiError?.message || error.message || t('login.errors.invalidCredentials'),
      variant: 'destructive',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setWrongPortal(null)
    if (!formData.email || !formData.password) {
      toast({ title: tCommon('status.error'), description: t('login.errors.fillAllFields'), variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const outcome = await login(formData.email, formData.password, { portal: 'external' })
      if (outcome?.twoFactor) setTwoFactor(outcome.twoFactor)
    } catch (error: any) {
      reportLoginError(error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuickLogin = async (email: string, password: string) => {
    setWrongPortal(null)
    setQuickLoading(email)
    setFormData({ email, password })
    try {
      const outcome = await login(email, password, { portal: 'external' })
      if (outcome?.twoFactor) setTwoFactor(outcome.twoFactor)
    } catch (error: any) {
      reportLoginError(error)
    } finally {
      setQuickLoading(null)
    }
  }

  return (
    <ExternalAuthShell>
      <div className="space-y-4">
        {/* Connexion rapide — comptes de démo externes */}
        <div className={`rounded-lg p-4 ${EXTERNAL_TINT_CLASS}`}>
          <div className="mb-3 flex items-center gap-2">
            <Zap className={`h-4 w-4 ${EXTERNAL_TEXT_CLASS}`} />
            <h3 className="text-sm font-semibold text-foreground">{t('login.quickLoginTitle')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {EXTERNAL_TEST_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={busy || !!twoFactor}
                onClick={() => handleQuickLogin(account.email, account.password)}
                title={account.email}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${account.color}`}
              >
                {quickLoading === account.email ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {t(account.labelKey)}
              </button>
            ))}
          </div>
        </div>
        {twoFactor ? (
          <Card className={EXTERNAL_CARD_CLASS}>
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
                }}
                submitClassName={EXTERNAL_BUTTON_CLASS}
                linkClassName={EXTERNAL_TEXT_CLASS}
              />
            </CardContent>
          </Card>
        ) : (
        <Card className={EXTERNAL_CARD_CLASS}>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">{t('external.login.title')}</CardTitle>
            <CardDescription className="text-center">{t('external.login.subtitle')}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <SessionReplacedBanner />
              {wrongPortal && (
                <div role="alert" className={`rounded-lg p-3 text-sm text-foreground ${EXTERNAL_TINT_CLASS}`}>
                  <p className="flex items-center gap-2 font-semibold">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    {t('external.login.wrongPortalTitle')}
                  </p>
                  <p className="mt-1">{wrongPortal}</p>
                  <Link to="/login" className="mt-2 inline-block font-medium underline">
                    {t('external.login.wrongPortalAction')}
                  </Link>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="external-email">{t('login.email')}</Label>
                <Input
                  id="external-email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('login.emailPlaceholder')}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="external-password">{t('login.password')}</Label>
                  <Link to="/forgot-password" className={`text-sm hover:underline ${EXTERNAL_TEXT_CLASS}`}>
                    {t('login.forgotPassword')}
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="external-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
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
              <Button type="submit" className={EXTERNAL_BUTTON_CLASS} disabled={busy}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('external.login.submit')}
              </Button>
            </CardContent>
          </form>
          <CardFooter>
            <p className="w-full text-center text-sm text-muted-foreground">
              {t('external.login.noAccount')}{' '}
              <Link to="/external/register" className={`font-medium hover:underline ${EXTERNAL_TEXT_CLASS}`}>
                {t('external.login.requestAccess')}
              </Link>
            </p>
          </CardFooter>
        </Card>
        )}
      </div>
    </ExternalAuthShell>
  )
}
