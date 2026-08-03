import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Plus, 
  Trash2, 
  Users, 
  Building2, 
  BookOpen,
  Search,
  UserPlus,
  Tag,
  Calendar,
  CheckCircle
} from 'lucide-react'

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  )
}

export default function AdminAssignmentsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedCourse, setSelectedCourse] = useState<any>(null)
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [searchUsers, setSearchUsers] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [assignmentData, setAssignmentData] = useState({
    assignmentType: 'user',
    targetIds: [] as number[],
    isMandatory: false,
    dueDate: '',
  })

  // Queries
  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['admin-courses-for-assignment'],
    queryFn: () => api.courses.list(),
  })

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['admin-assignments', selectedCourse?.id],
    queryFn: () => api.assignments.list(selectedCourse?.id),
    enabled: !!selectedCourse,
  })

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.assignments.getCategories(),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users-for-assignment', searchUsers],
    queryFn: () => api.assignments.getUsers(searchUsers),
    enabled: assignmentData.assignmentType === 'user',
  })

  const { data: enterprises = [] } = useQuery({
    queryKey: ['enterprises'],
    queryFn: () => api.organizations.getEnterprises(),
    enabled: assignmentData.assignmentType === 'enterprise',
  })

  const { data: directions = [] } = useQuery({
    queryKey: ['directions'],
    queryFn: () => api.organizations.getDirections(),
    enabled: assignmentData.assignmentType === 'direction',
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.organizations.getServices(),
    enabled: assignmentData.assignmentType === 'service',
  })

  // Mutations
  const createAssignmentMutation = useMutation({
    mutationFn: (data: any) => api.assignments.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      toast({ title: 'Succès', description: 'Attribution créée avec succès' })
      setIsAssignDialogOpen(false)
      setAssignmentData({ assignmentType: 'user', targetIds: [], isMandatory: false, dueDate: '' })
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.error?.message || 'Impossible de créer l\'attribution',
        variant: 'destructive'
      })
    },
  })

  const deleteAssignmentMutation = useMutation({
    mutationFn: (id: number) => api.assignments.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      toast({ title: 'Succès', description: 'Attribution supprimée' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de supprimer l\'attribution', variant: 'destructive' })
    },
  })

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => api.assignments.createCategory(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      toast({ title: 'Succès', description: 'Catégorie créée avec succès' })
      setNewCategory('')
      setIsCategoryDialogOpen(false)
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.error?.message || 'Impossible de créer la catégorie',
        variant: 'destructive'
      })
    },
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => api.assignments.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      toast({ title: 'Succès', description: 'Catégorie supprimée' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de supprimer la catégorie', variant: 'destructive' })
    },
  })

  const handleCreateAssignment = () => {
    if (!selectedCourse || assignmentData.targetIds.length === 0) {
      toast({ title: 'Erreur', description: 'Sélectionnez au moins une cible', variant: 'destructive' })
      return
    }
    createAssignmentMutation.mutate({
      courseId: selectedCourse.id,
      ...assignmentData,
      dueDate: assignmentData.dueDate || undefined,
    })
  }

  const handleToggleTarget = (targetId: number) => {
    setAssignmentData(prev => ({
      ...prev,
      targetIds: prev.targetIds.includes(targetId)
        ? prev.targetIds.filter(id => id !== targetId)
        : [...prev.targetIds, targetId]
    }))
  }

  const getTargetList = () => {
    switch (assignmentData.assignmentType) {
      case 'user': return users
      case 'enterprise': return enterprises
      case 'direction': return directions
      case 'service': return services
      default: return []
    }
  }

  const getTargetLabel = (item: any) => {
    if (assignmentData.assignmentType === 'user') {
      return `${item.displayName} (${item.email})`
    }
    return item.name
  }

  if (coursesLoading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Attributions des formations</h1>
          <p className="text-muted-foreground">
            Gérez les attributions de formations aux utilisateurs et groupes
          </p>
        </div>
      </div>

      <Tabs defaultValue="assignments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assignments">
            <UserPlus className="h-4 w-4 mr-2" />
            Attributions
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Tag className="h-4 w-4 mr-2" />
            Catégories
          </TabsTrigger>
        </TabsList>

        {/* Attributions Tab */}
        <TabsContent value="assignments" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Course Selection */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Formations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
                {courses.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Aucune formation</p>
                ) : (
                  courses.map((course: any) => (
                    <div
                      key={course.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedCourse?.id === course.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedCourse(course)}
                    >
                      <p className="font-medium">{course.title}</p>
                      <div className="flex gap-2 mt-1">
                        {course.category && (
                          <Badge variant="outline" className="text-xs">{course.category}</Badge>
                        )}
                        {course.isPublished ? (
                          <Badge className="bg-green-100 text-green-800 text-xs">Publié</Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-800 text-xs">Brouillon</Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Assignments List */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {selectedCourse ? `Attributions: ${selectedCourse.title}` : 'Sélectionnez une formation'}
                </CardTitle>
                {selectedCourse && (
                  <Button onClick={() => setIsAssignDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Attribuer
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!selectedCourse ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Sélectionnez une formation pour voir ses attributions</p>
                  </div>
                ) : assignmentsLoading ? (
                  <PageLoading />
                ) : assignments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Aucune attribution pour cette formation</p>
                    <Button className="mt-4" onClick={() => setIsAssignDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Créer une attribution
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignments.map((assignment: any) => (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                            assignment.assignmentType === 'user' ? 'bg-blue-100' :
                            assignment.assignmentType === 'enterprise' ? 'bg-purple-100' :
                            assignment.assignmentType === 'direction' ? 'bg-green-100' :
                            'bg-orange-100'
                          }`}>
                            {assignment.assignmentType === 'user' ? (
                              <Users className="h-5 w-5 text-blue-600" />
                            ) : (
                              <Building2 className="h-5 w-5 text-purple-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{assignment.targetName || `ID: ${assignment.targetId}`}</p>
                            <div className="flex gap-2 items-center text-sm text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {assignment.assignmentType === 'user' ? 'Utilisateur' :
                                 assignment.assignmentType === 'enterprise' ? 'Entreprise' :
                                 assignment.assignmentType === 'direction' ? 'Direction' :
                                 assignment.assignmentType === 'service' ? 'Service' : 'Rôle'}
                              </Badge>
                              {assignment.isMandatory && (
                                <Badge className="bg-red-100 text-red-800 text-xs">Obligatoire</Badge>
                              )}
                              {assignment.dueDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(assignment.dueDate).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm('Supprimer cette attribution ?')) {
                              deleteAssignmentMutation.mutate(assignment.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Catégories de formations
              </CardTitle>
              <Button onClick={() => setIsCategoryDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle catégorie
              </Button>
            </CardHeader>
            <CardContent>
              {categoriesLoading ? (
                <PageLoading />
              ) : categories.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucune catégorie</p>
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {categories.map((category: any) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <span className="font-medium">{category.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(`Supprimer la catégorie "${category.name}" ?`)) {
                            deleteCategoryMutation.mutate(category.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assignment Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attribuer la formation</DialogTitle>
            <DialogDescription>
              Attribuez "{selectedCourse?.title}" à des utilisateurs ou groupes
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Type d'attribution</Label>
              <Select 
                value={assignmentData.assignmentType} 
                onValueChange={(value: string) => setAssignmentData(prev => ({ 
                  ...prev, 
                  assignmentType: value,
                  targetIds: [] 
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Utilisateurs</SelectItem>
                  <SelectItem value="enterprise">Entreprise</SelectItem>
                  <SelectItem value="direction">Direction</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {assignmentData.assignmentType === 'user' && (
              <div className="space-y-2">
                <Label>Rechercher des utilisateurs</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher par nom ou email..."
                    className="pl-10"
                    value={searchUsers}
                    onChange={(e) => setSearchUsers(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Sélectionner les cibles ({assignmentData.targetIds.length} sélectionnés)</Label>
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {getTargetList().length === 0 ? (
                  <p className="p-4 text-center text-muted-foreground">Aucun élément trouvé</p>
                ) : (
                  getTargetList().map((item: any) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 ${
                        assignmentData.targetIds.includes(item.id) ? 'bg-primary/5' : ''
                      }`}
                      onClick={() => handleToggleTarget(item.id)}
                    >
                      <div className={`h-5 w-5 rounded border flex items-center justify-center ${
                        assignmentData.targetIds.includes(item.id) 
                          ? 'bg-primary border-primary' 
                          : 'border-gray-300'
                      }`}>
                        {assignmentData.targetIds.includes(item.id) && (
                          <CheckCircle className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <span>{getTargetLabel(item)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Obligatoire</Label>
                <Select 
                  value={assignmentData.isMandatory ? 'true' : 'false'} 
                  onValueChange={(value: string) => setAssignmentData(prev => ({ 
                    ...prev, 
                    isMandatory: value === 'true' 
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Non</SelectItem>
                    <SelectItem value="true">Oui</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date limite (optionnel)</Label>
                <Input
                  type="date"
                  value={assignmentData.dueDate}
                  onChange={(e) => setAssignmentData(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleCreateAssignment} 
              disabled={createAssignmentMutation.isPending || assignmentData.targetIds.length === 0}
            >
              {createAssignmentMutation.isPending ? 'Attribution...' : 'Attribuer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle catégorie</DialogTitle>
            <DialogDescription>
              Créez une nouvelle catégorie pour organiser vos formations
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Nom de la catégorie</Label>
              <Input
                placeholder="Ex: Management, Technologie, Soft Skills..."
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
              Annuler
            </Button>
            <Button 
              onClick={() => createCategoryMutation.mutate(newCategory)} 
              disabled={createCategoryMutation.isPending || !newCategory.trim()}
            >
              {createCategoryMutation.isPending ? 'Création...' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
