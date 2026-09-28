import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SSOCallbackPage() {
  const { t } = useTranslation('auth')
  const { provider } = useParams<{ provider: 'google' | 'azure' }>()
  const [searchParams] = useSearchParams()
  const { completeSSOLogin } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const code = searchParams.get('code')
    const providerError = searchParams.get('error_description') || searchParams.get('error')

    if (providerError) {
      setError(providerError)
      return
    }
    if (!code || (provider !== 'google' && provider !== 'azure')) {
      setError(t('ssoCallback.invalidResponse'))
      return
    }

    // `state` names the organization that started the login; the server refuses a callback without it.
    completeSSOLogin(provider, code, searchParams.get('state') || '').catch((err: any) => {
      const apiError = err?.response?.data?.error
      const known: Record<string, string> = {
        SSO_INVALID_STATE: t('ssoCallback.errors.invalidState'),
        SSO_WRONG_ORGANIZATION: t('ssoCallback.errors.wrongOrganization'),
        EMAIL_DOMAIN_NOT_ALLOWED: t('ssoCallback.errors.domainNotAllowed'),
        SSO_NOT_CONFIGURED: t('ssoCallback.errors.notConfigured'),
      }
      setError(known[apiError?.code] || apiError?.message || err.message || t('ssoCallback.loginFailed'))
    })
    // completeSSOLogin/searchParams/provider are stable for the lifetime of this one-shot callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-8">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div>
          <p className="font-medium">{t('ssoCallback.connectionFailedTitle')}</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
        <Button asChild>
          <Link to="/login">{t('ssoCallback.backToLogin')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{t('ssoCallback.connecting')}</p>
    </div>
  )
}
