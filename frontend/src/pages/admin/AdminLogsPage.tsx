import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { ScrollText, Download, ChevronLeft, ChevronRight, X, LogIn, Settings, GraduationCap } from 'lucide-react'
import { api } from '@/services/api'
import { formatDateTime } from '@/lib/utils'

const CONNECTION_ACTIONS = [
  'USER_LOGIN', 'LOGIN_FAILED', 'USER_LOGOUT', 'USER_REGISTERED',
  'SSO_LOGIN_AZURE_AD', 'SSO_LOGIN_GOOGLE', 'LDAP_LOGIN', 'PASSWORD_CHANGED',
]

const TRAITEMENT_ACTIONS = [
  'COURSE_CREATED', 'COURSE_UPDATED', 'COURSE_DELETED', 'COURSE_PUBLISHED', 'COURSE_UNPUBLISHED', 'COURSE_CLONED',
  'QUIZ_CREATED', 'QUIZ_UPDATED', 'QUIZ_DELETED',
  'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
  'COURSE_ASSIGNMENT_CREATED', 'COURSE_ASSIGNMENT_DELETED',
]

const ACTION_COLORS: Record<string, string> = {
  USER_LOGIN: 'bg-blue-100 text-blue-800',
  LOGIN_FAILED: 'bg-red-100 text-red-800',
  USER_LOGOUT: 'bg-gray-100 text-gray-800',
  USER_REGISTERED: 'bg-green-100 text-green-800',
  SSO_LOGIN_AZURE_AD: 'bg-cyan-100 text-cyan-800',
  SSO_LOGIN_GOOGLE: 'bg-cyan-100 text-cyan-800',
  LDAP_LOGIN: 'bg-cyan-100 text-cyan-800',
  PASSWORD_CHANGED: 'bg-purple-100 text-purple-800',
  USER_CREATED: 'bg-green-100 text-green-800',
  USER_UPDATED: 'bg-amber-100 text-amber-800',
  USER_DELETED: 'bg-red-100 text-red-800',
  COURSE_CREATED: 'bg-green-100 text-green-800',
  COURSE_UPDATED: 'bg-amber-100 text-amber-800',
  COURSE_DELETED: 'bg-red-100 text-red-800',
  COURSE_PUBLISHED: 'bg-emerald-100 text-emerald-800',
  COURSE_UNPUBLISHED: 'bg-orange-100 text-orange-800',
  COURSE_CLONED: 'bg-indigo-100 text-indigo-800',
  QUIZ_CREATED: 'bg-green-100 text-green-800',
  QUIZ_UPDATED: 'bg-amber-100 text-amber-800',
  QUIZ_DELETED: 'bg-red-100 text-red-800',
  QUIZ_ATTEMPT_SUBMITTED: 'bg-indigo-100 text-indigo-800',
  COURSE_ASSIGNMENT_CREATED: 'bg-green-100 text-green-800',
  COURSE_ASSIGNMENT_DELETED: 'bg-red-100 text-red-800',
}

interface LogEntry {
  id: number
  user_id: number | null
  user_name: string | null
  user_email: string | null
  action: string
  entity: string | null
  entity_id: number | null
  metadata: string | null
  created_at: string
}

function formatMetadata(metadata: string | null) {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata)
    return Object.entries(parsed)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
  } catch {
    return metadata
  }
}

export default function AdminLogsPage() {
  const { t } = useTranslation('admin')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('logs.title')}</h1>
        <p className="text-muted-foreground">
          {t('logs.subtitle')}
        </p>
      </div>

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections" className="gap-2">
            <LogIn className="h-4 w-4" />
            {t('logs.tabs.connections')}
          </TabsTrigger>
          <TabsTrigger value="processing" className="gap-2">
            <Settings className="h-4 w-4" />
            {t('logs.tabs.processing')}
          </TabsTrigger>
          <TabsTrigger value="training" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            {t('logs.tabs.training')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="mt-6">
          <EventLogTable
            actions={CONNECTION_ACTIONS}
            queryKeyPrefix="connection-logs"
            exportFilenamePrefix="connexions"
            showActionFilter
          />
        </TabsContent>

        <TabsContent value="processing" className="mt-6">
          <EventLogTable
            actions={TRAITEMENT_ACTIONS}
            queryKeyPrefix="processing-logs"
            exportFilenamePrefix="traitement"
            showActionFilter
          />
        </TabsContent>

        <TabsContent value="training" className="mt-6">
          <TrainingLogTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EventLogTable({
  actions,
  queryKeyPrefix,
  exportFilenamePrefix,
  showActionFilter,
}: {
  actions: string[]
  queryKeyPrefix: string
  exportFilenamePrefix: string
  showActionFilter?: boolean
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ userId: '', action: '', dateFrom: '', dateTo: '' })
  const [isExporting, setIsExporting] = useState(false)

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  const queryParams = { actions: actions.join(','), ...activeFilters, page, limit: 50 }

  const { data, isLoading } = useQuery({
    queryKey: [queryKeyPrefix, page, activeFilters],
    queryFn: () => api.logs.list(queryParams),
  })

  const logs: LogEntry[] = data?.data || []
  const meta = data?.meta

  const handleFilterChange = (field: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({ userId: '', action: '', dateFrom: '', dateTo: '' })
    setPage(1)
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const blob = await api.logs.export({ actions: actions.join(','), ...activeFilters })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${exportFilenamePrefix}-${Date.now()}.csv`
      document.body.appendChild(link)
      link.click()
      link.parentNode?.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch {
      toast({ title: tCommon('status.error'), description: t('logs.toasts.exportErrorDescription'), variant: 'destructive' })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={handleExport} disabled={isExporting}>
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? t('logs.exporting') : t('logs.exportCsv')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            {t('logs.filters.title')}
            {Object.keys(activeFilters).length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                {t('logs.filters.reset')}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label htmlFor={`${queryKeyPrefix}-user-id`}>{t('logs.filters.userId')}</Label>
              <Input
                id={`${queryKeyPrefix}-user-id`}
                type="number"
                value={filters.userId}
                onChange={(e) => handleFilterChange('userId', e.target.value)}
                placeholder="Ex: 12"
              />
            </div>
            {showActionFilter && (
              <div className="space-y-1">
                <Label htmlFor={`${queryKeyPrefix}-action`}>{t('logs.filters.action')}</Label>
                <select
                  id={`${queryKeyPrefix}-action`}
                  value={filters.action}
                  onChange={(e) => handleFilterChange('action', e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="">{t('logs.filters.allActions')}</option>
                  {actions.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor={`${queryKeyPrefix}-date-from`}>{t('logs.filters.from')}</Label>
              <Input
                id={`${queryKeyPrefix}-date-from`}
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${queryKeyPrefix}-date-to`}>{t('logs.filters.to')}</Label>
              <Input
                id={`${queryKeyPrefix}-date-to`}
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            {t('logs.eventTable.entriesCount', { count: meta?.total ?? 0 })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <PageLoading />
          ) : logs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{t('logs.eventTable.noResults')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">{t('logs.eventTable.date')}</th>
                    <th className="pb-2 pr-4">{t('logs.eventTable.user')}</th>
                    <th className="pb-2 pr-4">{t('logs.eventTable.action')}</th>
                    <th className="pb-2 pr-4">{t('logs.eventTable.entity')}</th>
                    <th className="pb-2">{t('logs.eventTable.details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                      <td className="py-2 pr-4">
                        {log.user_name ? (
                          <div>
                            <p className="font-medium">{log.user_name}</p>
                            <p className="text-xs text-muted-foreground">{log.user_email}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('logs.eventTable.system')}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge className={ACTION_COLORS[log.action] || 'bg-muted text-foreground'}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {log.entity ? `${log.entity}${log.entity_id ? ` #${log.entity_id}` : ''}` : '-'}
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">{formatMetadata(log.metadata) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {t('logs.eventTable.pageOf', { page: meta.page, totalPages: meta.totalPages })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface TrainingEntry {
  user_id: number
  user_name: string
  user_email: string
  course_id: number
  course_title: string
  total_seconds: number
  started_at: string | null
  last_accessed_at: string | null
  lessons_touched: number
  lessons_completed: number
  total_lessons: number
  progress_percent: number | null
  completed_at: string | null
  resume_count: number
}

function formatDuration(seconds: number, t: (key: string, options?: Record<string, unknown>) => string) {
  if (!seconds) return t('logs.trainingTable.durationMinutes', { count: 0 })
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return t('logs.trainingTable.durationHoursMinutes', { hours, minutes: minutes % 60 })
  return t('logs.trainingTable.durationMinutes', { count: minutes })
}

function TrainingLogTable() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ userId: '', courseId: '', dateFrom: '', dateTo: '' })
  const [isExporting, setIsExporting] = useState(false)

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))

  const { data, isLoading } = useQuery({
    queryKey: ['training-logs', page, activeFilters],
    queryFn: () => api.logs.training({ ...activeFilters, page, limit: 50 }),
  })

  const rows: TrainingEntry[] = data?.data || []
  const meta = data?.meta

  const handleFilterChange = (field: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({ userId: '', courseId: '', dateFrom: '', dateTo: '' })
    setPage(1)
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const blob = await api.logs.trainingExport(activeFilters)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `formations-${Date.now()}.csv`
      document.body.appendChild(link)
      link.click()
      link.parentNode?.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch {
      toast({ title: tCommon('status.error'), description: t('logs.toasts.exportErrorDescription'), variant: 'destructive' })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={handleExport} disabled={isExporting}>
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? t('logs.exporting') : t('logs.exportCsv')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            {t('logs.filters.title')}
            {Object.keys(activeFilters).length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                {t('logs.filters.reset')}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label htmlFor="training-logs-user-id">{t('logs.filters.userId')}</Label>
              <Input
                id="training-logs-user-id"
                type="number"
                value={filters.userId}
                onChange={(e) => handleFilterChange('userId', e.target.value)}
                placeholder="Ex: 12"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="training-logs-course-id">{t('logs.filters.courseId')}</Label>
              <Input
                id="training-logs-course-id"
                type="number"
                value={filters.courseId}
                onChange={(e) => handleFilterChange('courseId', e.target.value)}
                placeholder="Ex: 9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="training-logs-date-from">{t('logs.filters.lastAccessFrom')}</Label>
              <Input
                id="training-logs-date-from"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="training-logs-date-to">{t('logs.filters.lastAccessTo')}</Label>
              <Input
                id="training-logs-date-to"
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {t('logs.trainingTable.pathsCount', { count: meta?.total ?? 0 })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <PageLoading />
          ) : rows.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{t('logs.trainingTable.noResults')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">{t('logs.trainingTable.user')}</th>
                    <th className="pb-2 pr-4">{t('logs.trainingTable.training')}</th>
                    <th className="pb-2 pr-4">{t('logs.trainingTable.totalTime')}</th>
                    <th className="pb-2 pr-4">{t('logs.trainingTable.progress')}</th>
                    <th className="pb-2 pr-4">{t('logs.trainingTable.resumes')}</th>
                    <th className="pb-2">{t('logs.trainingTable.lastAccess')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.user_id}-${r.course_id}`} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 pr-4">
                        <p className="font-medium">{r.user_name}</p>
                        <p className="text-xs text-muted-foreground">{r.user_email}</p>
                      </td>
                      <td className="py-2 pr-4">{r.course_title}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDuration(r.total_seconds, t)}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2 min-w-[140px]">
                          <Progress value={r.progress_percent ?? 0} className="h-2 w-20" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {r.lessons_completed}/{r.total_lessons} · {Math.round(r.progress_percent ?? 0)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={r.resume_count > 0 ? 'default' : 'outline'}>
                          {r.resume_count}
                        </Badge>
                      </td>
                      <td className="py-2 whitespace-nowrap text-muted-foreground">
                        {r.last_accessed_at ? formatDateTime(r.last_accessed_at) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {t('logs.eventTable.pageOf', { page: meta.page, totalPages: meta.totalPages })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
