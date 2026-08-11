import { useState } from 'react'
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
import { getInitials } from '@/lib/utils'
import {
  BookOpen,
  Clock,
  Play,
  ArrowRight,
  Calendar,
  CheckCircle,
  Target,
  Flame,
  Trophy,
  Star,
  Zap,
  BarChart3,
} from 'lucide-react'
import { api } from '@/services/api'

export default function DashboardPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('general')

  // Récupérer les badges de l'utilisateur
  const { data: userBadgesData, isLoading: loadingBadges } = useQuery({
    queryKey: ['my-badges-dashboard'],
    queryFn: () => api.badges.getUserBadges(),
    staleTime: 60 * 1000,
  })

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.analytics.getDashboard(),
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
  })

  // Récupérer uniquement les cours attribués à l'utilisateur
  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ['assigned-courses-dashboard'],
    queryFn: async () => {
      try {
        // Récupérer les cours attribués à l'utilisateur
        const assignedCoursesResponse = await api.assignments.getMyCourses() as any;
        const coursesList = Array.isArray(assignedCoursesResponse) ? assignedCoursesResponse : assignedCoursesResponse?.data || [];
        
        // Récupérer la progression pour chaque cours
        if (coursesList.length > 0 && user?.id) {
          try {
            const response = await (api as any).get(`/users/${user.id}/progress`);
            let progressData: any = [];
            if (response?.data?.data) {
              progressData = response.data.data;
            } else if (response?.data) {
              progressData = response.data;
            }
            
            return coursesList.map((course: any) => {
              const courseProgress = progressData.find((p: any) => p.course_id === course.id);
              
              // Calculer la progression réelle
              const totalQuizzes = courseProgress?.total_quizzes || 0;
              const quizzesAttempted = courseProgress?.quizzes_attempted || 0;
              const progressPercent = totalQuizzes > 0 ? Math.round((quizzesAttempted / totalQuizzes) * 100) : 0;
              
              return {
                ...course,
                // /assignments/my-courses only reports isMandatory (no separate
                // "recommended" flag exists in the data model) — an assigned course
                // is either mandatory or, by elimination, recommended.
                required: course.isMandatory === true,
                recommended: course.isMandatory !== true,
                category: course.category || 'Formation',
                // Progression
                progress: progressPercent,
                completedLessons: quizzesAttempted,
                totalLessons: totalQuizzes,
                bestScore: courseProgress?.best_score || 0,
                isCompleted: courseProgress?.completed === 1 || progressPercent === 100,
                isEnrolled: true, // Ces cours sont attribués à l'utilisateur
              };
            });
          } catch (progressError) {
            console.error('Erreur lors du chargement de la progression:', progressError);
            return coursesList;
          }
        }
        
        return coursesList.map((course: any) => ({
          ...course,
          required: course.isMandatory === true,
          recommended: course.isMandatory !== true,
          category: course.category || 'Formation',
          progress: 0,
          completedLessons: 0,
          totalLessons: 0,
          bestScore: 0,
          isCompleted: false,
          isEnrolled: true,
        }));
      } catch (error) {
        console.error('Erreur lors du chargement des cours attribués:', error);
        return [];
      }
    },
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
  })

  // Récupérer les quiz effectués par l'utilisateur
  const { data: attempts, isLoading: loadingAttempts } = useQuery({
    queryKey: ['user-quiz-attempts'],
    queryFn: () => api.attempts.getByUser(),
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
  })

  if (loadingStats || loadingCourses || loadingBadges || loadingAttempts) {
    return <PageLoading />
  }

  const allCourses = Array.isArray(courses) ? courses : []

  // Grouper les cours par type
  const groupedCourses = {
    completed: allCourses.filter((c: any) => c.isCompleted === true),
    required: allCourses.filter((c: any) => c.required === true && c.isCompleted !== true),
    recommended: allCourses.filter((c: any) => c.recommended === true && c.isCompleted !== true && c.required !== true),
    general: allCourses.filter((c: any) => c.isCompleted !== true && c.required !== true && c.recommended !== true),
  }

  const dashboardStats = {
    coursesEnrolled: groupedCourses.general.length + groupedCourses.required.length + groupedCourses.recommended.length,
    coursesCompleted: groupedCourses.completed.length,
    lessonsStarted: stats?.lessonsStarted || 0,
    lessonsCompleted: stats?.lessonsCompleted || 0,
    totalHours: stats?.totalHours || 0,
    totalMinutes: stats?.totalMinutes || 0,
    totalSeconds: stats?.totalSeconds || 0,
    quizzesTaken: attempts?.length || 0,
    quizzesPassed: attempts?.filter((a: any) => a.score >= (a.passing_score || 60)).length || 0,
    avgQuizScore: stats?.avgQuizScore || 0,
    badges: userBadgesData?.length || 0,
    streak: stats?.streak || 0,
    xp: stats?.xp || 0,
    avgProgress: stats?.avgProgress || 0,
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            Bonjour, {user?.displayName?.split(' ')[0] || 'Utilisateur'}! 👋
          </h1>
          <p className="text-muted-foreground">
            Bienvenue sur votre espace d'apprentissage
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500/10">
            <Flame className="h-5 w-5 text-orange-500" />
            <span className="font-semibold text-orange-500">{dashboardStats.streak} jours</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10">
            <Target className="h-5 w-5 text-primary" />
            <span className="font-semibold text-primary">{dashboardStats.xp} XP</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cours</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.coursesEnrolled}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats.coursesCompleted} terminé{dashboardStats.coursesCompleted > 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leçons</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.lessonsCompleted}</div>
            <p className="text-xs text-muted-foreground">
              sur {dashboardStats.lessonsStarted} commencée{dashboardStats.lessonsStarted > 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <div className="text-2xl font-bold">{dashboardStats.quizzesPassed}/{dashboardStats.quizzesTaken}</div>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Temps d'apprentissage</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardStats.totalHours > 0 
                ? `${dashboardStats.totalHours}h ${dashboardStats.totalMinutes % 60}min`
                : `${dashboardStats.totalMinutes}min`
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats.badges} badge{dashboardStats.badges > 1 ? 's' : ''} obtenu{dashboardStats.badges > 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Course Catalog with Tabs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Catalogue des Formations</h2>
            <Link to="/courses">
              <Button variant="ghost" size="sm">
                Voir tout <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general" className="text-xs sm:text-sm">
                Général ({groupedCourses.general.length})
              </TabsTrigger>
              <TabsTrigger value="required" className="text-xs sm:text-sm">
                Obligatoire ({groupedCourses.required.length})
              </TabsTrigger>
              <TabsTrigger value="recommended" className="text-xs sm:text-sm">
                Recommandé ({groupedCourses.recommended.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="text-xs sm:text-sm">
                Terminée ({groupedCourses.completed.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-3 mt-4">
              {groupedCourses.general.length > 0 ? (
                <div className="grid gap-3">
                  {groupedCourses.general.slice(0, 6).map((course: any) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              ) : (
                <Card className="p-6 text-center">
                  <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Aucun cours général disponible</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="required" className="space-y-3 mt-4">
              {groupedCourses.required.length > 0 ? (
                <div className="grid gap-3">
                  {groupedCourses.required.slice(0, 6).map((course: any) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              ) : (
                <Card className="p-6 text-center">
                  <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Aucun cours obligatoire</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="recommended" className="space-y-3 mt-4">
              {groupedCourses.recommended.length > 0 ? (
                <div className="grid gap-3">
                  {groupedCourses.recommended.slice(0, 6).map((course: any) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              ) : (
                <Card className="p-6 text-center">
                  <Star className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Aucun cours recommandé</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-3 mt-4">
              {groupedCourses.completed.length > 0 ? (
                <div className="grid gap-3">
                  {groupedCourses.completed.slice(0, 6).map((course: any) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              ) : (
                <Card className="p-6 text-center">
                  <Trophy className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Aucun cours terminé pour l'instant</p>
                  <p className="text-xs text-muted-foreground mt-2">Complétez des formations pour les voir ici</p>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          {/* Quiz Effectués */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Quiz Effectués
              </h2>
              <Link to="/courses">
                <Button variant="ghost" size="sm">
                  Voir l'historique <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            {attempts && attempts.length > 0 ? (
              <div className="space-y-2">
                {attempts.slice(0, 5).map((attempt: any) => (
                  <QuizAttemptCard key={attempt.id} attempt={attempt} />
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center">
                <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Aucun quiz effectué pour l'instant</p>
                <p className="text-xs text-muted-foreground mt-2">Commencez vos formations et passez les quiz</p>
              </Card>
            )}
          </div>
        </div>
        <div className="space-y-6">
          {/* Upcoming Sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sessions à venir</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <UpcomingSession
                title="Introduction au Machine Learning"
                date="Aujourd'hui, 14:00"
                instructor="Marie Dupont"
              />
              <UpcomingSession
                title="Workshop React Avancé"
                date="Demain, 10:00"
                instructor="Thomas Martin"
              />
              <Link to="/live">
                <Button variant="outline" className="w-full">
                  Voir toutes les sessions
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Badges obtenus - Mise en relief */}
          <Card className="border-2 border-yellow-400 bg-gradient-to-br from-yellow-50/80 to-amber-50/80 dark:from-yellow-900/20 dark:to-amber-900/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-6 w-6 text-yellow-500 animate-bounce" />
                <CardTitle className="text-xl font-bold text-yellow-700 dark:text-yellow-300">Mes Badges Obtenus</CardTitle>
                {userBadgesData && userBadgesData.length > 0 && (
                  <span className="ml-auto bg-yellow-500 text-white rounded-full px-3 py-1 text-sm font-bold">
                    {userBadgesData.length}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {userBadgesData && userBadgesData.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {userBadgesData.map((badge: any) => (
                    <div
                      key={badge.id}
                      className={`p-4 rounded-xl text-center transition-all duration-300 hover:scale-110 hover:shadow-lg cursor-pointer ${
                        badge.badge_type === 'trophy'
                          ? 'bg-gradient-to-br from-yellow-200 to-amber-200 dark:from-yellow-900/50 dark:to-amber-900/50 border-2 border-yellow-400 shadow-md'
                          : badge.badge_type === 'quiz'
                          ? 'bg-gradient-to-br from-blue-200 to-cyan-200 dark:from-blue-900/50 dark:to-cyan-900/50 border-2 border-blue-400'
                          : badge.badge_type === 'course'
                          ? 'bg-gradient-to-br from-purple-200 to-pink-200 dark:from-purple-900/50 dark:to-pink-900/50 border-2 border-purple-400'
                          : 'bg-gradient-to-br from-green-200 to-emerald-200 dark:from-green-900/50 dark:to-emerald-900/50 border-2 border-green-400'
                      }`}
                    >
                      <span className="text-5xl mb-2 block animate-pulse">
                        {badge.badge_type === 'trophy' ? '🏆' : badge.badge_type === 'quiz' ? '⭐' : badge.badge_type === 'course' ? '🎓' : '🎖️'}
                      </span>
                      <p className="font-bold text-sm leading-tight">{badge.name}</p>
                      {badge.awarded_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(badge.awarded_at).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground font-medium">Aucun badge obtenu pour l'instant</p>
                  <p className="text-xs text-muted-foreground mt-1">Réussissez des quiz et des cours pour débloquer des badges !</p>
                </div>
              )}
              <Link to="/badges" className="mt-6 block">
                <Button variant="default" className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold">
                  <Trophy className="h-4 w-4 mr-2" />
                  Voir tous les badges
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Leaderboard */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Classement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <LeaderboardItem rank={1} name="Sophie M." xp={3200} avatar="/avatars/1.jpg" />
              <LeaderboardItem rank={2} name="Lucas T." xp={2980} avatar="/avatars/2.jpg" />
              <LeaderboardItem rank={3} name="Emma R." xp={2750} avatar="/avatars/3.jpg" isYou />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function CourseCard({ course }: { course: any }) {
  const progress = course.progress || 0
  const isCompleted = course.isCompleted === true

  return (
    <Card className={`overflow-hidden ${isCompleted ? 'border-green-200 bg-green-50/30 dark:bg-green-950/10 dark:border-green-800' : ''}`}>
      <div className="flex flex-col md:flex-row">
        <div className="w-full md:w-48 h-32 md:h-auto bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="mb-0">{course.category || 'Formation'}</Badge>
                {isCompleted && (
                  <Badge className="bg-green-500 hover:bg-green-600 mb-0">Terminé</Badge>
                )}
              </div>
              <h3 className="font-semibold">{course.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {course.instructor || 'Formateur'}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progression</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            {isCompleted && (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-2">✓ Formation complétée</p>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {course.duration || '2h 30min'}
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                {course.completedLessons || 0}/{course.totalLessons || 0} leçons
              </span>
            </div>
            <Link to={`/courses/${course.id}`}>
              <Button size="sm">
                <Play className="h-4 w-4 mr-1" /> {isCompleted ? 'Revoir' : 'Continuer'}
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
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Calendar className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{title}</p>
        <p className="text-xs text-muted-foreground">{date} · {instructor}</p>
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
  const rankColors: Record<number, string> = {
    1: 'text-yellow-500',
    2: 'text-gray-400',
    3: 'text-orange-500',
  }

  return (
    <div className={`flex items-center gap-3 p-2 rounded-lg ${isYou ? 'bg-primary/10' : ''}`}>
      <span className={`text-lg font-bold ${rankColors[rank] || ''}`}>#{rank}</span>
      <Avatar className="h-8 w-8">
        <AvatarImage src={avatar} />
        <AvatarFallback>{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <p className="text-sm font-medium">
          {name} {isYou && <span className="text-primary">(vous)</span>}
        </p>
      </div>
      <span className="text-sm font-semibold text-primary">{xp} XP</span>
    </div>
  )
}

function QuizAttemptCard({ attempt }: { attempt: any }) {
  const isPassed = attempt.score >= (attempt.passing_score || 60);
  const passPercentage = attempt.passing_score || 60;
  
  return (
    <Card className={`overflow-hidden transition-all hover:shadow-md ${isPassed ? 'border-green-200 bg-green-50/30 dark:bg-green-950/10 dark:border-green-800' : 'border-orange-200 bg-orange-50/30 dark:bg-orange-950/10 dark:border-orange-800'}`}>
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold">{attempt.quiz_title || 'Quiz'}</h3>
            <Badge className={isPassed ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'}>
              {isPassed ? '✓ Réussi' : '⚠ À reprendre'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {attempt.lesson_title && `Leçon: ${attempt.lesson_title}`}
            {attempt.lesson_title && attempt.course_title && ' • '}
            {attempt.course_title && `${attempt.course_title}`}
          </p>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-2xl font-bold">{attempt.score}%</div>
            <p className="text-xs text-muted-foreground">Requis: {passPercentage}%</p>
          </div>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Passé le</p>
            <p className="text-sm font-medium">
              {attempt.submitted_at 
                ? new Date(attempt.submitted_at).toLocaleDateString('fr-FR', { 
                    day: '2-digit', 
                    month: '2-digit' 
                  })
                : new Date(attempt.started_at).toLocaleDateString('fr-FR', { 
                    day: '2-digit', 
                    month: '2-digit' 
                  })}
            </p>
          </div>
        </div>
      </div>
      <div className="px-4 pb-4">
        <Progress value={attempt.score} className="h-2" />
      </div>
    </Card>
  )
}
