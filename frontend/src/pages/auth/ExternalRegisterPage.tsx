import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2, Check, Eye, EyeOff, Loader2, Lock, MailCheck, X } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/services/api'
import { useTenantDefaultLanguage } from '@/lib/tenantSettings'
import { DEFAULT_PASSWORD_POLICY, PasswordPolicy, isPasswordCompliant } from '@/lib/passwordPolicy'
import { PasswordRequirements } from '@/components/PasswordRequirements'
import { useLegalInfo } from '@/lib/legal'
import {
  ExternalAuthShell,
  EXTERNAL_BUTTON_CLASS,
  EXTERNAL_CARD_CLASS,
  EXTERNAL_TEXT_CLASS,
  EXTERNAL_TINT_CLASS,
} from '@/components/ExternalAuthShell'

interface RegistrationSettings {
  allowSelfRegistration: boolean
  defaultLanguage: string
  passwordPolicy?: PasswordPolicy
}

/** Same rule as the server (POST /auth/register/external). */
const PHONE_PATTERN = /^[+0-9 ().-]{6,30}$/

/**
 * Access request for external participants: creates a role 'externe' account,
 * always pending until an administrator approves it. Unlike the staff sign-up,
 * there is no org-unit choice and no allowed-email-domain rule.
 */
export default function ExternalRegisterPage() {
  const { t } = useTranslation('auth')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [registrationClosed, setRegistrationClosed] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    company: '',
    jobTitle: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const { data: settings, isLoading: loadingSettings } = useQuery<RegistrationSettings>({
    queryKey: ['registration-settings'],
    queryFn: async () => (await api.get('/auth/registration-settings')).data.data,
    staleTime: 60 * 1000,
  })
  useTenantDefaultLanguage(settings?.defaultLanguage)
  const { data: legal } = useLegalInfo()

  const passwordPolicy = settings?.passwordPolicy ?? DEFAULT_PASSWORD_POLICY
  const isPasswordValid = isPasswordCompliant(formData.password, passwordPolicy)
  const doPasswordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0
  const isPhoneValid = !formData.phone.trim() || PHONE_PATTERN.test(formData.phone.trim())

  const set = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [field]: e.target.value })

  const fail = (description: string) => toast({ title: tCommon('status.error'), description, variant: 'destructive' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { firstName, lastName, company, email, password } = formData
    if (!firstName.trim() || !lastName.trim() || !company.trim() || !email.trim() || !password) {
      return fail(t('external.register.errors.fillAllFields'))
    }
    if (!isPhoneValid) return fail(t('external.register.errors.invalidPhone'))
    if (!isPasswordValid) return fail(t('register.errors.weakPassword'))
    if (!doPasswordsMatch) return fail(t('register.errors.passwordMismatch'))

    setSubmitting(true)
    try {
      await api.post('/auth/register/external', {
        displayName: `${firstName.trim()} ${lastName.trim()}`,
        company: company.trim(),
        jobTitle: formData.jobTitle.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        email: email.trim(),
        password,
      })
      setSent(true)
    } catch (error: any) {
      // Closed between page load and submit: switch to the closed notice.
      if (error.response?.data?.error?.code === 'REGISTRATION_CLOSED') {
        setRegistrationClosed(true)
        return
      }
      fail(error.response?.data?.error?.message || error.message || t('register.errors.registrationFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  let content: React.ReactNode
  if (loadingSettings) {
    content = (
      <Card className="shadow-lg">
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  } else if (registrationClosed || settings?.allowSelfRegistration === false) {
    content = (
      <Card className={EXTERNAL_CARD_CLASS}>
        <CardHeader className="space-y-1 items-center text-center">
          <Lock className="h-10 w-10 text-muted-foreground mb-2" />
          <CardTitle className="text-2xl text-center">{t('register.closedTitle')}</CardTitle>
          <CardDescription className="text-center">{t('register.closedDescription')}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link to="/external/login" className="w-full">
            <Button className={EXTERNAL_BUTTON_CLASS}>{t('external.register.backToLogin')}</Button>
          </Link>
        </CardFooter>
      </Card>
    )
  } else if (sent) {
    content = (
      <Card className={EXTERNAL_CARD_CLASS}>
        <CardHeader className="space-y-1 items-center text-center">
          <MailCheck className={`h-10 w-10 mb-2 ${EXTERNAL_TEXT_CLASS}`} />
          <CardTitle className="text-2xl text-center">{t('external.register.sentTitle')}</CardTitle>
          <CardDescription className="text-center">{t('external.register.sentDescription')}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link to="/external/login" className="w-full">
            <Button className={EXTERNAL_BUTTON_CLASS}>{t('external.register.backToLogin')}</Button>
          </Link>
        </CardFooter>
      </Card>
    )
  } else {
    const optional = <span className="font-normal text-muted-foreground">({t('external.register.optional')})</span>
    const sectionTitle = `text-xs font-semibold uppercase tracking-wider ${EXTERNAL_TEXT_CLASS}`
    content = (
      <Card className={EXTERNAL_CARD_CLASS}>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">{t('external.register.title')}</CardTitle>
          <CardDescription className="text-center">{t('external.register.subtitle')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <fieldset className="space-y-3">
              <legend className={sectionTitle}>{t('external.register.identity')}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ext-firstName">{t('register.firstName')}</Label>
                  <Input id="ext-firstName" autoComplete="given-name" value={formData.firstName} onChange={set('firstName')} disabled={submitting} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ext-lastName">{t('register.lastName')}</Label>
                  <Input id="ext-lastName" autoComplete="family-name" value={formData.lastName} onChange={set('lastName')} disabled={submitting} />
                </div>
              </div>
            </fieldset>

            <fieldset className={`space-y-3 rounded-lg p-3 ${EXTERNAL_TINT_CLASS}`}>
              <legend className={`${sectionTitle} px-1`}>{t('external.register.organization')}</legend>
              <div className="space-y-2">
                <Label htmlFor="ext-company">{t('external.register.company')}</Label>
                <div className="relative">
                  <Building2 className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${EXTERNAL_TEXT_CLASS}`} />
                  <Input
                    id="ext-company"
                    autoComplete="organization"
                    className="pl-9 bg-background"
                    placeholder={t('external.register.companyPlaceholder')}
                    value={formData.company}
                    onChange={set('company')}
                    disabled={submitting}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ext-jobTitle">{t('external.register.jobTitle')} {optional}</Label>
                  <Input
                    id="ext-jobTitle"
                    autoComplete="organization-title"
                    className="bg-background"
                    placeholder={t('external.register.jobTitlePlaceholder')}
                    value={formData.jobTitle}
                    onChange={set('jobTitle')}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ext-phone">{t('external.register.phone')} {optional}</Label>
                  <Input
                    id="ext-phone"
                    type="tel"
                    autoComplete="tel"
                    className="bg-background"
                    placeholder={t('external.register.phonePlaceholder')}
                    value={formData.phone}
                    onChange={set('phone')}
                    disabled={submitting}
                    aria-invalid={!isPhoneValid}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className={sectionTitle}>{t('external.register.account')}</legend>
              <div className="space-y-2">
                <Label htmlFor="ext-email">{t('register.email')}</Label>
                <Input
                  id="ext-email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('register.emailPlaceholder')}
                  value={formData.email}
                  onChange={set('email')}
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">{t('external.register.emailHint')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ext-password">{t('register.password')}</Label>
                <div className="relative">
                  <Input
                    id="ext-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={set('password')}
                    disabled={submitting}
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
                <Label htmlFor="ext-confirmPassword">{t('register.confirmPassword')}</Label>
                <Input
                  id="ext-confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={set('confirmPassword')}
                  disabled={submitting}
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
            </fieldset>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className={EXTERNAL_BUTTON_CLASS} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('external.register.submit')}
            </Button>
            {legal?.privacyPolicyUrl && (
              <p className="text-center text-xs text-muted-foreground">
                {t('register.privacyNotice')}{' '}
                <a href={legal.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className={`hover:underline ${EXTERNAL_TEXT_CLASS}`}>
                  {t('register.privacyPolicy')}
                </a>
              </p>
            )}
            <p className="text-center text-sm text-muted-foreground">
              {t('external.register.alreadyHaveAccess')}{' '}
              <Link to="/external/login" className={`font-medium hover:underline ${EXTERNAL_TEXT_CLASS}`}>
                {t('external.register.signIn')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    )
  }

  return <ExternalAuthShell>{content}</ExternalAuthShell>
}
