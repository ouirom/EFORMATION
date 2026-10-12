import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import {
  BarChart3,
  Users,
  BookOpen,
  Clock,
  TrendingUp,
  Award,
  ClipboardList,
  Building2,
  Eye,
  Download,
  X,
  Search,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FilterX,
  FileDown,
  CalendarRange,
} from 'lucide-react'
import { api } from '@/services/api'
import { downloadCsv } from '@/lib/csv'
import { EMPTY_CHOICE, FilterKind, cellMatches, choicesFor, parseNumberFilter } from '@/lib/reportFilters'
import {
  PERIOD_PRESETS,
  PeriodSelection,
  CustomRangeError,
  DayRange,
  formatDayKey,
  loadPeriodSelection,
  resolvePeriod,
  savePeriodSelection,
  toDayKey,
} from '@/lib/reportPeriod'
import { dateLocale } from '@/lib/utils'

// Matches backend/src/routes/report.routes.ts's `reportType` enum exactly --
// this page can only ask for report types the server actually knows how to build.
const reportTypeValues = [
  { value: 'user_progress', icon: Users },
  { value: 'course_completion', icon: BookOpen },
  { value: 'quiz_performance', icon: ClipboardList },
  { value: 'enrollment_summary', icon: TrendingUp },
  { value: 'badge_awards', icon: Award },
  { value: 'certificate_issuance', icon: Award },
  { value: 'activity_log', icon: Clock },
  { value: 'organization_overview', icon: Building2 },
]

const formatValues = ['pdf', 'excel', 'csv'] as const
type ReportFormat = (typeof formatValues)[number]
const formatExtension: Record<ReportFormat, string> = { pdf: 'pdf', excel: 'xlsx', csv: 'csv' }

// Report output languages (labels, dates, number formats) -- see backend utils/reportFormatting.ts.
const reportLanguages = ['fr', 'en'] as const
type ReportLanguage = (typeof reportLanguages)[number]

type ColumnKind = 'text' | 'number' | 'percent' | 'date' | 'datetime'

interface ReportRequest {
  reportType: string
  language: ReportLanguage
  startDate?: string
  endDate?: string
}

interface ReportPreview {
  request: ReportRequest
  rows: Record<string, any>[]
  meta: {
    title: string
    period: string
    generatedAt: string
    timeZone: string
    language: ReportLanguage
    columns: { key: string; label: string; kind: ColumnKind }[]
    rowCount: number
  }
}

const PREVIEW_PAGE_SIZE = 25

export default function AdminReportsPage() {
  const { t, i18n } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const reportTypes = reportTypeValues.map((rt) => ({
    ...rt,
    label: t(`reports.types.${rt.value}.label`),
    description: t(`reports.types.${rt.value}.description`),
  }))
  const [selectedReportType, setSelectedReportType] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('pdf')
  const [selectedLanguage, setSelectedLanguage] = useState<ReportLanguage>(
    i18n.language?.startsWith('en') ? 'en' : 'fr'
  )
  // One period for the whole page (period bar, card previews, export dialog), remembered per viewer.
  const [period, setPeriodState] = useState<PeriodSelection>(() => loadPeriodSelection())
  const setPeriod = (next: PeriodSelection) => {
    setPeriodState(next)
    savePeriodSelection(next)
  }
  const resolvedPeriod = resolvePeriod(period)
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false)
  const [preview, setPreview] = useState<ReportPreview | null>(null)

  const { data: dashboardStats, isLoading } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/analytics/dashboard')
      return response.data.data
    },
  })

  const currentRequest = (reportType = selectedReportType): ReportRequest => ({
    reportType,
    language: selectedLanguage,
    startDate: resolvedPeriod.range.start || undefined,
    endDate: resolvedPeriod.range.end || undefined,
  })

  const downloadMutation = useMutation({
    mutationFn: async ({ request, format }: { request: ReportRequest; format: ReportFormat }) => {
      const response = await api.post('/reports/generate', { ...request, format }, { responseType: 'blob' })
      return { blob: response.data as Blob, format, reportType: request.reportType }
    },
    onSuccess: ({ blob, format, reportType }) => {
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${reportType}_${new Date().toISOString().slice(0, 10)}.${formatExtension[format]}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      setIsGenerateDialogOpen(false)
      toast({ title: tCommon('status.success'), description: t('reports.toasts.generatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('reports.toasts.generateErrorDescription'), variant: 'destructive' })
    },
  })

  const previewMutation = useMutation({
    mutationFn: async (request: ReportRequest): Promise<ReportPreview> => {
      const response = await api.post('/reports/generate', { ...request, format: 'json' })
      return { request, rows: response.data.data || [], meta: response.data.meta }
    },
    onSuccess: (result) => {
      setPreview(result)
      setIsGenerateDialogOpen(false)
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('reports.toasts.previewErrorDescription'), variant: 'destructive' })
    },
  })

  const openDialogFor = (reportType: string) => {
    setSelectedReportType(reportType)
    setIsGenerateDialogOpen(true)
  }

  const getReportTypeInfo = (type: string) => reportTypes.find((r) => r.value === type)

  if (isLoading) {
    return <PageLoading />
  }

  const busy = downloadMutation.isPending || previewMutation.isPending
  const periodInvalid = resolvedPeriod.error !== null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{t('reports.title')}</h1>
          <p className="text-muted-foreground">{t('reports.subtitle')}</p>
        </div>
        <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <BarChart3 className="h-4 w-4 mr-2" />
              {t('reports.generateButton')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('reports.generateDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('reports.generateDialog.description')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-type">{t('reports.generateDialog.reportType')}</Label>
                <Select value={selectedReportType} onValueChange={setSelectedReportType}>
                  <SelectTrigger id="report-type">
                    <SelectValue placeholder={t('reports.generateDialog.selectType')} />
                  </SelectTrigger>
                  <SelectContent>
                    {reportTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="report-language">{t('reports.generateDialog.language')}</Label>
                  <Select value={selectedLanguage} onValueChange={(v) => setSelectedLanguage(v as ReportLanguage)}>
                    <SelectTrigger id="report-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {reportLanguages.map((lang) => (
                        <SelectItem key={lang} value={lang}>{t(`reports.generateDialog.languages.${lang}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="report-format">{t('reports.generateDialog.format')}</Label>
                  <Select value={selectedFormat} onValueChange={(v) => setSelectedFormat(v as ReportFormat)}>
                    <SelectTrigger id="report-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formatValues.map((f) => (
                        <SelectItem key={f} value={f}>{t(`reports.generateDialog.formats.${f}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('reports.period.label')}</Label>
                <ReportPeriodPicker idPrefix="dialog-period" value={period} onChange={setPeriod} range={resolvedPeriod.range} error={resolvedPeriod.error} />
                <p className="text-xs text-muted-foreground">{t('reports.period.dialogHint')}</p>
              </div>
              {selectedReportType && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {getReportTypeInfo(selectedReportType)?.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('reports.period.appliesTo', { field: t(`reports.period.fields.${selectedReportType}`) })}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>
                {t('reports.generateDialog.cancel')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => previewMutation.mutate(currentRequest())}
                disabled={!selectedReportType || busy || periodInvalid}
              >
                {previewMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                {t('reports.generateDialog.preview')}
              </Button>
              <Button
                onClick={() => downloadMutation.mutate({ request: currentRequest(), format: selectedFormat })}
                disabled={!selectedReportType || busy || periodInvalid}
              >
                {downloadMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                {downloadMutation.isPending ? t('reports.generateDialog.generating') : t('reports.generateDialog.download')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {preview && (
        <ReportPreviewPanel
          key={`${preview.request.reportType}-${preview.meta.generatedAt}`}
          preview={preview}
          downloading={downloadMutation.isPending}
          onDownload={(format) => downloadMutation.mutate({ request: preview.request, format })}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.users?.total || 0}</p>
                <p className="text-xs text-muted-foreground">{t('reports.stats.users')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.courses?.total || 0}</p>
                <p className="text-xs text-muted-foreground">{t('reports.stats.courses')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.enrollments?.total || 0}</p>
                <p className="text-xs text-muted-foreground">{t('reports.stats.enrollments')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.enrollments?.averageProgress || 0}%</p>
                <p className="text-xs text-muted-foreground">{t('reports.stats.completion')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.learningHours || 0}h</p>
                <p className="text-xs text-muted-foreground">{t('reports.stats.avgTime')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Award className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.certificatesIssued || 0}</p>
                <p className="text-xs text-muted-foreground">{t('reports.stats.certificates')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Types */}
      <div>
        <h2 className="text-lg font-semibold mb-4">{t('reports.availableTypes')}</h2>
        <Card className="mb-4" role="group" aria-label={t('reports.period.ariaLabel')}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t('reports.period.label')}</span>
              <span className="text-xs text-muted-foreground">{t('reports.period.hint')}</span>
            </div>
            <ReportPeriodPicker idPrefix="page-period" value={period} onChange={setPeriod} range={resolvedPeriod.range} error={resolvedPeriod.error} />
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportTypes.map((type) => (
            <Card key={type.value} className="hover:border-primary transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <type.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium">{type.label}</h3>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <CalendarRange className="h-3 w-3 shrink-0" />
                      {t('reports.period.appliesTo', { field: t(`reports.period.fields.${type.value}`) })}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || periodInvalid}
                        onClick={() => previewMutation.mutate(currentRequest(type.value))}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        {t('reports.generateDialog.preview')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openDialogFor(type.value)}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        {t('reports.cardExport')}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

    </div>
  )
}

/** Preset buttons, the two day inputs (custom preset) and the resolved range in words. */
function ReportPeriodPicker({
  idPrefix,
  value,
  onChange,
  range,
  error,
}: {
  idPrefix: string
  value: PeriodSelection
  onChange: (next: PeriodSelection) => void
  range: DayRange
  error: CustomRangeError | null
}) {
  const { t } = useTranslation('admin')
  const today = toDayKey(new Date())
  const locale = dateLocale()
  const errorId = `${idPrefix}-error`
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PERIOD_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            className="h-8"
            variant={value.preset === preset ? 'default' : 'outline'}
            aria-pressed={value.preset === preset}
            data-period-preset={preset}
            onClick={() => onChange({ ...value, preset })}
          >
            {t(`reports.period.presets.${preset}`)}
          </Button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-start`} className="text-xs">{t('reports.generateDialog.startDate')}</Label>
            <Input
              id={`${idPrefix}-start`}
              type="date"
              max={value.customEnd || today}
              value={value.customStart}
              aria-invalid={error === 'startRequired' || error === 'invalidDate' || error === 'endBeforeStart'}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => onChange({ ...value, customStart: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-end`} className="text-xs">{t('reports.generateDialog.endDate')}</Label>
            <Input
              id={`${idPrefix}-end`}
              type="date"
              min={value.customStart || undefined}
              max={today}
              value={value.customEnd}
              aria-invalid={error !== null && error !== 'startRequired'}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => onChange({ ...value, customEnd: e.target.value })}
            />
          </div>
        </div>
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">{t(`reports.period.errors.${error}`)}</p>
      ) : (
        <p className="text-sm text-muted-foreground" data-period-range>
          {range.start && range.end
            ? t('reports.period.range', { start: formatDayKey(range.start, locale), end: formatDayKey(range.end, locale) })
            : t('reports.period.allData')}
        </p>
      )}
    </div>
  )
}

const isEmpty = (value: any) => value === null || value === undefined || value === ''

/** Formats one cell like the exports do, in the report's language and the tenant's time zone. */
function formatPreviewCell(value: any, kind: ColumnKind, language: ReportLanguage, timeZone: string): string {
  if (isEmpty(value)) return '—'
  const locale = language === 'en' ? 'en-GB' : 'fr-FR'
  if (kind === 'date' || kind === 'datetime') {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return kind === 'date'
      ? date.toLocaleDateString(locale, { timeZone: 'UTC' })
      : date.toLocaleString(locale, { timeZone, dateStyle: 'short', timeStyle: 'short' })
  }
  if (typeof value === 'number') {
    const formatted = value.toLocaleString(locale, { maximumFractionDigits: 1 })
    if (kind !== 'percent') return formatted
    // French typography puts a space before %, English doesn't (same as the exports).
    return language === 'fr' ? `${formatted} %` : `${formatted}%`
  }
  return String(value)
}

/** Ascending order of two non-empty cell values: numbers numerically, text naturally ("Cours 2" < "Cours 10"). */
function compareValues(a: any, b: any): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function ReportPreviewPanel({
  preview,
  downloading,
  onDownload,
  onClose,
}: {
  preview: ReportPreview
  downloading: boolean
  onDownload: (format: ReportFormat) => void
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { rows, meta } = preview
  const [filter, setFilter] = useState('')
  // One filter per column ("header filters"), keyed by column key; '' = no filter.
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(0)

  const display = (row: Record<string, any>, key: string, kind: ColumnKind) =>
    formatPreviewCell(row[key], kind, meta.language, meta.timeZone)

  // Which filter control each column gets: an expression for numbers, a list when a
  // text column only has a few repeated values (role, category...), else free text.
  const columnFilterSpecs = useMemo(() => meta.columns.map((c) => {
    if (c.kind === 'number' || c.kind === 'percent') return { kind: 'number' as FilterKind, choices: null, hasEmpty: false }
    const displayed = rows.map((row) => (isEmpty(row[c.key]) ? '' : formatPreviewCell(row[c.key], c.kind, meta.language, meta.timeZone)))
    const choices = c.kind === 'text' ? choicesFor(displayed) : null
    const repeated = choices !== null && choices.length < rows.length
    return {
      kind: (repeated ? 'choice' : 'text') as FilterKind,
      choices: repeated ? choices : null,
      hasEmpty: displayed.includes(''),
    }
  }), [rows, meta])

  const activeColumnFilters = Object.values(columnFilters).filter((v) => v !== '').length
  const hasActiveFilters = activeColumnFilters > 0 || filter.trim() !== ''

  const setColumnFilter = (key: string, value: string) => {
    setColumnFilters((current) => ({ ...current, [key]: value }))
    setPage(0)
  }

  const clearFilters = () => {
    setColumnFilters({})
    setFilter('')
    setPage(0)
  }

  const visibleRows = useMemo(() => {
    // Filters match what is displayed (formatted dates, translated values); number
    // expressions compare the underlying number.
    const needle = filter.trim().toLowerCase()
    let result = rows.filter((row) => {
      const cells = meta.columns.map((c) => formatPreviewCell(row[c.key], c.kind, meta.language, meta.timeZone))
      if (needle && !cells.some((cell) => cell.toLowerCase().includes(needle))) return false
      return meta.columns.every((c, index) =>
        cellMatches(columnFilterSpecs[index].kind, columnFilters[c.key] ?? '', row[c.key], cells[index]))
    })
    if (sort) {
      result = [...result].sort((a, b) => {
        const [va, vb] = [a[sort.key], b[sort.key]]
        // Empty cells stay at the bottom in both directions.
        if (isEmpty(va) || isEmpty(vb)) return Number(isEmpty(va)) - Number(isEmpty(vb))
        const order = compareValues(va, vb)
        return sort.dir === 'asc' ? order : -order
      })
    }
    return result
  }, [rows, filter, columnFilters, columnFilterSpecs, sort, meta])

  const exportFilteredCsv = () => {
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(
      `${preview.request.reportType}_${t('reports.preview.filteredFileSuffix')}_${date}.csv`,
      meta.columns,
      visibleRows.map((row) => Object.fromEntries(meta.columns.map((c) => [c.key, isEmpty(row[c.key]) ? '' : display(row, c.key, c.kind)])))
    )
  }

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PREVIEW_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageRows = visibleRows.slice(currentPage * PREVIEW_PAGE_SIZE, (currentPage + 1) * PREVIEW_PAGE_SIZE)

  const toggleSort = (key: string) => {
    setPage(0)
    setSort((current) =>
      current?.key !== key ? { key, dir: 'asc' } : current.dir === 'asc' ? { key, dir: 'desc' } : null
    )
  }

  return (
    <Card className="border-primary/40" aria-label={t('reports.preview.ariaLabel')}>
      <CardHeader className="pb-3">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{meta.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t('reports.preview.summary', {
                period: meta.period,
                count: meta.rowCount,
                language: t(`reports.generateDialog.languages.${meta.language}`),
              })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('reports.period.appliesTo', { field: t(`reports.period.fields.${preview.request.reportType}`) })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {formatValues.map((format) => (
              <Button key={format} size="sm" variant="outline" disabled={downloading} onClick={() => onDownload(format)}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {t(`reports.generateDialog.formats.${format}`)}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={onClose} aria-label={t('reports.preview.close')} title={t('reports.preview.close')}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t('reports.preview.empty')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={t('reports.preview.filterPlaceholder')}
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value)
                    setPage(0)
                  }}
                />
              </div>
              {hasActiveFilters && (
                <>
                  {activeColumnFilters > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t('reports.preview.activeColumnFilters', { count: activeColumnFilters })}
                    </span>
                  )}
                  <Button size="sm" variant="ghost" onClick={clearFilters}>
                    <FilterX className="h-3.5 w-3.5 mr-1.5" />
                    {t('reports.preview.clearFilters')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportFilteredCsv} disabled={visibleRows.length === 0}>
                    <FileDown className="h-3.5 w-3.5 mr-1.5" />
                    {t('reports.preview.exportFiltered')}
                  </Button>
                </>
              )}
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {meta.columns.map((c) => {
                      const numeric = c.kind === 'number' || c.kind === 'percent'
                      return (
                        <th key={c.key} className={`px-3 py-2 font-medium whitespace-nowrap ${numeric ? 'text-right' : 'text-left'}`}>
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className="inline-flex items-center gap-1 hover:text-primary"
                            title={t('reports.preview.sortBy', { column: c.label })}
                          >
                            {c.label}
                            {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                          </button>
                        </th>
                      )
                    })}
                  </tr>
                  <tr className="border-t bg-muted/30">
                    {meta.columns.map((c, index) => {
                      const spec = columnFilterSpecs[index]
                      const value = columnFilters[c.key] ?? ''
                      const label = t('reports.preview.filterColumn', { column: c.label })
                      if (spec.kind === 'choice') {
                        return (
                          <th key={c.key} className="px-2 py-1.5 font-normal">
                            <select
                              aria-label={label}
                              value={value}
                              onChange={(e) => setColumnFilter(c.key, e.target.value)}
                              className={`h-7 w-full min-w-[7rem] rounded-md border bg-background px-1.5 text-xs ${value ? 'border-primary text-primary' : 'border-input'}`}
                            >
                              <option value="">{t('reports.preview.filterAll')}</option>
                              {spec.choices!.map((choice) => (
                                <option key={choice} value={choice}>{choice}</option>
                              ))}
                              {spec.hasEmpty && <option value={EMPTY_CHOICE}>{t('reports.preview.filterEmpty')}</option>}
                            </select>
                          </th>
                        )
                      }
                      const invalid = spec.kind === 'number' && parseNumberFilter(value) === null
                      return (
                        <th key={c.key} className="px-2 py-1.5 font-normal">
                          <Input
                            aria-label={label}
                            aria-invalid={invalid}
                            value={value}
                            onChange={(e) => setColumnFilter(c.key, e.target.value)}
                            placeholder={spec.kind === 'number' ? t('reports.preview.numberFilterPlaceholder') : t('reports.preview.textFilterPlaceholder')}
                            title={spec.kind === 'number' ? t('reports.preview.numberFilterHelp') : undefined}
                            className={`h-7 min-w-[6rem] px-2 text-xs ${spec.kind === 'number' ? 'text-right' : ''} ${invalid ? 'border-destructive focus-visible:ring-destructive' : value ? 'border-primary' : ''}`}
                          />
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, index) => (
                    <tr key={index} className="border-t hover:bg-muted/30">
                      {meta.columns.map((c) => {
                        const numeric = c.kind === 'number' || c.kind === 'percent'
                        return (
                          <td key={c.key} className={`px-3 py-1.5 ${numeric ? 'text-right tabular-nums whitespace-nowrap' : 'max-w-xs truncate'}`}>
                            {display(row, c.key, c.kind)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={meta.columns.length} className="px-3 py-6 text-center text-muted-foreground">
                        {activeColumnFilters > 0 ? t('reports.preview.noMatchFilters') : t('reports.preview.noMatch', { query: filter })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t('reports.preview.shown', { count: visibleRows.length, total: rows.length })}</span>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-8 w-8" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label={t('reports.preview.previousPage')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span>{t('reports.preview.pageOf', { page: currentPage + 1, total: pageCount })}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} aria-label={t('reports.preview.nextPage')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
