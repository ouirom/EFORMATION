import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, LogOut, Search, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { QueryError } from '@/components/ui/query-error'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/services/api'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'

/** One row of GET /security/login-events. */
interface LoginEvent {
  id: number
  action: string
  group: 'success' | 'failure' | 'lockout' | 'twoFactor' | 'session'
  createdAt: string
  subject: { id: number; name: string; email: string; role: string } | null
  actor: { id: number; name: string } | null
  reason: string | null
  ip: string | null
  browser: string | null
  details: Record<string, any>
}

interface SuspiciousIp {
  ip: string
  failures: number
  accounts: number
  lastAt: string
}

const GROUP_STYLE: Record<LoginEvent['group'], string> = {
  success: 'bg-emerald-100 text-emerald-800',
  failure: 'bg-red-100 text-red-800',
  lockout: 'bg-amber-100 text-amber-800',
  twoFactor: 'bg-indigo-100 text-indigo-800',
  session: 'bg-slate-100 text-slate-800',
}

// The worst events stand out whatever their group.
const ALERT_ACTIONS = ['SESSION_REUSE_DETECTED', 'NOT_ME_REPORTED', 'ACCOUNT_LOCKED']

const PERIODS = ['24h', '7d', '30d', '90d']
const RESULTS = ['', 'success', 'failure', 'lockout', 'twoFactor', 'session']

/**
 * Administration > Connexions (admins): recent sign-in events of the
 * organization (successes, failures with their reason, lockouts, two-step
 * verification, closed sessions, stolen tokens), the IPs with many failures,
 * and a shortcut to sign an account out everywhere.
 */
export default function AdminConnectionsPage() {
  const { t } = useTranslation('admin')
  const { user } = useAuth()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('7d')
  const [result, setResult] = useState('')
  const [page, setPage] = useState(1)
  const [pendingLogout, setPendingLogout] = useState<LoginEvent['subject']>(null)

  const eventsQuery = useQuery<{ data: LoginEvent[]; meta: { page: number; totalPages: number; total: number } }>({
    queryKey: ['login-events', search, period, result, page],
    queryFn: async () => (await api.get('/security/login-events', { params: { search: search || undefined, period, result: result || undefined, page, limit: 25 } })).data,
  })

  const suspiciousQuery = useQuery<SuspiciousIp[]>({
    queryKey: ['suspicious-ips'],
    queryFn: async () => (await api.get('/security/suspicious-ips')).data.data,
  })

  const forceLogoutMutation = useMutation({
    mutationFn: (userId: number) => api.post(`/users/${userId}/force-logout`),
    onSuccess: (response) => {
      toast({
        title: t('users.toasts.forcedLogoutTitle'),
        description: t('users.toasts.forcedLogoutDescription', { count: response.data.data.closedSessions }),
      })
      eventsQuery.refetch()
    },
    onError: (error: any) =>
      toast({ title: t('connections.error'), description: error?.response?.data?.error?.message, variant: 'destructive' }),
  })

  const events = eventsQuery.data?.data ?? []
  const meta = eventsQuery.data?.meta
  const suspicious = suspiciousQuery.data ?? []

  const describe = (event: LoginEvent) => {
    const parts: string[] = []
    if (event.reason) parts.push(t(`connections.reasons.${event.reason}`, { defaultValue: event.reason }))
    if (event.details.minutes) parts.push(t('connections.details.lockedFor', { count: event.details.minutes }))
    if (event.details.remainingAttempts !== undefined && event.details.remainingAttempts !== null) {
      parts.push(t('connections.details.remainingAttempts', { count: event.details.remainingAttempts }))
    }
    if (event.details.closedSessions !== undefined && event.details.closedSessions !== null) {
      parts.push(t('connections.details.closedSessions', { count: event.details.closedSessions }))
    }
    if (event.details.twoFactor) parts.push(t('connections.details.withTwoFactor'))
    if (event.actor) parts.push(t('connections.details.by', { name: event.actor.name }))
    return parts.join(' · ')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('connections.title')}</h1>
        <p className="text-muted-foreground">{t('connections.subtitle')}</p>
      </div>

      <Card className={suspicious.length > 0 ? 'border-amber-300' : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className={`h-5 w-5 ${suspicious.length > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
            {t('connections.suspicious.title')}
          </CardTitle>
          <CardDescription>{t('connections.suspicious.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {suspiciousQuery.isError ? (
            <QueryError onRetry={() => suspiciousQuery.refetch()} className="py-4" />
          ) : suspicious.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('connections.suspicious.none')}</p>
          ) : (
            <ul className="divide-y" data-testid="suspicious-ips">
              {suspicious.map((row) => (
                <li key={row.ip} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-mono font-medium">{row.ip}</span>
                  <span className="text-muted-foreground">
                    {t('connections.suspicious.row', { count: row.failures, accounts: row.accounts, when: formatRelativeTime(row.lastAt) })}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setResult('failure'); setPeriod('24h'); setPage(1) }}>
                    {t('connections.suspicious.showFailures')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('connections.events.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="connections-search">{t('connections.filters.user')}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="connections-search"
                  className="pl-9"
                  value={search}
                  placeholder={t('connections.filters.userPlaceholder')}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="connections-period">{t('connections.filters.period')}</Label>
              <select
                id="connections-period"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={period}
                onChange={(e) => { setPeriod(e.target.value); setPage(1) }}
              >
                {PERIODS.map((value) => <option key={value} value={value}>{t(`connections.periods.${value}`)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="connections-result">{t('connections.filters.result')}</Label>
              <select
                id="connections-result"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={result}
                onChange={(e) => { setResult(e.target.value); setPage(1) }}
              >
                {RESULTS.map((value) => <option key={value} value={value}>{t(`connections.results.${value || 'all'}`)}</option>)}
              </select>
            </div>
          </div>

          {eventsQuery.isError ? (
            <QueryError onRetry={() => eventsQuery.refetch()} />
          ) : eventsQuery.isLoading ? (
            <PageLoading />
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('connections.events.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="login-events">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">{t('connections.columns.date')}</th>
                    <th className="p-3 font-medium">{t('connections.columns.event')}</th>
                    <th className="p-3 font-medium">{t('connections.columns.user')}</th>
                    <th className="p-3 font-medium">{t('connections.columns.details')}</th>
                    <th className="p-3 font-medium">{t('connections.columns.origin')}</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b align-top last:border-0">
                      <td className="whitespace-nowrap p-3 text-muted-foreground">{formatDateTime(event.createdAt)}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`border-transparent ${GROUP_STYLE[event.group] ?? GROUP_STYLE.session}`}>
                          {ALERT_ACTIONS.includes(event.action) && <AlertTriangle className="mr-1 h-3 w-3" />}
                          {t(`connections.actions.${event.action}`, { defaultValue: event.action })}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {event.subject ? (
                          <>
                            <p className="font-medium">{event.subject.name}</p>
                            <p className="text-xs text-muted-foreground">{event.subject.email}</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">{t('connections.unknownAccount')}</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{describe(event) || '—'}</td>
                      <td className="p-3 text-muted-foreground">
                        {event.ip && <p className="font-mono text-xs">{event.ip}</p>}
                        {event.browser && <p className="text-xs">{event.browser}</p>}
                      </td>
                      <td className="p-3 text-right">
                        {event.subject && event.subject.id !== user?.id && event.subject.role !== 'super_admin' && (
                          <Button variant="ghost" size="sm" onClick={() => setPendingLogout(event.subject)} title={t('users.rowActions.forceLogout')}>
                            <LogOut className="h-4 w-4" />
                            <span className="sr-only">{t('users.rowActions.forceLogout')}</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('connections.events.pageOf', { page: meta.page, totalPages: meta.totalPages, total: meta.total })}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pendingLogout}
        onOpenChange={(open) => !open && setPendingLogout(null)}
        title={t('users.forceLogoutDialog.title')}
        description={t('users.forceLogoutDialog.description', { name: pendingLogout?.name || pendingLogout?.email })}
        confirmLabel={t('users.rowActions.forceLogout')}
        onConfirm={() => {
          if (pendingLogout) forceLogoutMutation.mutate(pendingLogout.id)
          setPendingLogout(null)
        }}
      />
    </div>
  )
}
