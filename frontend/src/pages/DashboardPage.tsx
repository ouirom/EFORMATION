import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageLoading } from '@/components/ui/loading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getInitials, formatDateTime, dateLocale } from '@/lib/utils'
import { LessonRow } from '@/components/LessonRow'
import { categoryGradient, useCategoryLabel } from '@/lib/categories'
import { useTenantFeatures } from '@/lib/tenantSettings'
import { levelFromXp } from '@/lib/gamification'
import {
  BookOpen,
  Clock,
  Play,
  ArrowRight,
  Calendar,
  CheckCircle,
  CheckCircle2,
  Target,
  Flame,
  Trophy,
  Star,
  Zap,
  BarChart3,
  History,
  Library,
  Heart,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import { api } from '@/services/api'

export default function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const { user } = useAuth()
  // Modules and gamification of the organization (Administration > Organisation).
  const {
    liveSessions: liveSessionsEnabled,
    badges: badgesEnabled,
    xp: xpEnabled,
    leaderboardScope,
    xpPerLevel,
  } = useTenantFeatures()
  const showLeaderboard = xpEnabled && leaderboardScope !== 'hidden'

  // Badges de l'utilisateur
  const { data: userBadgesData, isLoading: loadingBadges } = useQuery({
    queryKey: ['my-badges-dashboard'],
    queryFn: () => api.badges.getUserBadges(),
    staleTime: 60 * 1000,
    enabled: badgesEnabled,
  })

  // Statistiques globales de l'utilisateur
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.analytics.getDashboard(),
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
  })

  // Classement (Leaderboard)
  const { data: leaderboard = [], isLoading: loadingLeaderboard } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.analytics.getLeaderboard(5),
    staleTime: 60 * 1000,
    enabled: showLeaderboard,
  })

  // Cours attribués + cours où l'utilisateur est inscrit, avec progression, nombre de
  // leçons et échéance -- une seule source pour les onglets, la section obligatoire et la carte "Cours".
  const { data: courses = [], isLoading: loadingCourses } = useQuery({
    queryKey: ['my-courses-dashboard'],
    queryFn: () => api.analytics.getMyCourses(),
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
  })

  // Quiz passés par l'utilisateur
  const { data: attempts = [], isLoading: loadingAttempts } = useQuery({
    queryKey: ['user-quiz-attempts'],
    queryFn: () => api.attempts.getByUser(),
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
  })

  // Sessions Live à venir (seulement si l'organisation n'a pas désactivé le module)
  const { data: liveSessions = [], isLoading: loadingLiveSessions } = useQuery({
    queryKey: ['live-sessions'],
    queryFn: () => api.liveSessions.list(),
    enabled: liveSessionsEnabled,
  })

  // Catalogue des leçons (onglet "Toutes") -- une page de navigation, le total vient du serveur.
  const { data: lessonCatalogData, isLoading: loadingLessonCatalog } = useQuery({
    queryKey: ['lesson-catalog-dashboard'],
    queryFn: () => api.lessons.catalog({ limit: 100 }),
    staleTime: 10 * 1000,
  })

  // Leçons en cours, triées par dernier accès côté serveur : la première est celle à reprendre,
  // quel que soit le nombre de leçons du catalogue.
  const { data: inProgressData, isLoading: loadingInProgress } = useQuery({
    queryKey: ['lesson-catalog-dashboard', 'in_progress'],
    queryFn: () => api.lessons.catalog({ status: 'in_progress', limit: 6 }),
    staleTime: 10 * 1000,
  })

  // Toutes les leçons obligatoires (toutes les pages) : la section "Priorités" et sa jauge
  // ne doivent pas dépendre d'un plafond de pagination.
  const { data: mandatoryLessonsData = [], isLoading: loadingMandatoryLessons } = useQuery({
    queryKey: ['lesson-catalog-dashboard', 'mandatory'],
    queryFn: () => fetchAllCatalogPages({ mandatory: true }),
    staleTime: 10 * 1000,
  })

  // Favoris
  const { data: favorites = [], isLoading: loadingFavorites } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.favorites.list(),
  })

  const [lessonCatalogTab, setLessonCatalogTab] = useState('inProgress')
  const [lessonCatalogCourseFilter, setLessonCatalogCourseFilter] = useState('all')

  const allCourses = useMemo(() => (Array.isArray(courses) ? courses : []), [courses])
  const allLessons = useMemo(() => lessonCatalogData?.data || [], [lessonCatalogData])

  // Grouper les cours par type (un cours terminé ne figure que dans "Terminée")
  const groupedCourses = useMemo(() => ({
    completed: allCourses.filter((c: any) => c.isCompleted),
    recommended: allCourses.filter((c: any) => c.isAssigned && !c.isMandatory && !c.isCompleted),
    enrolled: allCourses.filter((c: any) => !c.isAssigned && !c.isCompleted),
  }), [allCourses])

  // Filtrer les formations et leçons obligatoires pour mise en avant prioritaire
  const mandatoryCourses = useMemo(() => allCourses.filter((c: any) => c.isMandatory), [allCourses])
  const pendingMandatoryCourses = useMemo(
    () => mandatoryCourses.filter((c: any) => !c.isCompleted).sort(compareDueDates),
    [mandatoryCourses]
  )
  const completedMandatoryCourses = useMemo(() => mandatoryCourses.filter((c: any) => c.isCompleted), [mandatoryCourses])

  const mandatoryLessons = mandatoryLessonsData
  const pendingMandatoryLessons = useMemo(() => mandatoryLessons.filter((l: any) => l.progress_status !== 'completed'), [mandatoryLessons])
  const completedMandatoryLessons = useMemo(() => mandatoryLessons.filter((l: any) => l.progress_status === 'completed'), [mandatoryLessons])

  const totalMandatoryCount = mandatoryCourses.length + mandatoryLessons.length
  const completedMandatoryCount = completedMandatoryCourses.length + completedMandatoryLessons.length
  // Pondérée par l'avancement : un cours obligatoire à 50 % compte pour moitié.
  const mandatoryProgressPercent = totalMandatoryCount > 0
    ? Math.round(
        ([
          ...mandatoryCourses.map((c: any) => (c.isCompleted ? 100 : c.progress || 0)),
          ...mandatoryLessons.map((l: any) => (l.progress_status === 'completed' ? 100 : l.progress_percent || 0)),
        ].reduce((sum: number, p: number) => sum + p, 0)) / totalMandatoryCount
      )
    : 100
  const hasPendingMandatory = pendingMandatoryCourses.length > 0 || pendingMandatoryLessons.length > 0

  // Onglet de catalogue par défaut : le premier non vide. Les formations obligatoires en attente
  // ne sont pas dans le catalogue -- elles ont leur propre section au-dessus.
  // Dérivé tant que l'utilisateur n'a pas cliqué, car au premier rendu les cours ne sont pas encore chargés.
  const [selectedTab, setSelectedTab] = useState<string | null>(null)
  const activeTab = selectedTab ?? (
    groupedCourses.recommended.length > 0 ? 'recommended'
      : groupedCourses.enrolled.length > 0 ? 'enrolled'
        : 'completed'
  )

  // Dernière leçon commencée : le catalogue est trié par date de dernier accès.
  const lessonsInProgress = inProgressData?.data || []
  const resumeLesson = lessonsInProgress[0]

  if (loadingStats || loadingCourses) {
    return <PageLoading />
  }

  const upcomingLiveSessions = (liveSessions || [])
    .filter((s: any) => s.status === 'scheduled' && s.scheduledAt
      && new Date(s.scheduledAt).getTime() >= Date.now() - LIVE_SESSION_GRACE_MS)
    .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 3)

  const inProgressTotal = inProgressData?.meta?.total ?? lessonsInProgress.length
  const allLessonsTotal = lessonCatalogData?.meta?.total ?? allLessons.length
  const lessonCoursesForFilter = Array.from(
    new Map(allLessons.map((l: any) => [l.course_id, l.course_title])).entries()
  ) as [number, string][]

  const lessonsFilteredByCourse = lessonCatalogCourseFilter === 'all'
    ? allLessons
    : allLessons.filter((l: any) => String(l.course_id) === lessonCatalogCourseFilter)

  const favoriteCourses = favorites
    .filter((f: any) => f.type === 'course')
    .map((f: any) => ({ id: f.itemId, publicId: f.publicId, title: f.title }))

  const favoriteLessons = favorites
    .filter((f: any) => f.type === 'lesson')
    .map((f: any) => ({
      id: f.itemId,
      public_id: f.publicId,
      course_id: f.courseId,
      course_public_id: f.coursePublicId,
      title: f.title,
      type: f.lessonType,
      duration_min: f.durationMin,
      is_mandatory: f.isMandatory,
      course_title: f.courseTitle,
      module_title: f.moduleTitle,
    }))

  const dashboardStats = {
    // Même liste que les onglets ci-dessous, pour que les compteurs concordent.
    coursesEnrolled: allCourses.length,
    coursesCompleted: groupedCourses.completed.length,
    lessonsStarted: stats?.lessonsStarted ?? inProgressTotal,
    lessonsCompleted: stats?.lessonsCompleted || 0,
    totalHours: stats?.totalHours || 0,
    totalMinutes: stats?.totalMinutes || 0,
    totalSeconds: stats?.totalSeconds || 0,
    quizzesTaken: stats?.quizzesTaken ?? attempts.length,
    quizzesPassed: stats?.quizzesPassed ?? attempts.filter(isAttemptPassed).length,
    avgQuizScore: stats?.avgQuizScore || 0,
    badges: stats?.badges ?? userBadgesData?.length ?? 0,
    streak: stats?.streak || 0,
    xp: stats?.xp || 0,
    avgProgress: stats?.avgProgress || 0,
  }

  // Niveau d'apprentissage, selon le barème de l'organisation (même calcul que le profil)
  const currentXp = dashboardStats.xp || 0
  const userLevel = levelFromXp(currentXp, xpPerLevel).level

  return (
    <div className="space-y-6">
      {/* Welcome Section & Gamification Pills */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t('greeting', { name: user?.displayName?.split(' ')[0] || t('defaultUser') })}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
            <Flame className="h-5 w-5 text-orange-500" />
            <span className="font-bold text-orange-600 dark:text-orange-400 text-sm">
              {t('streakDays', { count: dashboardStats.streak })}
            </span>
          </div>
          {xpEnabled && (
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
            <Target className="h-5 w-5 text-primary" />
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-primary text-sm">{t('level', { level: userLevel })}</span>
              <span className="text-xs text-muted-foreground font-medium">({currentXp} XP)</span>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Stats Cards (4 colonnes harmonisées & corrigées) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Formations */}
        <Card className="hover:shadow-sm transition-all border-border/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.courses')}</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <BookOpen className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{dashboardStats.coursesEnrolled}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('stats.coursesCompleted', { count: dashboardStats.coursesCompleted })}
            </p>
          </CardContent>
        </Card>

        {/* Leçons */}
        <Card className="hover:shadow-sm transition-all border-border/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.lessons')}</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{dashboardStats.lessonsCompleted}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('stats.lessonsStarted', { count: dashboardStats.lessonsStarted })}
            </p>
          </CardContent>
        </Card>

        {/* Quiz & Tests (Carte corrigée avec conteneur Card) */}
        <Card className="hover:shadow-sm transition-all border-border/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.quizzes')}</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Zap className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {dashboardStats.quizzesPassed} <span className="text-sm font-normal text-muted-foreground">/ {dashboardStats.quizzesTaken}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboardStats.avgQuizScore > 0
                ? t('stats.quizzesScore', { score: dashboardStats.avgQuizScore })
                : t('stats.quizzesPassed', { count: dashboardStats.quizzesPassed })}
            </p>
          </CardContent>
        </Card>

        {/* Temps d'apprentissage */}
        <Card className="hover:shadow-sm transition-all border-border/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.learningTime')}</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {dashboardStats.totalHours > 0
                ? `${dashboardStats.totalHours}h ${dashboardStats.totalMinutes % 60}min`
                : `${dashboardStats.totalMinutes}min`}
            </div>
            {badgesEnabled && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('stats.badgesEarned', { count: dashboardStats.badges })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reprendre la dernière leçon commencée */}
      {resumeLesson && <ResumeLessonCard lesson={resumeLesson} />}

      {/* SECTION PRIORITAIRE : Formations & Leçons Obligatoires (Visibilité directe sans chercher) */}
      {/* Attend le catalogue des leçons, sinon la jauge changerait une fois les leçons obligatoires chargées. */}
      {loadingMandatoryLessons && <BlockSkeleton rows={2} />}
      {!loadingMandatoryLessons && totalMandatoryCount > 0 && (
        <Card className={`border-2 transition-all ${
          hasPendingMandatory
            ? 'border-amber-400/90 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent dark:from-amber-950/25 dark:via-orange-950/10 dark:border-amber-600/70 shadow-sm'
            : 'border-emerald-400/70 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent dark:from-emerald-950/20 dark:border-emerald-600/60'
        }`}>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  hasPendingMandatory
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {hasPendingMandatory ? <AlertCircle className="h-5 w-5 animate-pulse" /> : <CheckCircle2 className="h-5 w-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-bold text-foreground">
                      {t('mandatorySection.title')}
                    </CardTitle>
                    <Badge className={hasPendingMandatory ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-emerald-600 text-white'}>
                      {hasPendingMandatory ? t('mandatorySection.badge') : t('mandatorySection.allValidated')}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {hasPendingMandatory
                      ? t('mandatorySection.subtitle')
                      : t('mandatorySection.allCompletedDesc')
                    }
                  </p>
                </div>
              </div>

              {/* Jauge globale d'avancement des obligations */}
              <div className="sm:text-right min-w-[200px]">
                <div className="flex items-center justify-between sm:justify-end gap-2 text-xs font-semibold mb-1">
                  <span className="text-muted-foreground">{t('mandatorySection.progressLabel')}</span>
                  <span className={hasPendingMandatory ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-bold'}>
                    {mandatoryProgressPercent}%
                  </span>
                </div>
                <Progress value={mandatoryProgressPercent} className="h-2" />
                <span className="text-[11px] text-muted-foreground mt-1 block">
                  {t('mandatorySection.validatedCount', { completed: completedMandatoryCount, total: totalMandatoryCount })}
                </span>
              </div>
            </div>
          </CardHeader>

          {hasPendingMandatory ? (
            <CardContent className="space-y-4 pt-1">
              {/* Formations obligatoires en attente */}
              {pendingMandatoryCourses.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-amber-500" />
                    {t('mandatorySection.pendingCourses', { count: pendingMandatoryCourses.length })}
                  </h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    {pendingMandatoryCourses.map((course: any) => (
                      <MandatoryCourseItem key={course.id} course={course} />
                    ))}
                  </div>
                </div>
              )}

              {/* Leçons obligatoires isolées en attente */}
              {pendingMandatoryLessons.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5 text-amber-500" />
                    {t('mandatorySection.pendingLessons', { count: pendingMandatoryLessons.length })}
                  </h4>
                  <div className="grid gap-2">
                    {pendingMandatoryLessons.slice(0, 4).map((lesson: any) => (
                      <LessonRow key={lesson.id} lesson={lesson} />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          ) : (
            <CardContent className="pt-0 pb-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-500 shrink-0" />
                  <span className="text-sm font-medium">
                    {t('mandatorySection.allCompletedTitle')} {t('mandatorySection.allCompletedDesc')}
                  </span>
                </div>
                <Link to="/courses">
                  <Button size="sm" variant="outline" className="border-emerald-300 dark:border-emerald-700 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200">
                    {t('mandatorySection.exploreMore')}
                  </Button>
                </Link>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Main Content Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colonne Principale (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Catalogue de Formations */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">{t('catalog.title')}</h2>
              <Link to="/courses">
                <Button variant="ghost" size="sm">
                  {t('catalog.viewAll')} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            <Tabs value={activeTab} onValueChange={setSelectedTab} className="w-full">
              <TabsList className={`grid w-full ${groupedCourses.enrolled.length > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <TabsTrigger value="recommended" className="text-xs sm:text-sm">
                  {t('catalog.recommended')} ({groupedCourses.recommended.length})
                </TabsTrigger>
                {groupedCourses.enrolled.length > 0 && (
                  <TabsTrigger value="enrolled" className="text-xs sm:text-sm">
                    {t('catalog.enrolled')} ({groupedCourses.enrolled.length})
                  </TabsTrigger>
                )}
                <TabsTrigger value="completed" className="text-xs sm:text-sm">
                  {t('catalog.completed')} ({groupedCourses.completed.length})
                </TabsTrigger>
                <TabsTrigger value="favorites" className="text-xs sm:text-sm">
                  {t('catalog.favorites')} ({favoriteCourses.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="recommended" className="space-y-3 mt-4">
                {groupedCourses.recommended.length > 0 ? (
                  <div className="grid gap-3">
                    {groupedCourses.recommended.slice(0, 6).map((course: any) => (
                      <CourseCard key={course.id} course={course} />
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center border-dashed">
                    <Star className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">{t('catalog.noRecommended')}</p>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="enrolled" className="space-y-3 mt-4">
                <div className="grid gap-3">
                  {groupedCourses.enrolled.slice(0, 6).map((course: any) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="completed" className="space-y-3 mt-4">
                {groupedCourses.completed.length > 0 ? (
                  <div className="grid gap-3">
                    {groupedCourses.completed.slice(0, 6).map((course: any) => (
                      <CourseCard key={course.id} course={course} />
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center border-dashed">
                    <Trophy className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">{t('catalog.noCompleted')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('catalog.noCompletedHint')}</p>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="favorites" className="space-y-3 mt-4">
                {loadingFavorites ? <BlockSkeleton rows={2} /> : favoriteCourses.length > 0 ? (
                  <div className="grid gap-3">
                    {favoriteCourses.slice(0, 6).map((course: any) => (
                      <CourseCard key={course.id} course={course} />
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center border-dashed">
                    <Heart className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">{t('catalog.noFavorites')}</p>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Catalogue des leçons */}
          <div className="space-y-4 pt-2">
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Library className="h-5 w-5" />
              {t('lessonCatalog.title')}
            </h2>

            <Tabs value={lessonCatalogTab} onValueChange={setLessonCatalogTab} className="w-full">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <TabsList>
                  <TabsTrigger value="inProgress">
                    {t('lessonCatalog.inProgress')} ({inProgressTotal})
                  </TabsTrigger>
                  <TabsTrigger value="all">
                    {t('lessonCatalog.all')} ({allLessonsTotal})
                  </TabsTrigger>
                  <TabsTrigger value="favorites">
                    {t('lessonCatalog.favorites')} ({favoriteLessons.length})
                  </TabsTrigger>
                </TabsList>
                {lessonCatalogTab === 'all' && lessonCoursesForFilter.length > 1 && (
                  <Select value={lessonCatalogCourseFilter} onValueChange={setLessonCatalogCourseFilter}>
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder={t('lessonCatalog.filterByCourse')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('lessonCatalog.allCourses')}</SelectItem>
                      {lessonCoursesForFilter.map(([courseId, courseTitle]) => (
                        <SelectItem key={courseId} value={String(courseId)}>{courseTitle}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <TabsContent value="inProgress" className="space-y-2 mt-4">
                {loadingInProgress ? <BlockSkeleton rows={3} /> : lessonsInProgress.length > 0 ? (
                  <div className="grid gap-2">
                    {lessonsInProgress.slice(0, 6).map((lesson: any) => (
                      <LessonRow key={lesson.id} lesson={lesson} />
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center border-dashed">
                    <History className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">{t('lessonCatalog.noInProgress')}</p>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="all" className="space-y-2 mt-4">
                {loadingLessonCatalog ? <BlockSkeleton rows={3} /> : lessonsFilteredByCourse.length > 0 ? (
                  <div className="grid gap-2">
                    {lessonsFilteredByCourse.slice(0, 10).map((lesson: any) => (
                      <LessonRow key={lesson.id} lesson={lesson} />
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center border-dashed">
                    <Library className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">{t('lessonCatalog.noLessons')}</p>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="favorites" className="space-y-2 mt-4">
                {loadingFavorites ? <BlockSkeleton rows={2} /> : favoriteLessons.length > 0 ? (
                  <div className="grid gap-2">
                    {favoriteLessons.slice(0, 10).map((lesson: any) => (
                      <LessonRow key={lesson.id} lesson={lesson} />
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center border-dashed">
                    <Heart className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">{t('lessonCatalog.noFavorites')}</p>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Quiz Effectués */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-500" />
                {t('quizzes.title')}
              </h2>
            </div>

            {loadingAttempts ? <BlockSkeleton rows={3} /> : attempts.length > 0 ? (
              <div className="space-y-2.5">
                {attempts.slice(0, 5).map((attempt: any) => (
                  <QuizAttemptCard key={attempt.id} attempt={attempt} />
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center border-dashed">
                <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">{t('quizzes.none')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('quizzes.noneHint')}</p>
              </Card>
            )}
          </div>
        </div>

        {/* Colonne Latérale / Sidebar (1/3) */}
        <div className="space-y-6">
          {/* Sessions Live programmées */}
          {liveSessionsEnabled && (
          <Card className="border-border/80">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  {t('upcomingSessions.title')}
                </CardTitle>
                <Link to="/live">
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    {t('upcomingSessions.viewAll')}
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingLiveSessions ? <BlockSkeleton rows={2} /> : upcomingLiveSessions.length > 0 ? (
                upcomingLiveSessions.map((session: any) => (
                  <UpcomingSession
                    key={session.id}
                    title={session.title}
                    date={formatDateTime(session.scheduledAt)}
                    instructor={session.instructor_name || session.instructorName || t('upcomingSessions.noInstructor')}
                  />
                ))
              ) : (
                <div className="py-4 text-center">
                  <Calendar className="h-8 w-8 mx-auto text-muted-foreground/50 mb-1.5" />
                  <p className="text-xs text-muted-foreground">{t('upcomingSessions.none')}</p>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Badges obtenus (Design soigné & épuré) */}
          {badgesEnabled && (
          <Card className="border-border/80 bg-gradient-to-br from-card to-muted/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-yellow-500/10 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                  <Trophy className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-semibold">{t('badgesCard.title')}</CardTitle>
                {userBadgesData && userBadgesData.length > 0 && (
                  <Badge variant="secondary" className="ml-auto font-bold">
                    {userBadgesData.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingBadges ? <BlockSkeleton rows={2} /> : userBadgesData && userBadgesData.length > 0 ? (
                <div className="grid grid-cols-2 gap-2.5">
                  {userBadgesData.slice(0, 4).map((badge: any) => (
                    <div
                      key={badge.id}
                      className="p-3 rounded-xl text-center transition-all duration-200 hover:scale-105 border border-border/60 bg-card/60 shadow-xs cursor-pointer"
                    >
                      <span className="text-3xl mb-1.5 block">
                        {badgeEmoji(badge.badge_type)}
                      </span>
                      <p className="font-semibold text-xs leading-tight line-clamp-1">{badge.name}</p>
                      {badge.awarded_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(badge.awarded_at).toLocaleDateString(dateLocale())}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Trophy className="h-10 w-10 mx-auto text-muted-foreground/60 mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">{t('badgesCard.none')}</p>
                  <p className="text-xs text-muted-foreground/80 mt-1">{t('badgesCard.noneHint')}</p>
                </div>
              )}
              <Link to="/badges" className="mt-4 block">
                <Button variant="outline" size="sm" className="w-full">
                  <Trophy className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />
                  {t('badgesCard.viewAll')}
                </Button>
              </Link>
            </CardContent>
          </Card>
          )}

          {/* Classement / Leaderboard (portée choisie par l'organisation) */}
          {showLeaderboard && (
          <Card className="border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                {t('leaderboard.title')}
              </CardTitle>
              {leaderboardScope !== 'organization' && (
                <p className="text-xs text-muted-foreground">{t(`leaderboard.scope.${leaderboardScope}`)}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingLeaderboard ? <BlockSkeleton rows={3} /> : leaderboard.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">{t('leaderboard.none')}</p>
              ) : (
                leaderboard.map((entry: any, index: number) => (
                  <LeaderboardItem
                    key={entry.id}
                    rank={index + 1}
                    name={entry.display_name}
                    xp={entry.xp}
                    avatar={entry.avatar_url}
                    isYou={entry.id === user?.id}
                  />
                ))
              )}
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  )
}

const CATALOG_PAGE_SIZE = 100 // maxLimit de GET /lessons/catalog

/** Toutes les pages du catalogue pour un filtre donné (le serveur plafonne une page à 100). */
async function fetchAllCatalogPages(params: { mandatory?: boolean; status?: string }) {
  const lessons: any[] = []
  for (let page = 1; ; page++) {
    const { data, meta } = await api.lessons.catalog({ ...params, page, limit: CATALOG_PAGE_SIZE })
    lessons.push(...data)
    if (data.length < CATALOG_PAGE_SIZE || lessons.length >= (meta?.total ?? 0)) return lessons
  }
}

// Une session commencée depuis moins d'une heure reste affichée (elle est peut-être en cours).
const LIVE_SESSION_GRACE_MS = 60 * 60 * 1000

function BlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-muted/60 animate-pulse" />
      ))}
    </div>
  )
}

function ResumeLessonCard({ lesson }: { lesson: any }) {
  const { t } = useTranslation('dashboard')
  const progress = lesson.progress_percent || 0

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <History className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t('resume.title')}</p>
          <p className="font-semibold truncate">{lesson.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {lesson.course_title}{lesson.module_title && ` · ${lesson.module_title}`}
            {lesson.last_accessed_at && ` · ${t('resume.lastAccessed', { date: new Date(lesson.last_accessed_at).toLocaleDateString(dateLocale()) })}`}
          </p>
          {progress > 0 && <Progress value={progress} className="h-1.5 mt-2 max-w-xs" />}
        </div>
        <Link to={`/courses/${lesson.course_public_id}/lessons/${lesson.public_id}`} className="shrink-0">
          <Button size="sm">
            <Play className="h-4 w-4 mr-1" /> {t('resume.cta')}
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

// Échéances : les cours sans date passent après ceux qui en ont une.
function compareDueDates(a: any, b: any) {
  const ta = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
  const tb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
  return ta - tb
}

const DUE_SOON_DAYS = 7

function DueDateLabel({ dueDate, className = '' }: { dueDate?: string | null; className?: string }) {
  const { t } = useTranslation('dashboard')
  if (!dueDate) return null

  const due = new Date(dueDate)
  const date = due.toLocaleDateString(dateLocale())
  const daysLeft = (due.getTime() - Date.now()) / 86400000

  const [label, tone] = daysLeft < 0
    ? [t('course.overdue', { date }), 'text-red-600 dark:text-red-400 font-semibold']
    : daysLeft <= DUE_SOON_DAYS
      ? [t('course.dueSoon', { date }), 'text-orange-600 dark:text-orange-400 font-semibold']
      : [t('course.dueOn', { date }), 'text-muted-foreground']

  return (
    <p className={`text-xs flex items-center gap-1 ${tone} ${className}`}>
      <Calendar className="h-3.5 w-3.5 shrink-0" />
      {label}
    </p>
  )
}

// Même correspondance type -> emoji que BadgesPage.
function badgeEmoji(badgeType?: string) {
  switch (badgeType) {
    case 'trophy': return '🏆'
    case 'perfect_score': return '⭐'
    case 'quiz_completion': return '✅'
    case 'course_start': return '🚀'
    case 'course_completion': return '🎓'
    default: return '🎖️'
  }
}

// quiz_attempts.passed est calculé à la soumission ; le seuil n'est qu'un repli pour les anciennes lignes.
function isAttemptPassed(attempt: any) {
  return typeof attempt.passed === 'boolean' ? attempt.passed : attempt.score >= (attempt.passing_score || 60)
}

function MandatoryCourseItem({ course }: { course: any }) {
  const categoryLabel = useCategoryLabel()
  const { t } = useTranslation('dashboard')
  const progress = course.progress || 0

  return (
    <div className="p-3.5 rounded-xl border border-amber-300/80 dark:border-amber-700/60 bg-card hover:shadow-md transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-2 py-0.5">
            {t('mandatorySection.badge')}
          </Badge>
          <span className="text-xs font-medium text-muted-foreground truncate">
            {categoryLabel(course.category)}
          </span>
        </div>
        <h4 className="font-semibold text-sm line-clamp-1 text-foreground" title={course.title}>
          {course.title}
        </h4>
        <DueDateLabel dueDate={course.dueDate} className="mt-0.5" />
      </div>

      <div className="mt-3 pt-2 border-t border-border/60">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">{t('course.progress')}</span>
          <span className="font-semibold text-amber-600 dark:text-amber-400">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5 mb-2.5" />

        <Link to={`/courses/${course.publicId || course.id}`}>
          <Button size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs h-8">
            <Play className="h-3.5 w-3.5 mr-1" />
            {progress > 0 ? t('mandatorySection.continue') : t('mandatorySection.start')}
          </Button>
        </Link>
      </div>
    </div>
  )
}

function CourseCard({ course }: { course: any }) {
  const categoryLabel = useCategoryLabel()
  const { t } = useTranslation('dashboard')
  const progress = course.progress || 0
  const isCompleted = course.isCompleted === true

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-sm ${isCompleted ? 'border-green-200 bg-green-50/20 dark:bg-green-950/10 dark:border-green-800' : ''}`}>
      <div className="flex flex-col md:flex-row">
        {/* Vignette thématique dynamique */}
        <div className={`w-full md:w-44 h-28 md:h-auto bg-gradient-to-br ${categoryGradient(course.category)} flex flex-col items-center justify-center p-3 text-white relative shrink-0 overflow-hidden`}>
          {course.thumbnail_url || course.image_url ? (
            <img src={course.thumbnail_url || course.image_url} alt={course.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <BookOpen className="h-8 w-8 text-white/90" />
          )}
        </div>

        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="secondary" className="mb-0 text-xs">{categoryLabel(course.category)}</Badge>
                {course.isMandatory && (
                  <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs">{t('catalog.required')}</Badge>
                )}
                {isCompleted && (
                  <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">{t('course.completed')}</Badge>
                )}
              </div>
              <h3 className="font-semibold text-base text-foreground leading-snug">{course.title}</h3>
              {!isCompleted && <DueDateLabel dueDate={course.dueDate} className="mt-1" />}
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">{t('course.progress')}</span>
              <span className="font-semibold">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            {isCompleted && (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1.5">{t('course.completedNotice')}</p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between pt-2 border-t border-border/40">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {course.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {course.duration}
                </span>
              )}
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" />
                {t('course.lessonsCount', { completed: course.completedLessons || 0, total: course.totalLessons || 0 })}
              </span>
            </div>
            <Link to={`/courses/${course.publicId || course.id}`}>
              <Button size="sm" className="h-8 text-xs">
                <Play className="h-3.5 w-3.5 mr-1" /> {isCompleted ? t('course.review') : t('course.continue')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}

function UpcomingSession({
  title,
  date,
  instructor,
}: {
  title: string
  date: string
  instructor: string
}) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors border border-border/40">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Calendar className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-xs truncate text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{date} · {instructor}</p>
      </div>
    </div>
  )
}

function LeaderboardItem({
  rank,
  name,
  xp,
  avatar,
  isYou,
}: {
  rank: number
  name: string
  xp: number
  avatar?: string
  isYou?: boolean
}) {
  const { t } = useTranslation('dashboard')
  const rankColors: Record<number, string> = {
    1: 'text-amber-500 font-extrabold',
    2: 'text-slate-400 font-bold',
    3: 'text-amber-700 font-bold',
  }

  return (
    <div className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${isYou ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/40'}`}>
      <span className={`w-5 text-center text-sm ${rankColors[rank] || 'text-muted-foreground'}`}>#{rank}</span>
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={avatar} />
        <AvatarFallback className="text-[10px]">{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">
          {name} {isYou && <span className="text-primary font-semibold">{t('leaderboard.you')}</span>}
        </p>
      </div>
      <span className="text-xs font-semibold text-primary shrink-0">{xp} XP</span>
    </div>
  )
}

function QuizAttemptCard({ attempt }: { attempt: any }) {
  const { t } = useTranslation('dashboard')
  const isPassed = isAttemptPassed(attempt)
  const passPercentage = attempt.passing_score || 60

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-xs ${isPassed ? 'border-green-200 bg-green-50/20 dark:bg-green-950/10 dark:border-green-800' : 'border-orange-200 bg-orange-50/20 dark:bg-orange-950/10 dark:border-orange-800'}`}>
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3 p-3.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm truncate">{attempt.quiz_title || 'Quiz'}</h3>
            <Badge className={`text-[10px] px-2 py-0 ${isPassed ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'}`}>
              {isPassed ? t('quizzes.passed') : t('quizzes.retry')}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {attempt.lesson_title && t('quizzes.lesson', { title: attempt.lesson_title })}
            {attempt.lesson_title && attempt.course_title && ' • '}
            {attempt.course_title && `${attempt.course_title}`}
          </p>
        </div>

        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <div className="text-xl font-bold">{attempt.score}%</div>
            <p className="text-[10px] text-muted-foreground">{t('quizzes.required', { percent: passPercentage })}</p>
          </div>

          <div className="text-right sm:text-center">
            <p className="text-[10px] text-muted-foreground">{t('quizzes.takenOn')}</p>
            <p className="text-xs font-medium">
              {attempt.submitted_at
                ? new Date(attempt.submitted_at).toLocaleDateString(dateLocale(), {
                    day: '2-digit',
                    month: '2-digit',
                  })
                : new Date(attempt.started_at).toLocaleDateString(dateLocale(), {
                    day: '2-digit',
                    month: '2-digit',
                  })}
            </p>
          </div>
        </div>
      </div>
      <div className="px-3.5 pb-3">
        <Progress value={attempt.score} className="h-1.5" />
      </div>
    </Card>
  )
}
