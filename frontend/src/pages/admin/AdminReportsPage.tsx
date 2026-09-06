import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
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
} from 'lucide-react'
import { api } from '@/services/api'

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
const formatExtension: Record<(typeof formatValues)[number], string> = { pdf: 'pdf', excel: 'xlsx', csv: 'csv' }

export default function AdminReportsPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const reportTypes = reportTypeValues.map((rt) => ({
    ...rt,
    label: t(`reports.types.${rt.value}.label`),
    description: t(`reports.types.${rt.value}.description`),
  }))
  const [selectedReportType, setSelectedReportType] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<(typeof formatValues)[number]>('pdf')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false)

  const { data: dashboardStats, isLoading } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/analytics/dashboard')
      return response.data.data
    },
  })

  const generateMutation = useMutation({
    mutationFn: async (data: { reportType: string; format: string; startDate?: string; endDate?: string }) => {
      const response = await api.post('/reports/generate', data, { responseType: 'blob' })
      return { blob: response.data as Blob, format: data.format, reportType: data.reportType }
    },
    onSuccess: ({ blob, format, reportType }) => {
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${reportType}_${new Date().toISOString().slice(0, 10)}.${formatExtension[format as keyof typeof formatExtension]}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      setIsGenerateDialogOpen(false)
      setSelectedReportType('')
      setDateRange({ start: '', end: '' })
      toast({ title: tCommon('status.success'), description: t('reports.toasts.generatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('reports.toasts.generateErrorDescription'), variant: 'destructive' })
    },
  })

  const handleGenerate = () => {
    generateMutation.mutate({
      reportType: selectedReportType,
      format: selectedFormat,
      startDate: dateRange.start || undefined,
      endDate: dateRange.end || undefined,
    })
  }

  const getReportTypeInfo = (type: string) => {
    return reportTypes.find((r) => r.value === type)
  }

  if (isLoading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
              <div className="space-y-2">
                <Label htmlFor="report-format">{t('reports.generateDialog.format')}</Label>
                <Select value={selectedFormat} onValueChange={(v) => setSelectedFormat(v as typeof selectedFormat)}>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="report-start-date">{t('reports.generateDialog.startDate')}</Label>
                  <Input
                    id="report-start-date"
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="report-end-date">{t('reports.generateDialog.endDate')}</Label>
                  <Input
                    id="report-end-date"
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  />
                </div>
              </div>
              {selectedReportType && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {getReportTypeInfo(selectedReportType)?.description}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>
                {t('reports.generateDialog.cancel')}
              </Button>
              <Button onClick={handleGenerate} disabled={!selectedReportType || generateMutation.isPending}>
                {generateMutation.isPending ? t('reports.generateDialog.generating') : t('reports.generateDialog.generate')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportTypes.map((type) => (
            <Card key={type.value} className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => {
                    setSelectedReportType(type.value)
                    setIsGenerateDialogOpen(true)
                  }}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <type.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{type.label}</h3>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
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
