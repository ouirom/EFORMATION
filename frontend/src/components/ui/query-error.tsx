import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface QueryErrorProps {
  onRetry?: () => void
  className?: string
  message?: string
  action?: ReactNode
}

/**
 * Shown in place of a query's data when it failed to load, so a network/500/403
 * error reads as "couldn't load" instead of silently rendering as an empty list.
 */
export function QueryError({ onRetry, className, message, action }: QueryErrorProps) {
  const { t } = useTranslation('common')

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}>
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <p className="text-sm text-muted-foreground">{message || t('misc.somethingWentWrong')}</p>
      {action}
      {!action && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('actions.refresh')}
        </Button>
      )}
    </div>
  )
}
