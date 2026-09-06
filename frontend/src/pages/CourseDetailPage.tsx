import { useTranslation } from 'react-i18next'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { getInitials } from '@/lib/utils'
import {
  BookOpen,
  Clock,
  Users,
  Star,
  Play,
  CheckCircle,
  Lock,
  Award,
  FileText,
  Video,
  HelpCircle,
  Download,
  Share2,
  ArrowLeft,
} from 'lucide-react'
import { api } from '@/services/api'
import { FavoriteButton } from '@/components/FavoriteButton'

export default function CourseDetailPage() {
  const { t } = useTranslation('courses')
  const { t: tCommon } = useTranslation('common')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Fetch full course structure with modules, lessons, quizzes
  const { data: course, isLoading, error } = useQuery({
    queryKey: ['course-full', id],
    queryFn: async () => {
      const response = await api.get(`/courses/${id}/full`)
      return response.data.data
    },
    enabled: !!id,
  })

  // Real enrollment/progress state -- avoids assuming every visitor is
  // enrolled and every lesson incomplete.
  const { data: myProgress } = useQuery({
    queryKey: ['course-my-progress', id],
    queryFn: async () => {
      const response = await api.get(`/courses/${id}/my-progress`)
      return response.data.data
    },
    enabled: !!id,
  })

  const enrollMutation = useMutation({
    mutationFn: () => api.courses.enroll(course!.id),
    onSuccess: () => {
      toast({
        title: t('detail.enrollSuccessTitle'),
        description: t('detail.enrollSuccessDescription'),
      })
      queryClient.invalidateQueries({ queryKey: ['course-full', id] })
      queryClient.invalidateQueries({ queryKey: ['course-my-progress', id] })
    },
    onError: (err: any) => {
      toast({
        title: tCommon('status.error'),
        description: err.response?.data?.error?.message || t('detail.enrollErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  if (isLoading) {
    return <PageLoading />
  }

  if (error || !course) {
    return (
      <div className="text-center py-12">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t('detail.notFoundTitle')}</h2>
        <p className="text-muted-foreground mb-4">{t('detail.notFoundHint')}</p>
        <Link to="/courses">
          <Button>{t('detail.backToCatalog')}</Button>
        </Link>
      </div>
    )
  }

  // Build course data from real API response
  const courseModules = course.modules || []
  const completedLessonIds = new Set<number>(myProgress?.completedLessonIds || [])

  // `objectives` isn't a real course field and `prerequisites` (when set) is a
  // structured {courseIds, badgeIds} reference, not free-text -- neither has
  // genuine per-course display text today, so we show an honest empty state
  // instead of inventing generic copy.
  const realPrerequisites = Array.isArray(course.prerequisites) ? course.prerequisites : []

  const mergedCourse = {
    id: course.id,
    title: course.title || t('detail.defaultTitle'),
    description: course.description || t('detail.defaultDescription'),
    instructor: {
      name: course.creatorName || t('detail.defaultInstructor'),
      title: t('detail.defaultInstructorTitle'),
    },
    category: course.category || t('detail.defaultCategory'),
    level: course.level || 'intermediate',
    duration: course.duration ? `${course.duration}h` : '-',
    enrolledCount: course.enrolledCount || 0,
    rating: course.reviewCount > 0 ? Math.round(course.avgRating * 10) / 10 : null,
    reviewsCount: course.reviewCount || 0,
    enrolled: !!myProgress?.enrolled,
    modules: courseModules.map((m: any) => ({
      id: m.id,
      title: m.title,
      lessons: (m.lessons || []).map((l: any) => ({
        id: l.id,
        public_id: l.public_id,
        title: l.title,
        duration_min: l.duration_min,
        duration: l.duration_min ? `${l.duration_min}min` : '-',
        type: l.type || 'video',
        completed: completedLessonIds.has(l.id),
        quizzes: l.quizzes || [],
        contents: l.contents || [],
      })),
    })),
    objectives: Array.isArray(course.objectives) ? course.objectives : [],
    prerequisites: realPrerequisites,
  }

  const totalLessons = mergedCourse.modules.reduce((acc: number, m: any) => acc + m.lessons.length, 0)
  const totalVideoMinutes = mergedCourse.modules.reduce(
    (acc: number, m: any) => acc + m.lessons.filter((l: any) => l.type === 'video').reduce((a: number, l: any) => a + (l.duration_min || 0), 0),
    0
  )
  const articlesCount = mergedCourse.modules.reduce(
    (acc: number, m: any) => acc + m.lessons.filter((l: any) => l.type === 'article').length,
    0
  )
  const downloadableResourcesCount = mergedCourse.modules.reduce(
    (acc: number, m: any) => acc + m.lessons.reduce((a: number, l: any) => a + l.contents.filter((c: any) => c.storage_key).length, 0),
    0
  )
  const quizzesCount = mergedCourse.modules.reduce(
    (acc: number, m: any) => acc + m.lessons.reduce((a: number, l: any) => a + l.quizzes.length, 0),
    0
  )
  const completedLessons = mergedCourse.modules.reduce(
    (acc: number, m: any) => acc + m.lessons.filter((l: any) => l.completed).length,
    0
  )

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t('detail.back')}
      </Button>

      {/* Hero Section */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Course Header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Badge>{mergedCourse.category}</Badge>
                <Badge variant="outline">
                  {mergedCourse.level === 'beginner' ? t('detail.levels.beginner') :
                   mergedCourse.level === 'advanced' ? t('detail.levels.advanced') : t('detail.levels.intermediate')}
                </Badge>
              </div>
              <h1 className="text-3xl font-bold mb-4">{mergedCourse.title}</h1>
              <p className="text-muted-foreground mb-6">{mergedCourse.description}</p>

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  {mergedCourse.rating !== null ? (
                    <>
                      <span className="font-medium">{mergedCourse.rating}</span>
                      <span className="text-muted-foreground">{t('detail.reviewsCount', { count: mergedCourse.reviewsCount })}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t('detail.noReviewsYet')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span>{t('detail.enrolledCount', { count: mergedCourse.enrolledCount })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span>{mergedCourse.duration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <span>{t('detail.lessonsCount', { count: totalLessons })}</span>
                </div>
              </div>

              {/* Instructor */}
              <div className="flex items-center gap-4 mt-6 pt-6 border-t">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>
                    {getInitials(mergedCourse.instructor.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{mergedCourse.instructor.name}</p>
                  <p className="text-sm text-muted-foreground">{mergedCourse.instructor.title}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="content">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="content">{t('detail.tabs.content')}</TabsTrigger>
              <TabsTrigger value="objectives">{t('detail.tabs.objectives')}</TabsTrigger>
              <TabsTrigger value="reviews">{t('detail.tabs.reviews')}</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="mt-4 space-y-4">
              {mergedCourse.modules.map((module: any, index: number) => (
                <Card key={module.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {index + 1}
                      </span>
                      {module.title}
                    </CardTitle>
                    <CardDescription>
                      {t('detail.moduleLessons', { total: module.lessons.length, completed: module.lessons.filter((l: any) => l.completed).length })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {module.lessons.map((lesson: any) => (
                        <LessonItem
                          key={lesson.id}
                          lesson={lesson}
                          courseId={id!}
                          enrolled={mergedCourse.enrolled}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="objectives" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('detail.whatYouWillLearn')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {mergedCourse.objectives.length > 0 ? (
                    <ul className="grid md:grid-cols-2 gap-4">
                      {mergedCourse.objectives.map((obj: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                          <span>{obj}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('detail.noObjectives')}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>{t('detail.prerequisites')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {mergedCourse.prerequisites.length > 0 ? (
                    <ul className="space-y-2">
                      {mergedCourse.prerequisites.map((prereq: string, i: number) => (
                        <li key={i} className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                          <span>{prereq}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('detail.noPrerequisites')}</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reviews" className="mt-4">
              <Card>
                <CardContent className="p-6 text-center">
                  <Star className="h-12 w-12 mx-auto text-yellow-400 mb-4" />
                  {mergedCourse.rating !== null ? (
                    <>
                      <h3 className="text-xl font-semibold mb-2">
                        {t('detail.avgRating', { rating: mergedCourse.rating })}
                      </h3>
                      <p className="text-muted-foreground">
                        {t('detail.basedOnReviews', { count: mergedCourse.reviewsCount })}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">{t('detail.noReviewsYet')}</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Action Card */}
          <Card className="sticky top-20">
            <CardContent className="p-6">
              {mergedCourse.enrolled ? (
                <>
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span>{t('detail.progress')}</span>
                      <span className="font-medium">
                        {totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0}%
                      </span>
                    </div>
                    <Progress value={totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0} />
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('detail.lessonsCompleted', { completed: completedLessons, total: totalLessons })}
                    </p>
                  </div>
                  <Link to={`/courses/${id}/learn`}>
                    <Button className="w-full" size="lg">
                      <Play className="h-4 w-4 mr-2" />
                      {t('detail.continueCourse')}
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <p className="text-3xl font-bold text-primary mb-2">{t('detail.free')}</p>
                    <p className="text-sm text-muted-foreground">{t('detail.unlimitedAccess')}</p>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => enrollMutation.mutate()}
                    disabled={enrollMutation.isPending}
                  >
                    {enrollMutation.isPending ? t('detail.enrolling') : t('detail.enrollNow')}
                  </Button>
                </>
              )}

              <div className="flex items-center justify-center gap-4 mt-4">
                <FavoriteButton type="course" id={mergedCourse.id} />
                <Button variant="outline" size="sm">
                  <Share2 className="h-4 w-4 mr-1" />
                  {t('detail.share')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Certificate Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Award className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">{t('detail.certificateTitle')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t('detail.certificateHint')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resources */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('detail.resourcesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Video className="h-4 w-4 text-muted-foreground" />
                <span>{t('detail.resourceVideo', { count: totalVideoMinutes })}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>{t('detail.resourceArticles', { count: articlesCount })}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Download className="h-4 w-4 text-muted-foreground" />
                <span>{t('detail.resourceDownloads', { count: downloadableResourcesCount })}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <span>{t('detail.resourceQuizzes', { count: quizzesCount })}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function LessonItem({
  lesson,
  courseId,
  enrolled,
}: {
  lesson: any
  courseId: string
  enrolled: boolean
}) {
  const navigate = useNavigate()
  
  const typeIcons: Record<string, React.ReactNode> = {
    video: <Video className="h-4 w-4" />,
    quiz: <HelpCircle className="h-4 w-4" />,
    exercise: <FileText className="h-4 w-4" />,
    article: <FileText className="h-4 w-4" />,
    document: <FileText className="h-4 w-4" />,
    link: <BookOpen className="h-4 w-4" />,
    text: <FileText className="h-4 w-4" />,
  }

  // Determine the correct link based on lesson type
  const getLessonLink = () => {
    // If it's a quiz type lesson and has associated quizzes
    if (lesson.type === 'quiz' && lesson.quizzes && lesson.quizzes.length > 0) {
      return `/quizzes/${lesson.quizzes[0].id}`
    }
    
    // For all other types, go to the lesson page
    return `/courses/${courseId}/lessons/${lesson.public_id}`
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!enrolled) {
      return
    }
    const link = getLessonLink()
    navigate(link)
  }

  return (
    <div
      onClick={handleClick}
      className={`flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer ${
        !enrolled ? 'opacity-60 cursor-not-allowed' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        {lesson.completed ? (
          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-4 w-4 text-green-600" />
          </div>
        ) : enrolled ? (
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            {typeIcons[lesson.type] || <BookOpen className="h-4 w-4" />}
          </div>
        ) : (
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div>
          <p className="font-medium text-sm">{lesson.title}</p>
          <p className="text-xs text-muted-foreground">{lesson.duration}</p>
        </div>
      </div>
      {enrolled && !lesson.completed && (
        <Button size="sm" variant="ghost">
          <Play className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
