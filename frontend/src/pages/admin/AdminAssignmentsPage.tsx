import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useCategoryLabel } from '@/lib/categories'
import { dateLocale } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmailConfirmDialog, PendingNotification } from '@/components/EmailConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
  CheckCircle,
  UsersRound
} from 'lucide-react'

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  )
}

export default function AdminAssignmentsPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const categoryLabel = useCategoryLabel()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedCourse, setSelectedCourse] = useState<any>(null)
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [pendingNotification, setPendingNotification] = useState<PendingNotification | null>(null)
  const [assignmentPendingDelete, setAssignmentPendingDelete] = useState<any>(null)
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<any>(null)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [searchUsers, setSearchUsers] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [assignmentData, setAssignmentData] = useState({
    lessonId: null as number | null,
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

  const { data: teams = [] } = useQuery({
    queryKey: ['admin-teams-for-assignment'],
    queryFn: () => api.teams.list(),
    enabled: assignmentData.assignmentType === 'team',
  })

  const { data: courseLessons = [] } = useQuery({
    queryKey: ['admin-course-lessons-for-assignment', selectedCourse?.id],
    queryFn: () => api.lessons.catalog({ courseId: selectedCourse!.id, limit: 100 }).then(r => r.data),
    enabled: !!selectedCourse && isAssignDialogOpen,
  })

  // Mutations
  const createAssignmentMutation = useMutation({
    mutationFn: (data: any) => api.assignments.create(data),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      toast({ title: tCommon('status.success'), description: t('assignments.toasts.createdDescription') })
      setIsAssignDialogOpen(false)
      setAssignmentData({ lessonId: null, assignmentType: 'user', targetIds: [], isMandatory: false, dueDate: '' })
      if (result.pendingNotification) {
        setPendingNotification(result.pendingNotification)
      }
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('assignments.toasts.createErrorDescription'),
        variant: 'destructive'
      })
    },
  })

  const deleteAssignmentMutation = useMutation({
    mutationFn: (id: number) => api.assignments.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      toast({ title: tCommon('status.success'), description: t('assignments.toasts.deletedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('assignments.toasts.deleteErrorDescription'), variant: 'destructive' })
    },
  })

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => api.assignments.createCategory(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      toast({ title: tCommon('status.success'), description: t('assignments.toasts.categoryCreatedDescription') })
      setNewCategory('')
      setIsCategoryDialogOpen(false)
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('assignments.toasts.categoryCreateErrorDescription'),
        variant: 'destructive'
      })
    },
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => api.assignments.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      toast({ title: tCommon('status.success'), description: t('assignments.toasts.categoryDeletedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('assignments.toasts.categoryDeleteErrorDescription'), variant: 'destructive' })
    },
  })

  const handleCreateAssignment = () => {
    if (!selectedCourse || assignmentData.targetIds.length === 0) {
      toast({ title: tCommon('status.error'), description: t('assignments.toasts.selectTargetDescription'), variant: 'destructive' })
      return
    }
    createAssignmentMutation.mutate({
      courseId: selectedCourse.id,
      ...assignmentData,
      lessonId: assignmentData.lessonId || undefined,
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
      case 'team': return teams
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
          <h1 className="text-3xl font-bold">{t('assignments.title')}</h1>
          <p className="text-muted-foreground">
            {t('assignments.subtitle')}
          </p>
        </div>
      </div>

      <Tabs defaultValue="assignments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assignments">
            <UserPlus className="h-4 w-4 mr-2" />
            {t('assignments.tabs.assignments')}
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Tag className="h-4 w-4 mr-2" />
            {t('assignments.tabs.categories')}
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
                  {t('assignments.courses.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
                {courses.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">{t('assignments.courses.none')}</p>
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
                          <Badge variant="outline" className="text-xs">{categoryLabel(course.category)}</Badge>
                        )}
                        {course.isPublished ? (
                          <Badge className="bg-green-100 text-green-800 text-xs">{t('assignments.courses.published')}</Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-800 text-xs">{t('assignments.courses.draft')}</Badge>
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
                  {selectedCourse ? t('assignments.assignmentsPanel.titleWithCourse', { title: selectedCourse.title }) : t('assignments.assignmentsPanel.selectCourse')}
                </CardTitle>
                {selectedCourse && (
                  <Button onClick={() => setIsAssignDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('assignments.assignmentsPanel.assign')}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!selectedCourse ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('assignments.assignmentsPanel.selectCoursePrompt')}</p>
                  </div>
                ) : assignmentsLoading ? (
                  <PageLoading />
                ) : assignments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('assignments.assignmentsPanel.noAssignments')}</p>
                    <Button className="mt-4" onClick={() => setIsAssignDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      {t('assignments.assignmentsPanel.createAssignment')}
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
                            assignment.assignmentType === 'team' ? 'bg-teal-100' :
                            'bg-orange-100'
                          }`}>
                            {assignment.assignmentType === 'user' ? (
                              <Users className="h-5 w-5 text-blue-600" />
                            ) : assignment.assignmentType === 'team' ? (
                              <UsersRound className="h-5 w-5 text-teal-600" />
                            ) : (
                              <Building2 className="h-5 w-5 text-purple-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{assignment.targetName || t('assignments.assignmentsPanel.idFallback', { id: assignment.targetId })}</p>
                            <div className="flex gap-2 items-center text-sm text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {assignment.assignmentType === 'user' ? t('assignments.assignmentsPanel.types.user') :
                                 assignment.assignmentType === 'enterprise' ? t('assignments.assignmentsPanel.types.enterprise') :
                                 assignment.assignmentType === 'direction' ? t('assignments.assignmentsPanel.types.direction') :
                                 assignment.assignmentType === 'service' ? t('assignments.assignmentsPanel.types.service') :
                                 assignment.assignmentType === 'team' ? t('assignments.assignmentsPanel.types.team') : t('assignments.assignmentsPanel.types.role')}
                              </Badge>
                              {assignment.lessonTitle && (
                                <Badge className="bg-indigo-100 text-indigo-800 text-xs">{assignment.lessonTitle}</Badge>
                              )}
                              {assignment.isMandatory && (
                                <Badge className="bg-red-100 text-red-800 text-xs">{t('assignments.assignmentsPanel.mandatory')}</Badge>
                              )}
                              {assignment.dueDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(assignment.dueDate).toLocaleDateString(dateLocale())}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setAssignmentPendingDelete(assignment)}
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
                {t('assignments.categoriesPanel.title')}
              </CardTitle>
              <Button onClick={() => setIsCategoryDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('assignments.categoriesPanel.newCategory')}
              </Button>
            </CardHeader>
            <CardContent>
              {categoriesLoading ? (
                <PageLoading />
              ) : categories.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('assignments.categoriesPanel.none')}</p>
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
                        onClick={() => setCategoryPendingDelete(category)}
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
            <DialogTitle>{t('assignments.assignDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('assignments.assignDialog.description', { title: selectedCourse?.title })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="assign-content">{t('assignments.assignDialog.content')}</Label>
              <Select
                value={assignmentData.lessonId ? String(assignmentData.lessonId) : 'course'}
                onValueChange={(value: string) => setAssignmentData(prev => ({
                  ...prev,
                  lessonId: value === 'course' ? null : Number(value),
                }))}
              >
                <SelectTrigger id="assign-content">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="course">{t('assignments.assignDialog.wholeCourse')}</SelectItem>
                  {courseLessons.map((lesson: any) => (
                    <SelectItem key={lesson.id} value={String(lesson.id)}>{lesson.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assign-type">{t('assignments.assignDialog.assignmentType')}</Label>
              <Select
                value={assignmentData.assignmentType}
                onValueChange={(value: string) => setAssignmentData(prev => ({
                  ...prev,
                  assignmentType: value,
                  targetIds: []
                }))}
              >
                <SelectTrigger id="assign-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t('assignments.assignDialog.types.user')}</SelectItem>
                  <SelectItem value="enterprise">{t('assignments.assignDialog.types.enterprise')}</SelectItem>
                  <SelectItem value="direction">{t('assignments.assignDialog.types.direction')}</SelectItem>
                  <SelectItem value="service">{t('assignments.assignDialog.types.service')}</SelectItem>
                  <SelectItem value="team">{t('assignments.assignDialog.types.team')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {assignmentData.assignmentType === 'user' && (
              <div className="space-y-2">
                <Label htmlFor="assign-search-users">{t('assignments.assignDialog.searchUsers')}</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="assign-search-users"
                    placeholder={t('assignments.assignDialog.searchPlaceholder')}
                    className="pl-10"
                    value={searchUsers}
                    onChange={(e) => setSearchUsers(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('assignments.assignDialog.selectTargets', { count: assignmentData.targetIds.length })}</Label>
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {getTargetList().length === 0 ? (
                  <p className="p-4 text-center text-muted-foreground">{t('assignments.assignDialog.noItemsFound')}</p>
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
                <Label htmlFor="assign-mandatory">{t('assignments.assignDialog.mandatory')}</Label>
                <Select
                  value={assignmentData.isMandatory ? 'true' : 'false'}
                  onValueChange={(value: string) => setAssignmentData(prev => ({
                    ...prev,
                    isMandatory: value === 'true'
                  }))}
                >
                  <SelectTrigger id="assign-mandatory">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">{t('assignments.assignDialog.no')}</SelectItem>
                    <SelectItem value="true">{t('assignments.assignDialog.yes')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign-due-date">{t('assignments.assignDialog.dueDate')}</Label>
                <Input
                  id="assign-due-date"
                  type="date"
                  value={assignmentData.dueDate}
                  onChange={(e) => setAssignmentData(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
              {t('assignments.assignDialog.cancel')}
            </Button>
            <Button
              onClick={handleCreateAssignment}
              disabled={createAssignmentMutation.isPending || assignmentData.targetIds.length === 0}
            >
              {createAssignmentMutation.isPending ? t('assignments.assignDialog.assigning') : t('assignments.assignDialog.assignButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assignments.categoryDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('assignments.categoryDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">{t('assignments.categoryDialog.nameLabel')}</Label>
              <Input
                id="category-name"
                placeholder={t('assignments.categoryDialog.namePlaceholder')}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
              {t('assignments.categoryDialog.cancel')}
            </Button>
            <Button
              onClick={() => createCategoryMutation.mutate(newCategory)}
              disabled={createCategoryMutation.isPending || !newCategory.trim()}
            >
              {createCategoryMutation.isPending ? t('assignments.categoryDialog.creating') : t('assignments.categoryDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailConfirmDialog
        pendingNotification={pendingNotification}
        onOpenChange={(open) => !open && setPendingNotification(null)}
      />

      <ConfirmDialog
        open={!!assignmentPendingDelete}
        onOpenChange={(open) => !open && setAssignmentPendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('assignments.assignmentsPanel.confirmDelete')}
        onConfirm={() => {
          if (assignmentPendingDelete) {
            deleteAssignmentMutation.mutate(assignmentPendingDelete.id)
          }
          setAssignmentPendingDelete(null)
        }}
      />

      <ConfirmDialog
        open={!!categoryPendingDelete}
        onOpenChange={(open) => !open && setCategoryPendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('assignments.categoriesPanel.confirmDelete', { name: categoryPendingDelete?.name })}
        onConfirm={() => {
          if (categoryPendingDelete) {
            deleteCategoryMutation.mutate(categoryPendingDelete.id)
          }
          setCategoryPendingDelete(null)
        }}
      />
    </div>
  )
}
