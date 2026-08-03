import { useState } from 'react'
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
import { formatDuration } from '@/lib/utils'

export default function CoursesPage() {
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

  // Fetch user's course progress
  const { data: userProgress } = useQuery({
    queryKey: ['user-course-progress'],
    queryFn: async () => {
      try {
        const response = await api.get('/users/me/progress');
        return response.data.data || [];
      } catch (error) {
        console.error('Error fetching user progress:', error);
        return [];
      }
    },
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
          <h1 className="text-3xl font-bold">Catalogue de formations</h1>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">
              Erreur lors du chargement des formations. Veuillez réessayer plus tard.
            </p>
            <p className="text-sm text-red-600 mt-2">{(error as any)?.message}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const courses = data || []
  const myAssignedCourses = assignedCourses || []
  const progressData = userProgress || []
  const courseCategories = categories || [
    { id: 'tech', name: 'Technologie' },
    { id: 'management', name: 'Management' },
    { id: 'soft-skills', name: 'Soft Skills' },
    { id: 'compliance', name: 'Conformité' },
  ]

  // Enrich courses with progress data
  const enrichedCourses = courses.map((course: any) => {
    const progress = progressData.find((p: any) => p.id === course.id || p.course_id === course.id);
    return {
      ...course,
      progress: progress?.progress || 0,
      isCompleted: progress?.progress === 100 || progress?.isCompleted || false,
    };
  });

  const enrichedAssignedCourses = myAssignedCourses.map((course: any) => {
    const progress = progressData.find((p: any) => p.id === course.id || p.course_id === course.id);
    return {
      ...course,
      progress: progress?.progress || 0,
      isCompleted: progress?.progress === 100 || progress?.isCompleted || false,
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
        <h1 className="text-3xl font-bold">Catalogue de formations</h1>
        <p className="text-muted-foreground">
          Découvrez nos formations et développez vos compétences
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="all">Catalogue</TabsTrigger>
          <TabsTrigger value="assigned">
            Mes formations
            {myAssignedCourses.length > 0 && (
              <span className="ml-2 bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-xs">
                {myAssignedCourses.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="mandatory">Obligatoires</TabsTrigger>
          <TabsTrigger value="completed">Terminées</TabsTrigger>
          <TabsTrigger value="recommended">Recommandées</TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 my-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une formation..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {courseCategories.map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Niveau" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous niveaux</SelectItem>
                <SelectItem value="beginner">Débutant</SelectItem>
                <SelectItem value="intermediate">Intermédiaire</SelectItem>
                <SelectItem value="advanced">Avancé</SelectItem>
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
              <h3 className="font-semibold mb-2">Aucune formation disponible</h3>
              <p className="text-muted-foreground">
                Essayez de modifier vos critères de recherche
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
              <h3 className="font-semibold mb-2">Aucune formation attribuée</h3>
              <p className="text-muted-foreground">
                Vous n'avez pas encore de formations assignées
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
              <h3 className="font-semibold mb-2">Aucune formation obligatoire</h3>
              <p className="text-muted-foreground">
                Vous n'avez pas de formations obligatoires en cours
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
              <h3 className="font-semibold mb-2">Formations terminées</h3>
              <p className="text-muted-foreground">
                Vos formations complétées apparaîtront ici
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CourseGridCard({ course, showAssignment = false, isCompleted = false }: { course: any; showAssignment?: boolean; isCompleted?: boolean }) {
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
              <p className="text-white font-semibold">Formation complétée</p>
            </div>
          </div>
        )}
        {!isCompleted && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Link to={`/courses/${course.id}`}>
              <Button>
                <Play className="h-4 w-4 mr-2" />
                Commencer
              </Button>
            </Link>
          </div>
        )}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          {isCompleted && (
            <Badge className="bg-green-600 text-white">✓ Terminée</Badge>
          )}
          {showAssignment && course.isMandatory && (
            <Badge variant="destructive">Obligatoire</Badge>
          )}
          {showAssignment && course.dueDate && (
            <Badge variant="secondary" className="text-xs">
              Échéance: {new Date(course.dueDate).toLocaleDateString('fr-FR')}
            </Badge>
          )}
        </div>
      </div>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline">{course.category || 'Formation'}</Badge>
          {course.level && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${levelColors[course.level] || levelColors.beginner}`}>
              {course.level === 'beginner' ? 'Débutant' : course.level === 'advanced' ? 'Avancé' : 'Intermédiaire'}
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
            {course.moduleCount || 0} modules
          </span>
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        {isCompleted ? (
          <div className="w-full text-center py-2">
            <div className="flex items-center justify-center gap-2 text-green-600 font-semibold">
              <CheckCircle className="h-4 w-4" />
              Complétée à 100%
            </div>
          </div>
        ) : (
          <Link to={`/courses/${course.id}`} className="w-full">
            <Button variant="outline" className="w-full">
              Voir le détail
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  )
}

function CourseListCard({ course, showAssignment = false, isCompleted = false }: { course: any; showAssignment?: boolean; isCompleted?: boolean }) {
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
              Obligatoire
            </Badge>
          )}
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">{course.category || 'Formation'}</Badge>
                {isCompleted && (
                  <Badge className="bg-green-600 text-white">✓ Terminée</Badge>
                )}
                {showAssignment && course.dueDate && (
                  <Badge variant="secondary">
                    Échéance: {new Date(course.dueDate).toLocaleDateString('fr-FR')}
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold text-lg">{course.title}</h3>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {course.description}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-medium">{course.rating || '4.5'}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {course.duration || '2h 30min'}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {course.enrolledCount || 0} inscrits
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                {course.lessonsCount || 10} leçons
              </span>
            </div>
            {isCompleted ? (
              <div className="flex items-center gap-2 text-green-600 font-semibold">
                <CheckCircle className="h-4 w-4" />
                Complétée
              </div>
            ) : (
              <Link to={`/courses/${course.id}`}>
                <Button>
                  <Play className="h-4 w-4 mr-2" />
                  {course.enrolled ? 'Continuer' : 'Commencer'}
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
