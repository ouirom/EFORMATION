import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageLoading } from '@/components/ui/loading'
import {
  BookOpen,
  Clock,
  Users,
  Star,
  Search,
  Grid,
  List,
  Play,
  Award,
  CheckCircle,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatDuration, dateLocale } from '@/lib/utils'

export default function CoursesPage() {
  const { t } = useTranslation('courses')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [level, setLevel] = useState('all')
  const [activeTab, setActiveTab] = useState('all')

  // Fetch all courses (catalogue)
  const { data, isLoading, error } = useQuery({
    queryKey: ['courses', { search, category, level }],
    queryFn: () => api.courses.list({ search, category: category !== 'all' ? category : undefined }),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  })

  // Fetch courses assigned to user
  const { data: assignedCourses, isLoading: assignedLoading } = useQuery({
    queryKey: ['my-assigned-courses'],
    queryFn: () => api.assignments.getMyCourses(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  })

  // Fetch the user's real enrollment progress (progress_percent/completed_at
  // from the enrollments table) -- the old /users/me/progress endpoint returns
  // quiz-attempt stats keyed differently and has no `progress`/`isCompleted`
  // field at all, so course cards always showed 0% and never "completed".
  const { data: enrollments } = useQuery({
    queryKey: ['user-course-enrollments'],
    queryFn: () => api.courses.getMyEnrollments(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  })

  const { data: categories } = useQuery({
    queryKey: ['course-categories'],
    queryFn: () => api.courses.getCategories(),
    staleTime: 5 * 60 * 1000, // 5 minutes pour les catégories
  })

  if (isLoading || assignedLoading) {
    return <PageLoading />
  }

  // Show error if API failed
  if (error) {
    console.error('Erreur lors du chargement des cours:', error);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t('list.title')}</h1>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">
              {t('list.loadError')}
            </p>
            <p className="text-sm text-red-600 mt-2">{(error as any)?.message}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const courses = data || []
  const myAssignedCourses = assignedCourses || []
  const enrollmentData = enrollments || []
  const courseCategories = categories || [
    { id: 'tech', name: 'Technologie' },
    { id: 'management', name: 'Management' },
    { id: 'soft-skills', name: 'Soft Skills' },
    { id: 'compliance', name: 'Conformité' },
  ]

  // Enrich courses with real enrollment progress
  const enrichedCourses = courses.map((course: any) => {
    const enrollment = enrollmentData.find((e: any) => e.course_id === course.id);
    return {
      ...course,
      enrolled: !!enrollment,
      progress: enrollment?.progress_percent || 0,
      isCompleted: !!enrollment?.completed_at,
    };
  });

  const enrichedAssignedCourses = myAssignedCourses.map((course: any) => {
    const enrollment = enrollmentData.find((e: any) => e.course_id === course.id);
    return {
      ...course,
      enrolled: !!enrollment,
      progress: enrollment?.progress_percent || 0,
      isCompleted: !!enrollment?.completed_at,
    };
  });

  // Get completed courses
  const completedCourses = enrichedAssignedCourses.filter((c: any) => c.isCompleted)

  // Filter courses based on level
  const filteredCourses = level === 'all' 
    ? enrichedCourses 
    : enrichedCourses.filter((c: any) => c.level === level)

  const filteredAssignedCourses = level === 'all'
    ? enrichedAssignedCourses
    : enrichedAssignedCourses.filter((c: any) => c.level === level)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('list.title')}</h1>
        <p className="text-muted-foreground">
          {t('list.subtitle')}
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="all">{t('list.tabs.all')}</TabsTrigger>
          <TabsTrigger value="assigned">
            {t('list.tabs.assigned')}
            {myAssignedCourses.length > 0 && (
              <span className="ml-2 bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-xs">
                {myAssignedCourses.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="mandatory">{t('list.tabs.mandatory')}</TabsTrigger>
          <TabsTrigger value="completed">{t('list.tabs.completed')}</TabsTrigger>
          <TabsTrigger value="recommended">{t('list.tabs.recommended')}</TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 my-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('list.searchPlaceholder')}
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t('list.categoryPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('list.allCategories')}</SelectItem>
                {courseCategories.map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t('list.levelPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('list.allLevels')}</SelectItem>
                <SelectItem value="beginner">{t('list.levels.beginner')}</SelectItem>
                <SelectItem value="intermediate">{t('list.levels.intermediate')}</SelectItem>
                <SelectItem value="advanced">{t('list.levels.advanced')}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex border rounded-md">
              <Button
                variant={view === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setView('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={view === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setView('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <TabsContent value="all">
          {filteredCourses.length > 0 ? (
            view === 'grid' ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredCourses.map((course: any) => (
                  <CourseGridCard key={course.id} course={course} />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCourses.map((course: any) => (
                  <CourseListCard key={course.id} course={course} />
                ))}
              </div>
            )
          ) : (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">{t('list.empty.allTitle')}</h3>
              <p className="text-muted-foreground">
                {t('list.empty.allHint')}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="assigned">
          {filteredAssignedCourses.length > 0 ? (
            <div className={view === 'grid' ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>
              {filteredAssignedCourses.map((course: any) => (
                view === 'grid' ? (
                  <CourseGridCard key={course.id} course={course} showAssignment />
                ) : (
                  <CourseListCard key={course.id} course={course} showAssignment />
                )
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">{t('list.empty.assignedTitle')}</h3>
              <p className="text-muted-foreground">
                {t('list.empty.assignedHint')}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="mandatory">
          {filteredAssignedCourses.filter((c: any) => c.isMandatory).length > 0 ? (
            <div className={view === 'grid' ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>
              {filteredAssignedCourses.filter((c: any) => c.isMandatory).map((course: any) => (
                view === 'grid' ? (
                  <CourseGridCard key={course.id} course={course} showAssignment />
                ) : (
                  <CourseListCard key={course.id} course={course} showAssignment />
                )
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">{t('list.empty.mandatoryTitle')}</h3>
              <p className="text-muted-foreground">
                {t('list.empty.mandatoryHint')}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedCourses.length > 0 ? (
            view === 'grid' ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {completedCourses.map((course: any) => (
                  <CourseGridCard key={course.id} course={course} isCompleted={true} />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {completedCourses.map((course: any) => (
                  <CourseListCard key={course.id} course={course} isCompleted={true} />
                ))}
              </div>
            )
          ) : (
            <div className="text-center py-12">
              <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">{t('list.empty.completedTitle')}</h3>
              <p className="text-muted-foreground">
                {t('list.empty.completedHint')}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CourseGridCard({ course, showAssignment = false, isCompleted = false }: { course: any; showAssignment?: boolean; isCompleted?: boolean }) {
  const { t } = useTranslation('courses')
  const levelColors: Record<string, string> = {
    beginner: 'bg-green-100 text-green-800',
    intermediate: 'bg-yellow-100 text-yellow-800',
    advanced: 'bg-red-100 text-red-800',
  }

  return (
    <Card className={`overflow-hidden group hover:shadow-lg transition-shadow ${isCompleted ? 'border-green-300' : ''}`}>
      <div className={`h-40 flex items-center justify-center relative ${isCompleted ? 'bg-gradient-to-br from-green-100 to-green-50' : 'bg-gradient-to-br from-primary/20 to-primary/5'}`}>
        <BookOpen className={`h-12 w-12 ${isCompleted ? 'text-green-600' : 'text-primary'}`} />
        {isCompleted && (
          <div className="absolute inset-0 bg-green-600/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-white mx-auto mb-2" />
              <p className="text-white font-semibold">{t('list.card.completedFully')}</p>
            </div>
          </div>
        )}
        {!isCompleted && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Link to={`/courses/${course.publicId}`}>
              <Button>
                <Play className="h-4 w-4 mr-2" />
                {t('list.card.start')}
              </Button>
            </Link>
          </div>
        )}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          {isCompleted && (
            <Badge className="bg-green-600 text-white">{t('list.card.completed')}</Badge>
          )}
          {showAssignment && course.isMandatory && (
            <Badge variant="destructive">{t('list.card.mandatory')}</Badge>
          )}
          {showAssignment && course.dueDate && (
            <Badge variant="secondary" className="text-xs">
              {t('list.card.dueDate', { date: new Date(course.dueDate).toLocaleDateString(dateLocale()) })}
            </Badge>
          )}
        </div>
      </div>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline">{course.category || t('list.card.defaultCategory')}</Badge>
          {course.level && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${levelColors[course.level] || levelColors.beginner}`}>
              {course.level === 'beginner' ? t('list.levels.beginner') : course.level === 'advanced' ? t('list.levels.advanced') : t('list.levels.intermediate')}
            </span>
          )}
        </div>
        <CardTitle className="text-lg line-clamp-2">{course.title}</CardTitle>
        <CardDescription className="line-clamp-2">{course.description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {course.duration ? formatDuration(course.duration) : '-'}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="h-4 w-4" />
            {t('list.card.modules', { count: course.moduleCount || 0 })}
          </span>
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        {isCompleted ? (
          <div className="w-full text-center py-2">
            <div className="flex items-center justify-center gap-2 text-green-600 font-semibold">
              <CheckCircle className="h-4 w-4" />
              {t('list.card.completedFully')}
            </div>
          </div>
        ) : (
          <Link to={`/courses/${course.publicId}`} className="w-full">
            <Button variant="outline" className="w-full">
              {t('list.card.viewDetail')}
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  )
}

function CourseListCard({ course, showAssignment = false, isCompleted = false }: { course: any; showAssignment?: boolean; isCompleted?: boolean }) {
  const { t } = useTranslation('courses')
  return (
    <Card className={`overflow-hidden ${isCompleted ? 'border-green-300 bg-green-50' : ''}`}>
      <div className="flex flex-col md:flex-row">
        <div className={`w-full md:w-56 h-32 md:h-auto flex items-center justify-center relative ${isCompleted ? 'bg-gradient-to-br from-green-100 to-green-50' : 'bg-gradient-to-br from-primary/20 to-primary/5'}`}>
          <BookOpen className={`h-8 w-8 ${isCompleted ? 'text-green-600' : 'text-primary'}`} />
          {isCompleted && (
            <CheckCircle className="absolute h-6 w-6 text-green-600 top-2 right-2" />
          )}
          {showAssignment && course.isMandatory && (
            <Badge variant="destructive" className="absolute top-2 right-2">
              {t('list.card.mandatory')}
            </Badge>
          )}
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">{course.category || t('list.card.defaultCategory')}</Badge>
                {isCompleted && (
                  <Badge className="bg-green-600 text-white">{t('list.card.completed')}</Badge>
                )}
                {showAssignment && course.dueDate && (
                  <Badge variant="secondary">
                    {t('list.card.dueDate', { date: new Date(course.dueDate).toLocaleDateString(dateLocale()) })}
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold text-lg">{course.title}</h3>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {course.description}
              </p>
            </div>
            {course.reviewCount > 0 && (
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="font-medium">{Math.round(course.avgRating * 10) / 10}</span>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {course.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {course.duration}h
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {t('list.card.enrolledCount', { count: course.enrolledCount || 0 })}
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                {t('list.card.lessonsCount', { count: course.lessonsCount || 0 })}
              </span>
            </div>
            {isCompleted ? (
              <div className="flex items-center gap-2 text-green-600 font-semibold">
                <CheckCircle className="h-4 w-4" />
                {t('list.card.completed')}
              </div>
            ) : (
              <Link to={`/courses/${course.publicId}`}>
                <Button>
                  <Play className="h-4 w-4 mr-2" />
                  {course.enrolled ? t('list.card.continue') : t('list.card.start')}
                </Button>
              </Link>
            )}
          </div>
          {!isCompleted && course.enrolled && course.progress > 0 && (
            <div className="mt-3">
              <Progress value={course.progress} className="h-1.5" />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
