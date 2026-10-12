import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { api } from '@/services/api'

/**
 * « Ce n'était pas moi », from the new sign-in alert email. Nothing happens on
 * load (mail scanners open links): one click closes every session of the
 * account, then the user picks a new password (the reset token travels in
 * router state, never in the URL).
 */
export default function NotMePage() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const secure = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const response = await api.post('/auth/not-me', { token })
      // Whatever session this browser had is gone too.
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      navigate('/reset-password', { replace: true, state: { resetToken: response.data.data.resetToken } })
    } catch (err: any) {
      setError(err?.response?.data?.error?.code === 'NOT_ME_INVALID' ? t('notMe.invalid') : t('notMe.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <ShieldAlert className="h-6 w-6 text-amber-700" />
        </div>
        <CardTitle className="text-2xl">{t('notMe.title')}</CardTitle>
        <CardDescription>{t('notMe.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t('notMe.stepSessions')}</li>
          <li>{t('notMe.stepPassword')}</li>
        </ul>
        {!token && <p role="alert" className="text-destructive">{t('notMe.invalid')}</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Button className="w-full" variant="destructive" disabled={!token || submitting} onClick={secure}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('notMe.submit')}
        </Button>
        <Link to="/login" className="text-sm text-muted-foreground hover:underline">
          {t('notMe.itWasMe')}
        </Link>
      </CardFooter>
    </Card>
  )
}
