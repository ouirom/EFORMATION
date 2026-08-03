import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  Heart,
  ArrowLeft,
} from 'lucide-react'
import { api } from '@/services/api'

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const courseId = id ? parseInt(id, 10) : null

  // Fetch full course structure with modules, lessons, quizzes
  const { data: course, isLoading, error } = useQuery({
    queryKey: ['course-full', courseId],
    queryFn: async () => {
      const response = await api.get(`/courses/${courseId}/full`)
      return response.data.data
    },
    enabled: !!courseId,
  })

  console.log('CourseDetailPage - courseId:', courseId, 'course:', course, 'isLoading:', isLoading, 'error:', error)

  const enrollMutation = useMutation({
    mutationFn: () => api.courses.enroll(courseId!),
    onSuccess: () => {
      toast({
        title: 'Inscription réussie',
        description: 'Vous êtes maintenant inscrit à cette formation',
      })
      queryClient.invalidateQueries({ queryKey: ['course-full', courseId] })
    },
    onError: (err: any) => {
      toast({
        title: 'Erreur',
        description: err.response?.data?.error?.message || "Une erreur s'est produite lors de l'inscription",
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
        <h2 className="text-xl font-semibold mb-2">Formation non trouvée</h2>
        <p className="text-muted-foreground mb-4">Cette formation n'existe pas ou n'est pas accessible.</p>
        <Link to="/courses">
          <Button>Retour au catalogue</Button>
        </Link>
      </div>
    )
  }

  // Build course data from real API response
  const courseModules = course.modules || []
  
  // Default objectives and prerequisites if not provided
  const defaultObjectives = [
    'Maîtriser les concepts fondamentaux',
    'Appliquer les connaissances en pratique',
    'Développer des compétences professionnelles',
  ]
  const defaultPrerequisites = ['Aucun prérequis particulier']

  const mergedCourse = {
    id: course.id,
    title: course.title || 'Formation',
    description: course.description || 'Description de la formation',
    instructor: {
      name: course.creatorName || 'Formateur',
      title: 'Instructeur',
      avatar: '/avatars/instructor.jpg',
    },
    category: course.category || 'Formation',
    level: course.level || 'intermediate',
    duration: course.duration ? `${course.duration}h` : '-',
    enrolledCount: course.enrolledCount || 0,
    rating: course.avgRating || 4.5,
    reviewsCount: course.reviewCount || 0,
    enrolled: true, // For now, assume user can access
    progress: 0,
    modules: courseModules.map((m: any) => ({
      id: m.id,
      title: m.title,
      lessons: (m.lessons || []).map((l: any) => ({
        id: l.id,
        title: l.title,
        duration: l.duration_min ? `${l.duration_min}min` : '-',
        type: l.type || 'video',
        completed: false,
        quizzes: l.quizzes || [],
      })),
    })),
    objectives: course.objectives || defaultObjectives,
    prerequisites: course.prerequisites || defaultPrerequisites,
  }

  const totalLessons = mergedCourse.modules.reduce((acc: number, m: any) => acc + m.lessons.length, 0)
  const completedLessons = mergedCourse.modules.reduce(
    (acc: number, m: any) => acc + m.lessons.filter((l: any) => l.completed).length,
    0
  )

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Retour
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
                  {mergedCourse.level === 'beginner' ? 'Débutant' : 
                   mergedCourse.level === 'advanced' ? 'Avancé' : 'Intermédiaire'}
                </Badge>
              </div>
              <h1 className="text-3xl font-bold mb-4">{mergedCourse.title}</h1>
              <p className="text-muted-foreground mb-6">{mergedCourse.description}</p>

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium">{mergedCourse.rating}</span>
                  <span className="text-muted-foreground">({mergedCourse.reviewsCount} avis)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span>{mergedCourse.enrolledCount} inscrits</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span>{mergedCourse.duration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <span>{totalLessons} leçons</span>
                </div>
              </div>

              {/* Instructor */}
              <div className="flex items-center gap-4 mt-6 pt-6 border-t">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={mergedCourse.instructor.avatar} />
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
              <TabsTrigger value="content">Contenu</TabsTrigger>
              <TabsTrigger value="objectives">Objectifs</TabsTrigger>
              <TabsTrigger value="reviews">Avis</TabsTrigger>
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
                      {module.lessons.length} leçons · {module.lessons.filter((l: any) => l.completed).length} terminées
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {module.lessons.map((lesson: any) => (
                        <LessonItem
                          key={lesson.id}
                          lesson={lesson}
                          courseId={courseId!}
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
                  <CardTitle>Ce que vous apprendrez</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid md:grid-cols-2 gap-4">
                    {mergedCourse.objectives.map((obj: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                        <span>{obj}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Prérequis</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {mergedCourse.prerequisites.map((prereq: string, i: number) => (
                      <li key={i} className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        <span>{prereq}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reviews" className="mt-4">
              <Card>
                <CardContent className="p-6 text-center">
                  <Star className="h-12 w-12 mx-auto text-yellow-400 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">
                    Note moyenne: {mergedCourse.rating}/5
                  </h3>
                  <p className="text-muted-foreground">
                    Basée sur {mergedCourse.reviewsCount} avis
                  </p>
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
                      <span>Progression</span>
                      <span className="font-medium">
                        {Math.round((completedLessons / totalLessons) * 100)}%
                      </span>
                    </div>
                    <Progress value={(completedLessons / totalLessons) * 100} />
                    <p className="text-xs text-muted-foreground mt-2">
                      {completedLessons}/{totalLessons} leçons terminées
                    </p>
                  </div>
                  <Link to={`/courses/${courseId}/learn`}>
                    <Button className="w-full" size="lg">
                      <Play className="h-4 w-4 mr-2" />
                      Continuer le cours
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <p className="text-3xl font-bold text-primary mb-2">Gratuit</p>
                    <p className="text-sm text-muted-foreground">Accès illimité</p>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => enrollMutation.mutate()}
                    disabled={enrollMutation.isPending}
                  >
                    {enrollMutation.isPending ? 'Inscription...' : "S'inscrire maintenant"}
                  </Button>
                </>
              )}

              <div className="flex items-center justify-center gap-4 mt-4">
                <Button variant="outline" size="sm">
                  <Heart className="h-4 w-4 mr-1" />
                  Favoris
                </Button>
                <Button variant="outline" size="sm">
                  <Share2 className="h-4 w-4 mr-1" />
                  Partager
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
                  <h4 className="font-medium">Certificat de réussite</h4>
                  <p className="text-sm text-muted-foreground">
                    Obtenez un certificat à la fin du cours
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resources */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ressources incluses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Video className="h-4 w-4 text-muted-foreground" />
                <span>12 heures de vidéo</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>25 articles</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Download className="h-4 w-4 text-muted-foreground" />
                <span>15 ressources téléchargeables</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <span>5 quiz d'évaluation</span>
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
  courseId: number
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
    return `/courses/${courseId}/lessons/${lesson.id}`
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
