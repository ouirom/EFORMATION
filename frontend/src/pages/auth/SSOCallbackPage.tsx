import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SSOCallbackPage() {
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
      setError("Réponse de connexion invalide.")
      return
    }

    completeSSOLogin(provider, code).catch((err: any) => {
      setError(err?.response?.data?.error?.message || err.message || 'La connexion a échoué.')
    })
    // completeSSOLogin/searchParams/provider are stable for the lifetime of this one-shot callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-8">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div>
          <p className="font-medium">Connexion impossible</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
        <Button asChild>
          <Link to="/login">Retour à la connexion</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Connexion en cours...</p>
    </div>
  )
}
