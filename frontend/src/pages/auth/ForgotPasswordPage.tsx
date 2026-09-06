import React, { useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowLeft, Mail } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/services/api'

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      toast({
        title: tCommon('status.error'),
        description: t('forgotPassword.errors.emailRequired'),
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
      toast({
        title: t('forgotPassword.toast.emailSentTitle'),
        description: t('forgotPassword.toast.emailSentDescription'),
      })
    } catch (error: any) {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('forgotPassword.errors.generic'),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (sent) {
    return (
      <Card className="shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">{t('forgotPassword.emailSentTitle')}</CardTitle>
          <CardDescription>
            <Trans i18nKey="forgotPassword.emailSentDescription" ns="auth" values={{ email }} components={{ strong: <strong /> }} />
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setSent(false)}
          >
            {t('forgotPassword.resendEmail')}
          </Button>
          <Link to="/login" className="w-full">
            <Button variant="ghost" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('forgotPassword.backToLogin')}
            </Button>
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">{t('forgotPassword.title')}</CardTitle>
        <CardDescription className="text-center">
          {t('forgotPassword.subtitle')}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('forgotPassword.email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('forgotPassword.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('forgotPassword.submit')}
          </Button>
          <Link to="/login" className="w-full">
            <Button variant="ghost" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('forgotPassword.backToLogin')}
            </Button>
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}
