import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { formatDateTime } from '@/lib/utils'
import { api } from '@/services/api'
import { COMPLIANCE_GROUPS, LEARNING_GROUPS, PLATFORM_GROUPS, SECURITY_GROUPS } from './settingsFields'

interface HistoryEntry {
  id: number
  action: string
  entity: string
  actorName: string | null
  createdAt: string
  changes: Record<string, unknown>
}

const FIELD_LABELS = new Map(
  [...PLATFORM_GROUPS, ...SECURITY_GROUPS, ...LEARNING_GROUPS, ...COMPLIANCE_GROUPS].flatMap((g) => g.fields.map((f) => [f.key, f.labelKey] as const))
)

/** Administration > Organisation > Historique: who changed the settings and the structure. */
export function HistoryTab() {
  const { t } = useTranslation('admin')
  const { data: entries = [], isLoading } = useQuery<HistoryEntry[]>({
    queryKey: ['organization-history'],
    queryFn: async () => (await api.get('/organizations/current/history', { params: { limit: 100 } })).data.data,
  })

  if (isLoading) return <PageLoading />

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">{t('organization.history.empty')}</CardContent>
      </Card>
    )
  }

  const describe = (entry: HistoryEntry) => {
    const keys = Object.keys(entry.changes || {})
    if (entry.action === 'SETTINGS_UPDATED') {
      return keys.map((key) => (FIELD_LABELS.has(key) ? t(FIELD_LABELS.get(key)!) : key)).join(', ')
    }
    if (entry.action === 'ORG_UNIT_DELETED') return String(entry.changes?.name ?? '')
    return ''
  }

  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {entries.map((entry) => (
          <div key={entry.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground sm:w-48 shrink-0">
              <History className="h-4 w-4" />
              {formatDateTime(entry.createdAt)}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{t(`organization.history.actions.${entry.action}`, { defaultValue: entry.action })}</Badge>
                <span className="text-sm">{entry.actorName || t('organization.history.system')}</span>
              </div>
              {describe(entry) && <p className="text-sm text-muted-foreground break-words">{describe(entry)}</p>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
