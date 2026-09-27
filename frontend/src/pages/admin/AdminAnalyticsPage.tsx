import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import {
  Users,
  BookOpen,
  Clock,
  Award,
  ArrowUp,
  ArrowDown,
  Calendar,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/services/api'
import { useCategoryLabel } from '@/lib/categories'
import { buildAnalyticsWorkbook, downloadBlob, ExcelSection } from '@/lib/excelExport'
import { renderBarChartPNG, renderLineChartPNG, renderPieChartPNG } from '@/lib/charts'

const CHART_PALETTE = ['#1E2761', '#FF6B4A', '#2F9E44', '#F0B429', '#5B8DEF', '#E64980', '#12B886', '#845EF7']

interface DailyCount {
  date: string
  count: number
}

// Falls back to a human-readable version of a raw action code (e.g.
// 'QUIZ_ATTEMPT_SUBMITTED' -> 'Quiz attempt submitted') for any audit-log
// action not covered by the admin.analytics.activityChart.actions.* map --
// covers historical/seeded actions that no longer exist in the code.
function humanizeActionCode(action: string): string {
  const lower = action.replace(/_/g, ' ').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// Buckets a sparse day->count series into at most `maxBuckets` evenly-sized
// buckets covering the last `days` days, so the chart stays readable whether
// the selected period is 7 days (one bar per day) or 365 (~monthly bars).
function buildActivityBuckets(dailyCounts: DailyCount[], days: number, maxBuckets = 30) {
  const countByDate = new Map(dailyCounts.map((d) => [d.date.slice(0, 10), Number(d.count) || 0]))
  const numBuckets = Math.max(1, Math.min(days, maxBuckets))
  const bucketSizeDays = days / numBuckets
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const buckets: { date: Date; count: number }[] = []
  for (let b = numBuckets - 1; b >= 0; b--) {
    const bucketEnd = new Date(today.getTime() - b * bucketSizeDays * 24 * 60 * 60 * 1000)
    const bucketStart = new Date(bucketEnd.getTime() - bucketSizeDays * 24 * 60 * 60 * 1000)
    let sum = 0
    for (let d = new Date(bucketStart); d < bucketEnd; d.setDate(d.getDate() + 1)) {
      sum += countByDate.get(d.toISOString().slice(0, 10)) || 0
    }
    buckets.push({ date: bucketEnd, count: sum })
  }
  return buckets
}

export default function AdminAnalyticsPage() {
  const { t, i18n } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const categoryLabel = useCategoryLabel()
  const [period, setPeriod] = useState('30')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics', period],
    queryFn: () => api.analytics.getAdminDashboard(`${period}d`),
  })

  const { data: courseAnalytics } = useQuery({
    queryKey: ['admin-analytics-course-breakdown'],
    queryFn: async () => (await api.get('/analytics/courses')).data.data,
  })

  const { data: userAnalytics } = useQuery({
    queryKey: ['admin-analytics-user-breakdown'],
    queryFn: async () => (await api.get('/analytics/users')).data.data,
  })

  const { data: courses = [] } = useQuery({
    queryKey: ['admin-analytics-courses'],
    queryFn: () => api.courses.list({ limit: 100 }),
  })

  const [showDailyDetail, setShowDailyDetail] = useState(false)
  const [dropoffCourseId, setDropoffCourseId] = useState<string>('')
  const [isExporting, setIsExporting] = useState(false)

  const { data: dropoff, isLoading: dropoffLoading } = useQuery({
    queryKey: ['course-lesson-dropoff', dropoffCourseId],
    queryFn: async () => {
      const response = await api.get(`/analytics/courses/${dropoffCourseId}/lesson-dropoff`)
      return response.data.data
    },
    enabled: !!dropoffCourseId,
  })

  if (isLoading) {
    return <PageLoading />
  }

  const days = data?.days ?? Number(period)
  const stats = {
    totalUsers: data?.users?.total ?? 0,
    activeUsers: data?.users?.active ?? 0,
    totalCourses: data?.courses?.total ?? 0,
    completedCourses: data?.completions?.total ?? 0,
    totalHours: data?.learningHours ?? 0,
    avgCompletionRate: data?.enrollments?.averageProgress ?? 0,
    newUsersThisMonth: data?.users?.new ?? 0,
    coursesThisMonth: data?.courses?.new ?? 0,
    trends: {
      users: data?.trends?.users ?? 0,
      courses: data?.trends?.completedCourses ?? 0,
      hours: data?.trends?.hours ?? 0,
      completion: data?.trends?.completionRate ?? 0,
    },
  }

  const activityBuckets = buildActivityBuckets(data?.dailyLogins ?? [], days)
  const maxBucketCount = Math.max(1, ...activityBuckets.map((b) => b.count))
  const dateLabel = (d: Date) => d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })

  const recentActivity: Array<{ action: string; count: number }> = data?.recentActivity ?? []
  const maxActionCount = Math.max(1, ...recentActivity.map((a) => Number(a.count)))
  const actionLabel = (action: string) =>
    t(`analytics.activityChart.actions.${action}`, { defaultValue: humanizeActionCode(action) })

  const mostActiveUsers: Array<{ id: number; display_name: string; email: string; activity_count: number }> =
    userAnalytics?.mostActive ?? []

  const dailyLoginsRaw: DailyCount[] = (data?.dailyLogins ?? [])
    .slice()
    .sort((a: DailyCount, b: DailyCount) => (a.date < b.date ? 1 : -1))

  const categories: Array<{ category: string | null; count: number }> = courseAnalytics?.byCategory ?? []
  const totalCategorized = categories.reduce((sum, c) => sum + Number(c.count), 0) || 1

  const usersByRole: Array<{ role: string; count: number }> = userAnalytics?.byRole ?? []
  const totalRoleUsers = usersByRole.reduce((sum, r) => sum + Number(r.count), 0)
  const roleLabelKey = (role: string) => (role === 'super_admin' ? 'superAdmin' : role)

  const popularCourses: Array<{ id: number; title: string; enrollment_count: number; completions: number }> = (
    courseAnalytics?.ranking ?? []
  )
    .filter((c: any) => Number(c.enrollment_count) > 0)
    .slice(0, 5)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const categoryLabels = categories.map((c) => c.category ? categoryLabel(c.category) : t('analytics.distribution.uncategorized'))
      const categoryValues = categories.map((c) => Number(c.count))

      const topCourses = (courseAnalytics?.ranking ?? [])
        .slice()
        .sort((a: any, b: any) => Number(b.enrollment_count) - Number(a.enrollment_count))
        .slice(0, 8)

      const roleRows = usersByRole
        .slice()
        .sort((a, b) => Number(b.count) - Number(a.count))
      const roleLabelsTranslated = roleRows.map((r) =>
        t(`users.roles.${roleLabelKey(r.role)}`, { defaultValue: r.role })
      )

      // Chronological (oldest -> newest) for a readable trend line, independent
      // of the table's most-recent-first order.
      const dailyChrono = dailyLoginsRaw.slice().reverse()

      const sections: ExcelSection[] = [
        {
          sheetName: t('analytics.csv.sections.keyMetrics').slice(0, 31),
          title: t('analytics.csv.sections.keyMetrics'),
          columns: [
            { key: 'metric', label: t('analytics.csv.metric'), width: 32 },
            { key: 'value', label: t('analytics.csv.value'), width: 16 },
          ],
          rows: [
            { metric: t('analytics.csv.totalUsers'), value: stats.totalUsers },
            { metric: t('analytics.csv.activeUsers'), value: stats.activeUsers },
            { metric: t('analytics.csv.newUsers'), value: stats.newUsersThisMonth },
            { metric: t('analytics.csv.totalCourses'), value: stats.totalCourses },
            { metric: t('analytics.csv.newCourses'), value: stats.coursesThisMonth },
            { metric: t('analytics.csv.completedCourses'), value: stats.completedCourses },
            { metric: t('analytics.csv.avgProgress'), value: stats.avgCompletionRate },
            { metric: t('analytics.stats.learningHours'), value: stats.totalHours },
          ],
        },
        {
          sheetName: t('analytics.csv.sections.categoryDistribution').slice(0, 31),
          title: t('analytics.csv.sections.categoryDistribution'),
          chartDataUrl: categoryLabels.length
            ? renderPieChartPNG({ labels: categoryLabels, values: categoryValues, colors: CHART_PALETTE })
            : undefined,
          chartWidthPx: 520,
          chartHeightPx: 260,
          columns: [
            { key: 'category', label: t('analytics.csv.columns.category'), width: 26 },
            { key: 'count', label: t('analytics.csv.columns.count'), width: 12 },
            { key: 'percent', label: t('analytics.csv.columns.percent'), width: 14 },
          ],
          rows: categories.map((item) => ({
            category: item.category ? categoryLabel(item.category) : t('analytics.distribution.uncategorized'),
            count: item.count,
            percent: Math.round((Number(item.count) / totalCategorized) * 100),
          })),
        },
        {
          sheetName: t('analytics.csv.sections.popularCourses').slice(0, 31),
          title: t('analytics.csv.sections.popularCourses'),
          chartDataUrl: topCourses.length
            ? renderBarChartPNG({
                labels: topCourses.map((c: any) => c.title),
                values: topCourses.map((c: any) => Number(c.enrollment_count)),
                color: CHART_PALETTE[1],
              })
            : undefined,
          chartWidthPx: 640,
          chartHeightPx: Math.max(160, 46 * topCourses.length + 30),
          columns: [
            { key: 'course', label: t('analytics.csv.columns.course'), width: 32 },
            { key: 'enrollments', label: t('analytics.csv.columns.enrollments'), width: 14 },
            { key: 'completions', label: t('analytics.csv.columns.completions'), width: 14 },
            { key: 'completionPercent', label: t('analytics.csv.columns.completionPercent'), width: 18 },
          ],
          rows: (courseAnalytics?.ranking ?? []).map((course: any) => ({
            course: course.title,
            enrollments: course.enrollment_count,
            completions: course.completions,
            completionPercent: Number(course.enrollment_count) > 0
              ? Math.round((Number(course.completions) / Number(course.enrollment_count)) * 100)
              : 0,
          })),
        },
        {
          sheetName: t('analytics.csv.sections.usersByRole').slice(0, 31),
          title: t('analytics.csv.sections.usersByRole'),
          chartDataUrl: roleRows.length
            ? renderBarChartPNG({
                labels: roleLabelsTranslated,
                values: roleRows.map((r) => Number(r.count)),
                color: CHART_PALETTE[4],
              })
            : undefined,
          chartWidthPx: 640,
          chartHeightPx: Math.max(160, 46 * roleRows.length + 30),
          columns: [
            { key: 'role', label: t('analytics.csv.columns.role'), width: 22 },
            { key: 'count', label: t('analytics.csv.columns.count'), width: 12 },
          ],
          rows: roleRows.map((item, i) => ({
            role: roleLabelsTranslated[i],
            count: item.count,
          })),
        },
        {
          sheetName: t('analytics.csv.sections.dailyActivity').slice(0, 31),
          title: t('analytics.csv.sections.dailyActivity'),
          chartDataUrl: dailyChrono.length
            ? renderLineChartPNG({
                labels: dailyChrono.map((d) => new Date(d.date).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })),
                values: dailyChrono.map((d) => Number(d.count)),
                color: CHART_PALETTE[0],
              })
            : undefined,
          chartWidthPx: 640,
          chartHeightPx: 260,
          columns: [
            { key: 'date', label: t('analytics.csv.columns.date'), width: 16 },
            { key: 'logins', label: t('analytics.csv.columns.logins'), width: 14 },
          ],
          rows: dailyLoginsRaw.map((d) => ({ date: d.date.slice(0, 10), logins: d.count })),
        },
      ]

      if (dropoffCourseId && dropoff?.funnel?.length > 0) {
        const funnel = dropoff.funnel as any[]
        sections.push({
          sheetName: t('analytics.csv.sections.dropoffFunnel').slice(0, 31),
          title: t('analytics.csv.sections.dropoffFunnel'),
          chartDataUrl: renderBarChartPNG({
            labels: funnel.map((l) => `${l.position}. ${l.lessonTitle}`),
            values: funnel.map((l) => Number(l.reachRatePercent)),
            color: CHART_PALETTE[2],
            valueSuffix: '%',
          }),
          chartWidthPx: 640,
          chartHeightPx: Math.max(160, 46 * funnel.length + 30),
          columns: [
            { key: 'lesson', label: t('analytics.csv.columns.lesson'), width: 34 },
            { key: 'module', label: t('analytics.csv.columns.module'), width: 24 },
            { key: 'completions', label: t('analytics.csv.columns.completions'), width: 14 },
            { key: 'reachRate', label: t('analytics.csv.columns.reachRate'), width: 16 },
            { key: 'dropFromPrevious', label: t('analytics.csv.columns.dropFromPrevious'), width: 16 },
          ],
          rows: funnel.map((lesson) => ({
            lesson: `${lesson.position}. ${lesson.lessonTitle}`,
            module: lesson.moduleTitle,
            completions: lesson.completedCount,
            reachRate: lesson.reachRatePercent,
            dropFromPrevious: lesson.dropFromPrevious,
          })),
        })
      }

      const blob = await buildAnalyticsWorkbook(sections)
      downloadBlob(`analytics-${Date.now()}.xlsx`, blob)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('analytics.title')}</h1>
          <p className="text-muted-foreground">
            {t('analytics.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[150px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('analytics.periods.7')}</SelectItem>
              <SelectItem value="30">{t('analytics.periods.30')}</SelectItem>
              <SelectItem value="90">{t('analytics.periods.90')}</SelectItem>
              <SelectItem value="365">{t('analytics.periods.365')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? t('analytics.exporting') : t('analytics.export')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('analytics.stats.activeUsers')}
          value={stats.activeUsers}
          subtitle={t('analytics.stats.totalSuffix', { count: stats.totalUsers })}
          trend={stats.trends.users}
          icon={Users}
        />
        <StatCard
          title={t('analytics.stats.completedCourses')}
          value={stats.completedCourses}
          subtitle={t('analytics.stats.coursesAvailable', { count: stats.totalCourses })}
          trend={stats.trends.courses}
          icon={BookOpen}
        />
        <StatCard
          title={t('analytics.stats.learningHours')}
          value={`${stats.totalHours}h`}
          subtitle={t('analytics.stats.thisMonth')}
          trend={stats.trends.hours}
          icon={Clock}
        />
        <StatCard
          title={t('analytics.stats.completionRate')}
          value={`${stats.avgCompletionRate}%`}
          subtitle={t('analytics.stats.globalAverage')}
          trend={stats.trends.completion}
          icon={Award}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.activityChart.title')}</CardTitle>
            <CardDescription>{t('analytics.activityChart.description', { days })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-between gap-1">
              {activityBuckets.map((bucket, i) => {
                const height = bucket.count === 0 ? 2 : Math.max(4, (bucket.count / maxBucketCount) * 100)
                return (
                  <div
                    key={i}
                    title={`${dateLabel(bucket.date)} — ${bucket.count}`}
                    className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-t"
                    style={{ height: `${height}%` }}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{dateLabel(activityBuckets[0].date)}</span>
              <span>{dateLabel(activityBuckets[Math.floor(activityBuckets.length / 2)].date)}</span>
              <span>{dateLabel(activityBuckets[activityBuckets.length - 1].date)}</span>
            </div>

            {/* Breakdown by action type */}
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-semibold mb-3">{t('analytics.activityChart.byActionType')}</h4>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('analytics.activityChart.noActivity')}</p>
              ) : (
                <div className="space-y-2">
                  {recentActivity.map((item) => (
                    <div key={item.action} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{actionLabel(item.action)}</span>
                        <span className="font-medium">{item.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full transition-all"
                          style={{ width: `${(Number(item.count) / maxActionCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Most active users */}
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-semibold">{t('analytics.activityChart.mostActiveUsers')}</h4>
              <p className="text-xs text-muted-foreground mb-3">{t('analytics.activityChart.mostActiveSubtitle')}</p>
              {mostActiveUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tCommon('misc.noResults')}</p>
              ) : (
                <div className="space-y-2">
                  {mostActiveUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{user.display_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 ml-2">
                        {t('analytics.activityChart.actionsSuffix', { count: user.activity_count })}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Day-by-day detail */}
            <div className="mt-6 pt-4 border-t">
              <button
                type="button"
                onClick={() => setShowDailyDetail((v) => !v)}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {showDailyDetail ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showDailyDetail
                  ? t('analytics.activityChart.hideDailyDetail')
                  : t('analytics.activityChart.viewDailyDetail')}
              </button>
              {showDailyDetail && (
                <div className="mt-3 max-h-56 overflow-y-auto border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50">
                      <tr>
                        <th className="text-left font-medium p-2">{t('analytics.activityChart.dailyDetailDate')}</th>
                        <th className="text-right font-medium p-2">{t('analytics.activityChart.dailyDetailCount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyLoginsRaw.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-2 text-center text-muted-foreground">
                            {t('analytics.activityChart.noActivity')}
                          </td>
                        </tr>
                      ) : (
                        dailyLoginsRaw.map((d) => (
                          <tr key={d.date} className="border-t">
                            <td className="p-2">{new Date(d.date).toLocaleDateString(i18n.language)}</td>
                            <td className="p-2 text-right">{d.count}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Courses Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.distribution.title')}</CardTitle>
            <CardDescription>{t('analytics.distribution.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categories.map((item) => {
                const label = item.category ? categoryLabel(item.category) : t('analytics.distribution.uncategorized')
                const percent = Math.round((Number(item.count) / totalCategorized) * 100)
                return (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <span className="font-medium">{percent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed analytics */}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">{t('analytics.tabs.users')}</TabsTrigger>
          <TabsTrigger value="courses">{t('analytics.tabs.courses')}</TabsTrigger>
          <TabsTrigger value="engagement">{t('analytics.tabs.engagement')}</TabsTrigger>
          <TabsTrigger value="dropoff">{t('analytics.tabs.dropoff')}</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.newUsers.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.newUsersThisMonth}</div>
                <p className="text-sm text-muted-foreground">{t('analytics.newUsers.thisMonth')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.usersByRole.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {usersByRole
                    .slice()
                    .sort((a, b) => Number(b.count) - Number(a.count))
                    .map((item) => (
                      <div key={item.role} className="flex items-center justify-between">
                        <span className="text-sm">
                          {t(`users.roles.${roleLabelKey(item.role)}`, { defaultValue: item.role })}
                        </span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  {totalRoleUsers === 0 && (
                    <p className="text-sm text-muted-foreground">{tCommon('misc.noResults')}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="courses" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.popularCourses.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {popularCourses.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('analytics.popularCourses.noData')}</p>
              ) : (
                <div className="space-y-4">
                  {popularCourses.map((course) => {
                    const completionPercent = course.enrollment_count > 0
                      ? Math.round((Number(course.completions) / Number(course.enrollment_count)) * 100)
                      : 0
                    return (
                      <div key={course.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium">{course.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {t('analytics.popularCourses.enrollments', { count: course.enrollment_count })}
                          </p>
                        </div>
                        <Badge variant={completionPercent >= 80 ? 'default' : 'secondary'}>
                          {t('analytics.popularCourses.completion', { percent: completionPercent })}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engagement" className="mt-4">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-4xl font-bold text-primary">{data?.quizzes?.totalAttempts ?? 0}</div>
                <p className="text-sm text-muted-foreground mt-2">
                  {t('analytics.engagement.quizAttempts')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-4xl font-bold text-primary">{data?.quizzes?.averageScore ?? 0}%</div>
                <p className="text-sm text-muted-foreground mt-2">
                  {t('analytics.engagement.avgScore')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-4xl font-bold text-primary">{data?.quizzes?.passRate ?? 0}%</div>
                <p className="text-sm text-muted-foreground mt-2">
                  {t('analytics.engagement.passRate')}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="dropoff" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.dropoff.title')}</CardTitle>
              <CardDescription>
                {t('analytics.dropoff.description')}
              </CardDescription>
              <div className="pt-2">
                <Select value={dropoffCourseId} onValueChange={setDropoffCourseId}>
                  <SelectTrigger className="w-full md:w-[320px]">
                    <SelectValue placeholder={t('analytics.dropoff.choosePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course: any) => (
                      <SelectItem key={course.id} value={String(course.id)}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {!dropoffCourseId && (
                <p className="text-sm text-muted-foreground">{t('analytics.dropoff.selectPrompt')}</p>
              )}
              {dropoffCourseId && dropoffLoading && <PageLoading />}
              {dropoffCourseId && dropoff && dropoff.funnel.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('analytics.dropoff.noLessons')}</p>
              )}
              {dropoffCourseId && dropoff && dropoff.funnel.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t('analytics.dropoff.enrolledTotal', { count: dropoff.enrolledTotal })}
                  </p>
                  {dropoff.funnel.map((lesson: any) => (
                    <div key={lesson.lessonId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>
                          {lesson.position}. {lesson.lessonTitle}
                          <span className="text-muted-foreground"> — {lesson.moduleTitle}</span>
                        </span>
                        <span className="font-medium">
                          {lesson.completedCount} ({lesson.reachRatePercent}%)
                          {lesson.dropFromPrevious > 0 && (
                            <span className="text-red-600 ml-2">-{lesson.dropFromPrevious}</span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            lesson.reachRatePercent >= 70 ? 'bg-green-500' : lesson.reachRatePercent >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${lesson.reachRatePercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
}: {
  title: string
  value: string | number
  subtitle: string
  trend: number
  icon: React.ComponentType<any>
}) {
  const isPositive = trend >= 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          <div
            className={`flex items-center text-xs ${
              isPositive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {isPositive ? (
              <ArrowUp className="h-3 w-3 mr-1" />
            ) : (
              <ArrowDown className="h-3 w-3 mr-1" />
            )}
            {Math.abs(trend)}%
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
