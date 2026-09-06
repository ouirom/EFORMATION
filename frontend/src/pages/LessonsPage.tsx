import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageLoading } from '@/components/ui/loading'
import { QueryError } from '@/components/ui/query-error'
import { LessonRow } from '@/components/LessonRow'
import { History, Library, Search, Target, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/services/api'

const PAGE_SIZE = 20

export default function LessonsPage() {
  const { t } = useTranslation('dashboard')
  const [activeTab, setActiveTab] = useState('inProgress')
  const [courseFilter, setCourseFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Lightweight counts for the tab badges -- each just needs meta.total, not the rows.
  const { data: counts } = useQuery({
    queryKey: ['lesson-catalog-counts'],
    queryFn: async () => {
      const [inProgress, mandatory, all] = await Promise.all([
        api.lessons.catalog({ status: 'in_progress', limit: 1 }),
        api.lessons.catalog({ mandatory: true, limit: 1 }),
        api.lessons.catalog({ limit: 1 }),
      ])
      return {
        inProgress: inProgress.meta?.total || 0,
        mandatory: mandatory.meta?.total || 0,
        all: all.meta?.total || 0,
      }
    },
    staleTime: 10 * 1000,
  })

  const filters =
    activeTab === 'inProgress' ? { status: 'in_progress' } :
    activeTab === 'mandatory' ? { mandatory: true } :
    {}

  const { data: pageData, isLoading, error, refetch } = useQuery({
    queryKey: ['lesson-catalog-page', activeTab, courseFilter, page],
    queryFn: () => api.lessons.catalog({
      ...filters,
      courseId: courseFilter !== 'all' ? parseInt(courseFilter, 10) : undefined,
      page,
      limit: PAGE_SIZE,
    }),
    staleTime: 10 * 1000,
  })

  const lessons = (pageData?.data || []).filter((l: any) =>
    !search.trim() || l.title.toLowerCase().includes(search.trim().toLowerCase())
  )
  const totalPages = pageData?.meta?.totalPages || 1

  // The course filter's own option list has to come from an unfiltered fetch, otherwise
  // picking a course would narrow the very list used to populate the dropdown.
  const { data: courseOptionsData } = useQuery({
    queryKey: ['lesson-catalog-course-options'],
    queryFn: () => api.lessons.catalog({ limit: 100 }),
    staleTime: 60 * 1000,
  })
  const courseOptions = Array.from(
    new Map((courseOptionsData?.data || []).map((l: any) => [l.course_id, l.course_title])).entries()
  ) as [number, string][]

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    setPage(1)
  }

  const handleCourseFilterChange = (value: string) => {
    setCourseFilter(value)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Library className="h-7 w-7" />
          {t('lessonsPage.title')}
        </h1>
        <p className="text-muted-foreground">{t('lessonsPage.subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <TabsList>
            <TabsTrigger value="inProgress">
              {t('lessonCatalog.inProgress')} ({counts?.inProgress ?? 0})
            </TabsTrigger>
            <TabsTrigger value="mandatory">
              {t('lessonCatalog.mandatory')} ({counts?.mandatory ?? 0})
            </TabsTrigger>
            <TabsTrigger value="all">
              {t('lessonCatalog.all')} ({counts?.all ?? 0})
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-1 flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('lessonsPage.searchPlaceholder')}
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {courseOptions.length > 1 && (
              <Select value={courseFilter} onValueChange={handleCourseFilterChange}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder={t('lessonCatalog.filterByCourse')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('lessonCatalog.allCourses')}</SelectItem>
                  {courseOptions.map(([courseId, courseTitle]) => (
                    <SelectItem key={courseId} value={String(courseId)}>{courseTitle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {(['inProgress', 'mandatory', 'all'] as const).map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className="space-y-3 mt-4">
            {isLoading ? (
              <PageLoading />
            ) : error ? (
              <QueryError onRetry={() => refetch()} />
            ) : lessons.length > 0 ? (
              <>
                <div className="grid gap-2">
                  {lessons.map((lesson: any) => (
                    <LessonRow key={lesson.id} lesson={lesson} />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      {t('lessonsPage.previous')}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {t('lessonsPage.pageOf', { page, total: totalPages })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      {t('lessonsPage.next')}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <Card className="p-6 text-center">
                {tabValue === 'inProgress' ? (
                  <History className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                ) : tabValue === 'mandatory' ? (
                  <Target className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                ) : (
                  <Library className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                )}
                <p className="text-muted-foreground">
                  {tabValue === 'inProgress'
                    ? t('lessonCatalog.noInProgress')
                    : tabValue === 'mandatory'
                    ? t('lessonCatalog.noMandatory')
                    : t('lessonCatalog.noLessons')}
                </p>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
