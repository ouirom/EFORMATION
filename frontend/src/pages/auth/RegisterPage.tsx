import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff, Check, X, MailCheck, Lock } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useTenantDefaultLanguage } from '@/lib/tenantSettings'
import { DEFAULT_PASSWORD_POLICY, PasswordPolicy, isPasswordCompliant } from '@/lib/passwordPolicy'
import { PasswordRequirements } from '@/components/PasswordRequirements'
import { useLegalInfo } from '@/lib/legal'

interface RegistrationSettings {
  allowSelfRegistration: boolean
  defaultLanguage: string
  requireApproval?: boolean
  allowedEmailDomains?: string[]
  passwordPolicy?: PasswordPolicy
}

function emailDomain(email: string): string {
  return email.split('@').pop()?.trim().toLowerCase() || ''
}

export default function RegisterPage() {
  const { t } = useTranslation('auth')
  const { t: tCommon } = useTranslation('common')
  const { register, isLoading } = useAuth()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [accountActive, setAccountActive] = useState(false)
  const [registrationClosed, setRegistrationClosed] = useState(false)

  // Whether this organization accepts sign-ups (Administration > Organisation), its
  // default language for visitors who never picked one, and its account rules.
  const { data: registrationSettings, isLoading: loadingRegistrationSettings } = useQuery<RegistrationSettings>({
    queryKey: ['registration-settings'],
    queryFn: async () => (await api.get('/auth/registration-settings')).data.data,
    staleTime: 60 * 1000,
  })
  useTenantDefaultLanguage(registrationSettings?.defaultLanguage)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const { data: legal } = useLegalInfo()
  const passwordPolicy = registrationSettings?.passwordPolicy ?? DEFAULT_PASSWORD_POLICY
  const allowedDomains = registrationSettings?.allowedEmailDomains ?? []
  const isPasswordValid = isPasswordCompliant(formData.password, passwordPolicy)
  const isDomainAllowed =
    allowedDomains.length === 0 || !formData.email.includes('@') || allowedDomains.includes(emailDomain(formData.email))
  const doPasswordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      toast({
        title: tCommon('status.error'),
        description: t('register.errors.fillAllFields'),
        variant: 'destructive',
      })
      return
    }

    if (!isDomainAllowed) {
      toast({
        title: tCommon('status.error'),
        description: t('register.errors.domainNotAllowed', { domains: allowedDomains.map((d) => '@' + d).join(', ') }),
        variant: 'destructive',
      })
      return
    }

    if (!isPasswordValid) {
      toast({
        title: tCommon('status.error'),
        description: t('register.errors.weakPassword'),
        variant: 'destructive',
      })
      return
    }

    if (!doPasswordsMatch) {
      toast({
        title: tCommon('status.error'),
        description: t('register.errors.passwordMismatch'),
        variant: 'destructive',
      })
      return
    }

    try {
      const result = await register({
        displayName: `${formData.firstName} ${formData.lastName}`,
        email: formData.email,
        password: formData.password,
      })
      setAccountActive(!result.pending)
      setPendingMessage(result.pending ? result.message || t('register.defaultPendingMessage') : t('register.accountActiveMessage'))
    } catch (error: any) {
      // Closed between page load and submit: switch to the closed notice.
      if (error.response?.data?.error?.code === 'REGISTRATION_CLOSED') {
        setRegistrationClosed(true)
        return
      }
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || error.message || t('register.errors.registrationFailed'),
        variant: 'destructive',
      })
    }
  }

  // Don't flash the form before knowing whether sign-ups are open.
  if (loadingRegistrationSettings) {
    return (
      <Card className="shadow-lg">
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (registrationClosed || registrationSettings?.allowSelfRegistration === false) {
    return (
      <Card className="shadow-lg">
        <CardHeader className="space-y-1 items-center text-center">
          <Lock className="h-10 w-10 text-muted-foreground mb-2" />
          <CardTitle className="text-2xl text-center">{t('register.closedTitle')}</CardTitle>
          <CardDescription className="text-center">{t('register.closedDescription')}</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-4">
          <Link to="/login" className="w-full">
            <Button className="w-full">{t('register.backToLogin')}</Button>
          </Link>
        </CardFooter>
      </Card>
    )
  }

  if (pendingMessage) {
    return (
      <Card className="shadow-lg">
        <CardHeader className="space-y-1 items-center text-center">
          <MailCheck className="h-10 w-10 text-primary mb-2" />
          <CardTitle className="text-2xl text-center">{t('register.accountCreatedTitle')}</CardTitle>
          <CardDescription className="text-center">{pendingMessage}</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-4">
          <Link to="/login" className="w-full">
            <Button className="w-full">{accountActive ? t('register.signIn') : t('register.backToLogin')}</Button>
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">{t('register.title')}</CardTitle>
        <CardDescription className="text-center">
          {t('register.subtitle')}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t('register.firstName')}</Label>
              <Input
                id="firstName"
                placeholder="Niperc"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t('register.lastName')}</Label>
              <Input
                id="lastName"
                placeholder="Uokak"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('register.email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('register.emailPlaceholder')}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={isLoading}
              aria-invalid={!isDomainAllowed}
            />
            {allowedDomains.length > 0 && (
              <p className={`text-xs ${isDomainAllowed ? 'text-muted-foreground' : 'text-red-500'}`}>
                {t('register.allowedDomainsHint', { domains: allowedDomains.map((d) => '@' + d).join(', ') })}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('register.password')}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={isLoading}
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
            {formData.password && <PasswordRequirements password={formData.password} policy={passwordPolicy} />}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('register.confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              disabled={isLoading}
            />
            {formData.confirmPassword && (
              <div className="flex items-center gap-1 text-xs mt-1">
                {doPasswordsMatch ? (
                  <>
                    <Check className="h-3 w-3 text-green-500" />
                    <span className="text-green-600">{t('register.passwordsMatch')}</span>
                  </>
                ) : (
                  <>
                    <X className="h-3 w-3 text-red-500" />
                    <span className="text-red-500">{t('register.passwordsDontMatch')}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('register.submit')}
          </Button>
          {legal?.privacyPolicyUrl && (
            <p className="text-center text-xs text-muted-foreground">
              {t('register.privacyNotice')}{' '}
              <a href={legal.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {t('register.privacyPolicy')}
              </a>
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {t('register.alreadyHaveAccount')}{' '}
            <Link to="/login" className="text-primary hover:underline">
              {t('register.signIn')}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
