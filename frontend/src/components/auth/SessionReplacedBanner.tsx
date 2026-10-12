import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MonitorSmartphone } from 'lucide-react'
import { hasSessionReplacedFlag } from '@/lib/sessionEnd'

/**
 * Shown on the login pages after this browser was signed out because the
 * account signed in on another device (one session per user).
 */
export function SessionReplacedBanner({ className = '' }: { className?: string }) {
  const { t } = useTranslation('auth')
  // The flag is cleared by the next successful login (AuthContext).
  const [show] = useState(hasSessionReplacedFlag)
  if (!show) return null
  return (
    <div
      role="alert"
      data-testid="session-replaced-banner"
      className={`flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 ${className}`}
    >
      <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{t('login.sessionReplaced')}</span>
    </div>
  )
}
