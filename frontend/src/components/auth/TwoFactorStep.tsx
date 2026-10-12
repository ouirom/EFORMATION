import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatCountdown, sanitizeCode, TERMINAL_ERRORS, twoFactorErrorKey } from '@/lib/twoFactor'
import type { TwoFactorChallenge } from '@/contexts/AuthContext'

interface TwoFactorStepProps {
  challenge: TwoFactorChallenge
  /** Checks the code; rejects with the API error when it is refused. */
  onSubmit: (code: string) => Promise<void>
  onResend: () => Promise<Pick<TwoFactorChallenge, 'emailHint' | 'resendAfter'>>
  /** "Annuler": back to the previous step. */
  onCancel: () => void
  /** Theme hooks (the external portal passes its accent classes). */
  submitClassName?: string
  linkClassName?: string
  submitLabel?: string
}

/**
 * The 6-digit code step of two-step sign-in, shared by /login, /external/login
 * and the activation in Profil > Sécurité: numeric, paste-friendly field
 * (submits by itself once six digits are in), masked email, resend with a
 * countdown, clear messages for an expired code or too many attempts.
 */
export function TwoFactorStep({ challenge, onSubmit, onResend, onCancel, submitClassName, linkClassName, submitLabel }: TwoFactorStepProps) {
  const { t } = useTranslation('auth')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [dead, setDead] = useState(false)
  const [emailHint, setEmailHint] = useState(challenge.emailHint)
  const [resendAt, setResendAt] = useState(() => Date.now() + challenge.resendAfter * 1000)
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const describe = (apiError: any) => {
    const key = twoFactorErrorKey(apiError?.code)
    return key ? t(key) : apiError?.message || t('twoFactor.errors.generic')
  }

  const submit = async (value: string) => {
    if (value.length !== 6 || submitting || dead) return
    setSubmitting(true)
    setError(null)
    setInfo(null)
    try {
      await onSubmit(value)
    } catch (err: any) {
      const apiError = err?.response?.data?.error
      setError(describe(apiError))
      if (TERMINAL_ERRORS.includes(apiError?.code)) setDead(true)
      setCode('')
      inputRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = sanitizeCode(e.target.value)
    setCode(value)
    if (value.length === 6) void submit(value)
  }

  const handleResend = async () => {
    setResending(true)
    setError(null)
    try {
      const next = await onResend()
      setEmailHint(next.emailHint)
      setResendAt(Date.now() + next.resendAfter * 1000)
      setInfo(t('twoFactor.resent'))
      setCode('')
      inputRef.current?.focus()
    } catch (err: any) {
      const apiError = err?.response?.data?.error
      setError(describe(apiError))
      if (TERMINAL_ERRORS.includes(apiError?.code)) setDead(true)
    } finally {
      setResending(false)
    }
  }

  const waitSeconds = (resendAt - now) / 1000

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit(code)
      }}
      className="space-y-4"
      data-testid="two-factor-step"
    >
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p>{t('twoFactor.sentTo', { email: emailHint })}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="two-factor-code">{t('twoFactor.codeLabel')}</Label>
        <Input
          id="two-factor-code"
          ref={inputRef}
          value={code}
          onChange={handleChange}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={14}
          placeholder="••••••"
          className="text-center font-mono text-2xl tracking-[0.5em]"
          disabled={submitting || dead}
          aria-invalid={!!error}
          aria-describedby={error ? 'two-factor-error' : undefined}
        />
        {error && (
          <p id="two-factor-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {info && !error && <p className="text-sm text-muted-foreground">{info}</p>}
      </div>

      {dead ? (
        <Button type="button" className={cn('w-full', submitClassName)} onClick={onCancel}>
          {t('twoFactor.startAgain')}
        </Button>
      ) : (
        <Button type="submit" className={cn('w-full', submitClassName)} disabled={code.length !== 6 || submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel ?? t('twoFactor.submit')}
        </Button>
      )}

      <div className="flex items-center justify-between gap-2 text-sm">
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('twoFactor.cancel')}
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={waitSeconds > 0 || resending || dead}
          className={cn('font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline', linkClassName)}
        >
          {resending ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : null}{' '}
          {waitSeconds > 0 ? t('twoFactor.resendIn', { time: formatCountdown(waitSeconds) }) : t('twoFactor.resend')}
        </button>
      </div>
    </form>
  )
}
