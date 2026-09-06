import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Rendered by Sentry.ErrorBoundary (main.tsx) when a render error escapes the whole
 * app tree, so a crash shows a recoverable screen instead of a blank white page.
 */
export function ErrorFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <div>
        <h1 className="text-xl font-semibold">Une erreur inattendue est survenue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Veuillez recharger la page. Si le problème persiste, contactez votre administrateur.
        </p>
      </div>
      <Button onClick={() => window.location.reload()}>Recharger la page</Button>
    </div>
  )
}
