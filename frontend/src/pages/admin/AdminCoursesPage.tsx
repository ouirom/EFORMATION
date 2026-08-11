import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import {
  BookOpen,
  Search,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Users,
  Star,
  Eye,
  EyeOff,
  Copy,
  Settings,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'

export default function AdminCoursesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState<any>(null)
  const [newCourse, setNewCourse] = useState({
    title: '',
    description: '',
    category: '',
    duration: '',
    level: 'beginner',
  })
  const [editCourse, setEditCourse] = useState({
    title: '',
    description: '',
    category: '',
    duration: '',
    level: 'beginner',
    isPublished: false,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-courses', { search, status: statusFilter }],
    queryFn: () => api.courses.list({
      search,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }),
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => {
      const token = localStorage.getItem('accessToken')
      console.log('Token présent:', !!token)
      console.log('Creating course with data:', data)
      return api.courses.create(data)
    },
    onSuccess: (result) => {
      console.log('Course created successfully:', result)
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      toast({ title: 'Succès', description: 'Formation créée avec succès' })
      setIsAddDialogOpen(false)
      setNewCourse({ title: '', description: '', category: '', duration: '', level: 'beginner' })
    },
    onError: (error: any) => {
      console.error('Error creating course:', error)
      console.error('Error response:', error.response?.data)
      console.error('Error status:', error.response?.status)
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.error?.message || error.message || 'Impossible de créer la formation',
        variant: 'destructive'
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => {
      console.log('Updating course:', id, data)
      return api.courses.update(id, data)
    },
    onSuccess: (result) => {
      console.log('Course updated successfully:', result)
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      toast({ title: 'Succès', description: 'Formation mise à jour avec succès' })
      setIsEditDialogOpen(false)
      setSelectedCourse(null)
    },
    onError: (error: any) => {
      console.error('Error updating course:', error)
      console.error('Error response:', error.response?.data)
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.error?.message || error.message || 'Impossible de mettre à jour la formation',
        variant: 'destructive'
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.courses.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      toast({ title: 'Succès', description: 'Formation supprimée avec succès' })
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || 'Impossible de supprimer la formation',
        variant: 'destructive'
      })
    },
  })

  const togglePublishMutation = useMutation({
    mutationFn: (course: any) =>
      course.isPublished ? api.courses.unpublish(course.id) : api.courses.publish(course.id),
    onSuccess: (_result, course) => {
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      toast({
        title: 'Succès',
        description: course.isPublished ? 'Formation dépubliée' : 'Formation publiée avec succès',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || 'Impossible de changer le statut de publication',
        variant: 'destructive',
      })
    },
  })

  const cloneMutation = useMutation({
    mutationFn: (id: number) => api.courses.clone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      toast({ title: 'Succès', description: 'Formation dupliquée avec succès' })
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || 'Impossible de dupliquer la formation',
        variant: 'destructive',
      })
    },
  })

  const handleCreateCourse = () => {
    if (!newCourse.title) {
      toast({ title: 'Erreur', description: 'Le titre est obligatoire', variant: 'destructive' })
      return
    }
    // Préparer les données en filtrant les valeurs vides et en convertissant duration
    const courseData: any = {
      title: newCourse.title,
      description: newCourse.description || undefined,
      category: newCourse.category || undefined,
      level: newCourse.level || undefined,
    }
    if (newCourse.duration && newCourse.duration.trim() !== '') {
      courseData.duration = parseInt(newCourse.duration, 10)
    }
    createMutation.mutate(courseData)
  }

  const handleEditCourse = (course: any) => {
    setSelectedCourse(course)
    setEditCourse({
      title: course.title || '',
      description: course.description || '',
      category: course.category || '',
      duration: course.duration || '',
      level: course.level || 'beginner',
      isPublished: !!course.isPublished,
    })
    setIsEditDialogOpen(true)
  }

  const handleUpdateCourse = () => {
    if (!selectedCourse) return
    // Préparer les données en filtrant les valeurs vides et en convertissant duration
    const courseData: any = {
      title: editCourse.title,
      description: editCourse.description || undefined,
      category: editCourse.category || undefined,
      level: editCourse.level || undefined,
      isPublished: editCourse.isPublished,
    }
    if (editCourse.duration && String(editCourse.duration).trim() !== '') {
      courseData.duration = parseInt(String(editCourse.duration), 10)
    }
    updateMutation.mutate({ id: selectedCourse.id, data: courseData })
  }

  const handleDeleteCourse = (course: any) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer "${course.title}" ?`)) {
      deleteMutation.mutate(course.id)
    }
  }

  if (isLoading) {
    return <PageLoading />
  }

  // Utiliser les données de l'API, avec fallback vide si pas de données
  const courses = data || []

  const statusLabels: Record<string, { label: string; color: string }> = {
    true: { label: 'Publié', color: 'bg-green-100 text-green-800' },
    false: { label: 'Brouillon', color: 'bg-yellow-100 text-yellow-800' },
    published: { label: 'Publié', color: 'bg-green-100 text-green-800' },
    draft: { label: 'Brouillon', color: 'bg-yellow-100 text-yellow-800' },
    archived: { label: 'Archivé', color: 'bg-gray-100 text-gray-800' },
  }

  const levelLabels: Record<string, string> = {
    beginner: 'Débutant',
    intermediate: 'Intermédiaire',
    advanced: 'Avancé',
    expert: 'Expert',
  }

  const categoryLabels: Record<string, string> = {
    technology: 'Technologie',
    management: 'Management',
    marketing: 'Marketing',
    finance: 'Finance',
    hr: 'Ressources Humaines',
    'soft-skills': 'Soft Skills',
    compliance: 'Conformité',
    other: 'Autre',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestion des cours</h1>
          <p className="text-muted-foreground">
            {courses.length} cours au total
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau cours
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{courses.length}</p>
                <p className="text-sm text-muted-foreground">Total cours</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Eye className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {courses.filter((c: any) => c.isPublished).length}
                </p>
                <p className="text-sm text-muted-foreground">Publiés</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Edit className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {courses.filter((c: any) => !c.isPublished).length}
                </p>
                <p className="text-sm text-muted-foreground">Brouillons</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {courses.reduce((acc: number, c: any) => acc + (c.enrolledCount || 0), 0)}
                </p>
                <p className="text-sm text-muted-foreground">Total inscrits</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un cours..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="published">Publié</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="archived">Archivé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Toutes catégories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            <SelectItem value="tech">Technologie</SelectItem>
            <SelectItem value="management">Management</SelectItem>
            <SelectItem value="soft-skills">Soft Skills</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Courses Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-4 font-medium">Cours</th>
                  <th className="text-left p-4 font-medium">Catégorie</th>
                  <th className="text-left p-4 font-medium">Niveau</th>
                  <th className="text-left p-4 font-medium">Statut</th>
                  <th className="text-left p-4 font-medium">Modules</th>
                  <th className="text-left p-4 font-medium">Note</th>
                  <th className="text-right p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Aucun cours trouvé. Cliquez sur "Nouveau cours" pour en créer un.
                    </td>
                  </tr>
                ) : (
                  courses.map((course: any) => (
                    <tr key={course.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <div>
                          <p className="font-medium">{course.title}</p>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                            {course.description || 'Pas de description'}
                          </p>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">
                          {categoryLabels[course.category] || course.category || 'Non défini'}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <span className="text-sm">
                          {levelLabels[course.level] || course.level || '-'}
                        </span>
                      </td>
                      <td className="p-4">
                        <Badge className={statusLabels[String(course.isPublished)]?.color || statusLabels[course.status]?.color || 'bg-gray-100 text-gray-800'}>
                          {statusLabels[String(course.isPublished)]?.label || statusLabels[course.status]?.label || (course.isPublished ? 'Publié' : 'Brouillon')}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <BookOpen className="h-4 w-4 text-muted-foreground" />
                          <span>{course.moduleCount || 0}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {course.avgRating && course.avgRating > 0 ? (
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span>{Number(course.avgRating).toFixed(1)}</span>
                            <span className="text-xs text-muted-foreground">({course.reviewCount || 0})</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    <td className="p-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/courses/${course.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Voir
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/admin/courses/${course.id}/edit`}>
                              <Settings className="h-4 w-4 mr-2" />
                              Gérer le contenu
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditCourse(course)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Modifier les infos
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => togglePublishMutation.mutate(course)}
                            disabled={togglePublishMutation.isPending}
                          >
                            {course.isPublished ? (
                              <>
                                <EyeOff className="h-4 w-4 mr-2" />
                                Dépublier
                              </>
                            ) : (
                              <>
                                <Eye className="h-4 w-4 mr-2" />
                                Publier
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => cloneMutation.mutate(course.id)}
                            disabled={cloneMutation.isPending}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Dupliquer
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteCourse(course)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Course Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouvelle formation</DialogTitle>
            <DialogDescription>
              Créez une nouvelle formation pour vos apprenants
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titre *</Label>
              <Input
                id="title"
                placeholder="Ex: Introduction au Machine Learning"
                value={newCourse.title}
                onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Décrivez le contenu de la formation..."
                rows={4}
                value={newCourse.description}
                onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie</Label>
                <Select 
                  value={newCourse.category} 
                  onValueChange={(value) => setNewCourse({ ...newCourse, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technology">Technologie</SelectItem>
                    <SelectItem value="management">Management</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="hr">Ressources Humaines</SelectItem>
                    <SelectItem value="soft-skills">Soft Skills</SelectItem>
                    <SelectItem value="compliance">Conformité</SelectItem>
                    <SelectItem value="other">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="level">Niveau</Label>
                <Select 
                  value={newCourse.level} 
                  onValueChange={(value) => setNewCourse({ ...newCourse, level: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Débutant</SelectItem>
                    <SelectItem value="intermediate">Intermédiaire</SelectItem>
                    <SelectItem value="advanced">Avancé</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Durée estimée</Label>
              <Input
                id="duration"
                placeholder="Ex: 8h 30min"
                value={newCourse.duration}
                onChange={(e) => setNewCourse({ ...newCourse, duration: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={createMutation.isPending}>
              Annuler
            </Button>
            <Button onClick={handleCreateCourse} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Création...' : 'Créer la formation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Course Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier la formation</DialogTitle>
            <DialogDescription>
              Modifiez les informations de la formation
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editTitle">Titre *</Label>
              <Input
                id="editTitle"
                value={editCourse.title}
                onChange={(e) => setEditCourse({ ...editCourse, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editDescription">Description</Label>
              <Textarea
                id="editDescription"
                rows={4}
                value={editCourse.description}
                onChange={(e) => setEditCourse({ ...editCourse, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editCategory">Catégorie</Label>
                <Select 
                  value={editCourse.category || "none"} 
                  onValueChange={(value) => setEditCourse({ ...editCourse, category: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Non défini</SelectItem>
                    <SelectItem value="technology">Technologie</SelectItem>
                    <SelectItem value="management">Management</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="hr">Ressources Humaines</SelectItem>
                    <SelectItem value="soft-skills">Soft Skills</SelectItem>
                    <SelectItem value="compliance">Conformité</SelectItem>
                    <SelectItem value="other">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editLevel">Niveau</Label>
                <Select 
                  value={editCourse.level} 
                  onValueChange={(value) => setEditCourse({ ...editCourse, level: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Débutant</SelectItem>
                    <SelectItem value="intermediate">Intermédiaire</SelectItem>
                    <SelectItem value="advanced">Avancé</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editDuration">Durée estimée</Label>
                <Input
                  id="editDuration"
                  value={editCourse.duration}
                  onChange={(e) => setEditCourse({ ...editCourse, duration: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editStatus">Statut</Label>
                <Select
                  value={editCourse.isPublished ? 'published' : 'draft'}
                  onValueChange={(value) => setEditCourse({ ...editCourse, isPublished: value === 'published' })}
                >
                  <SelectTrigger id="editStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="published">Publié</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={updateMutation.isPending}>
              Annuler
            </Button>
            <Button onClick={handleUpdateCourse} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
