import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Laptop, Loader2, LogOut, ShieldCheck, Smartphone, Tablet } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { QueryError } from '@/components/ui/query-error'
import { useToast } from '@/components/ui/use-toast'
import { useAuth, TwoFactorChallenge } from '@/contexts/AuthContext'
import { TwoFactorStep } from '@/components/auth/TwoFactorStep'
import { api } from '@/services/api'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'

/** One open session, as GET /auth/sessions describes it (browser/OS parsed server-side). */
export interface LoginSession {
  id: number
  current: boolean
  browser: string
  os: string
  device: 'desktop' | 'mobile' | 'tablet'
  ip: string | null
  authMethod: string
  createdAt: string
  lastUsedAt: string
}

const DEVICE_ICON = { desktop: Laptop, mobile: Smartphone, tablet: Tablet }

/** GET /auth/2fa: the organization's policy and my own choice. */
interface TwoFactorStatus {
  mode: 'off' | 'optional' | 'required'
  enabled: boolean
  enforced: boolean
  canToggle: boolean
  hasPassword: boolean
}

/**
 * Two-step sign-in for my account. Shown unless the organization turned it off;
 * in 'optional' mode, turning it on needs a code sent to my email (proof I get
 * them), turning it off my current password.
 */
function TwoFactorCard() {
  const { t } = useTranslation('profile')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null)
  const [disableOpen, setDisableOpen] = useState(false)
  const [password, setPassword] = useState('')

  const statusQuery = useQuery<TwoFactorStatus>({
    queryKey: ['my-2fa'],
    queryFn: async () => (await api.get('/auth/2fa')).data.data,
  })
  const status = statusQuery.data

  const onError = (error: any) =>
    toast({ title: t('security.error'), description: error?.response?.data?.error?.message, variant: 'destructive' })

  const startMutation = useMutation({
    mutationFn: async () => (await api.post('/auth/2fa/enable/start')).data.data as TwoFactorChallenge,
    onSuccess: setChallenge,
    onError,
  })

  const disableMutation = useMutation({
    mutationFn: () => api.post('/auth/2fa/disable', { password }),
    onSuccess: () => {
      toast({ title: t('security.twoFactor.disabled') })
      setDisableOpen(false)
      setPassword('')
      queryClient.invalidateQueries({ queryKey: ['my-2fa'] })
    },
    onError,
  })

  if (!status || status.mode === 'off') return null

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t('security.twoFactor.title')}
            <Badge variant={status.enabled ? 'default' : 'secondary'}>
              {status.enforced
                ? t('security.twoFactor.enforced')
                : status.enabled
                  ? t('security.twoFactor.on')
                  : t('security.twoFactor.off')}
            </Badge>
          </CardTitle>
          <CardDescription>{t('security.twoFactor.description')}</CardDescription>
        </div>
        {status.canToggle &&
          (status.enabled ? (
            <Button variant="outline" size="sm" className="shrink-0" disabled={!status.hasPassword} onClick={() => setDisableOpen(true)}>
              {t('security.twoFactor.disable')}
            </Button>
          ) : (
            <Button size="sm" className="shrink-0" disabled={startMutation.isPending} onClick={() => startMutation.mutate()}>
              {startMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              {t('security.twoFactor.enable')}
            </Button>
          ))}
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        {status.enforced && <p>{t('security.twoFactor.enforcedHint')}</p>}
        {status.canToggle && status.enabled && !status.hasPassword && <p>{t('security.twoFactor.noPasswordHint')}</p>}
        <p>{t('security.twoFactor.ssoHint')}</p>
      </CardContent>

      <Dialog open={!!challenge} onOpenChange={(open) => !open && setChallenge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('security.twoFactor.enableTitle')}</DialogTitle>
            <DialogDescription>{t('security.twoFactor.enableDescription')}</DialogDescription>
          </DialogHeader>
          {challenge && (
            <TwoFactorStep
              challenge={challenge}
              submitLabel={t('security.twoFactor.confirmEnable')}
              onSubmit={async (code) => {
                await api.post('/auth/2fa/enable/confirm', { challengeToken: challenge.challengeToken, code })
                setChallenge(null)
                toast({ title: t('security.twoFactor.enabled') })
                queryClient.invalidateQueries({ queryKey: ['my-2fa'] })
              }}
              onResend={async () => (await api.post('/auth/2fa/resend', { challengeToken: challenge.challengeToken })).data.data}
              onCancel={() => setChallenge(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={disableOpen} onOpenChange={(open) => { setDisableOpen(open); if (!open) setPassword('') }}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (password) disableMutation.mutate()
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>{t('security.twoFactor.disableTitle')}</DialogTitle>
              <DialogDescription>{t('security.twoFactor.disableDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="two-factor-disable-password">{t('security.twoFactor.currentPassword')}</Label>
              <Input
                id="two-factor-disable-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDisableOpen(false)}>
                {t('security.twoFactor.cancel')}
              </Button>
              <Button type="submit" variant="destructive" disabled={!password || disableMutation.isPending}>
                {disableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('security.twoFactor.disable')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/**
 * Profil > Sécurité: two-step sign-in, and the devices signed in to this
 * account, each of which can be signed out (the current one simply logs out).
 */
export function SecurityTab() {
  const { t } = useTranslation('profile')
  const { logout } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [confirmOthers, setConfirmOthers] = useState(false)

  const sessionsQuery = useQuery<{ sessions: LoginSession[]; singleSession: boolean }>({
    queryKey: ['my-sessions'],
    queryFn: async () => {
      const body = (await api.get('/auth/sessions')).data
      return { sessions: body.data, singleSession: !!body.meta?.singleSessionPerUser }
    },
  })
  const sessions = sessionsQuery.data?.sessions ?? []
  const others = sessions.filter((s) => !s.current)

  const revokeMutation = useMutation({
    mutationFn: (sessionId: number) => api.delete(`/auth/sessions/${sessionId}`),
    onSuccess: () => {
      toast({ title: t('security.sessions.revoked') })
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] })
    },
    onError: (error: any) =>
      toast({ title: t('security.error'), description: error?.response?.data?.error?.message, variant: 'destructive' }),
  })

  const revokeOthersMutation = useMutation({
    mutationFn: () => api.post('/auth/sessions/revoke-others'),
    onSuccess: (response) => {
      toast({ title: t('security.sessions.othersRevoked', { count: response.data.data.revoked }) })
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] })
    },
    onError: (error: any) =>
      toast({ title: t('security.error'), description: error?.response?.data?.error?.message, variant: 'destructive' }),
  })

  return (
    <div className="space-y-4">
      <TwoFactorCard />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{t('security.sessions.title')}</CardTitle>
            <CardDescription>{t('security.sessions.description')}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={others.length === 0 || revokeOthersMutation.isPending}
            onClick={() => setConfirmOthers(true)}
          >
            {revokeOthersMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
            {t('security.sessions.revokeOthers')}
          </Button>
        </CardHeader>
        <CardContent>
          {sessionsQuery.data?.singleSession && (
            <p
              className="mb-3 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground"
              data-testid="single-session-note"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {t('security.sessions.singleSessionNote')}
            </p>
          )}
          {sessionsQuery.isError ? (
            <QueryError onRetry={() => sessionsQuery.refetch()} />
          ) : sessionsQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="divide-y" data-testid="session-list">
              {sessions.map((session) => {
                const Icon = DEVICE_ICON[session.device] ?? Laptop
                return (
                  <li key={session.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-start gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 font-medium">
                          {t('security.sessions.deviceLabel', { browser: session.browser, os: session.os })}
                          {session.current && <Badge variant="secondary">{t('security.sessions.thisDevice')}</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {[
                            session.ip ? t('security.sessions.ip', { ip: session.ip }) : null,
                            t(`security.sessions.method.${session.authMethod}`, { defaultValue: session.authMethod }),
                            t('security.sessions.lastActivity', { when: formatRelativeTime(session.lastUsedAt) }),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('security.sessions.signedInAt', { when: formatDateTime(session.createdAt) })}
                        </p>
                      </div>
                    </div>
                    {session.current ? (
                      <Button variant="ghost" size="sm" className="self-start sm:self-auto" onClick={logout}>
                        {t('security.sessions.signOutHere')}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="self-start sm:self-auto"
                        disabled={revokeMutation.isPending && revokeMutation.variables === session.id}
                        onClick={() => revokeMutation.mutate(session.id)}
                      >
                        {t('security.sessions.revoke')}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOthers}
        onOpenChange={setConfirmOthers}
        title={t('security.sessions.confirmOthersTitle')}
        description={t('security.sessions.confirmOthersDescription', { count: others.length })}
        confirmLabel={t('security.sessions.revokeOthers')}
        onConfirm={() => revokeOthersMutation.mutate()}
      />
    </div>
  )
}
