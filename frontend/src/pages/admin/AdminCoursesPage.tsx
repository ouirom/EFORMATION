import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
  CheckCircle,
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
import { getRoleLabel } from '@/lib/utils'
import { useCategoryLabel, useCourseCategories } from '@/lib/categories'

export default function AdminCoursesPage() {
  const { t } = useTranslation('admin')
  const categoryLabel = useCategoryLabel()
  const { data: courseCategories = [] } = useCourseCategories()
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [coursePendingDelete, setCoursePendingDelete] = useState<any>(null)
  const [selectedCourse, setSelectedCourse] = useState<any>(null)
  const [newCourse, setNewCourse] = useState({
    title: '',
    description: '',
    category: '',
    duration: '',
    level: 'beginner',
    audienceScope: { level: 'general', ids: [] as number[], roles: [] as string[] },
  })
  const [editCourse, setEditCourse] = useState({
    title: '',
    description: '',
    category: '',
    duration: '',
    level: 'beginner',
    isPublished: false,
    audienceScope: { level: 'general', ids: [] as number[], roles: [] as string[] },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-courses', { search, status: statusFilter, category: categoryFilter }],
    queryFn: () => api.courses.list({
      search,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
    }),
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => api.courses.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      toast({ title: tCommon('status.success'), description: t('courses.toasts.createdDescription') })
      setIsAddDialogOpen(false)
      setNewCourse({ title: '', description: '', category: '', duration: '', level: 'beginner', audienceScope: { level: 'general', ids: [], roles: [] } })
    },
    onError: (error: any) => {
      console.error('Error creating course:', error)
      console.error('Error response:', error.response?.data)
      console.error('Error status:', error.response?.status)
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || error.message || t('courses.toasts.createErrorDescription'),
        variant: 'destructive'
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.courses.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      toast({ title: tCommon('status.success'), description: t('courses.toasts.updatedDescription') })
      setIsEditDialogOpen(false)
      setSelectedCourse(null)
    },
    onError: (error: any) => {
      console.error('Error updating course:', error)
      console.error('Error response:', error.response?.data)
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || error.message || t('courses.toasts.updateErrorDescription'),
        variant: 'destructive'
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.courses.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      toast({ title: tCommon('status.success'), description: t('courses.toasts.deletedDescription') })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('courses.toasts.deleteErrorDescription'),
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
        title: tCommon('status.success'),
        description: course.isPublished ? t('courses.toasts.unpublishedDescription') : t('courses.toasts.publishedDescription'),
      })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('courses.toasts.publishErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const cloneMutation = useMutation({
    mutationFn: (id: number) => api.courses.clone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      toast({ title: tCommon('status.success'), description: t('courses.toasts.clonedDescription') })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('courses.toasts.cloneErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const handleCreateCourse = () => {
    if (!newCourse.title) {
      toast({ title: tCommon('status.error'), description: t('courses.toasts.titleRequired'), variant: 'destructive' })
      return
    }
    // Préparer les données en filtrant les valeurs vides et en convertissant duration
    const courseData: any = {
      title: newCourse.title,
      description: newCourse.description || undefined,
      category: newCourse.category || undefined,
      level: newCourse.level || undefined,
      audienceScope: newCourse.audienceScope,
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
      audienceScope: course.audienceScope || { level: 'general', ids: [], roles: [] },
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
      audienceScope: editCourse.audienceScope,
    }
    if (editCourse.duration && String(editCourse.duration).trim() !== '') {
      courseData.duration = parseInt(String(editCourse.duration), 10)
    }
    updateMutation.mutate({ id: selectedCourse.id, data: courseData })
  }

  const handleDeleteCourse = (course: any) => {
    setCoursePendingDelete(course)
  }

  if (isLoading) {
    return <PageLoading />
  }

  // Utiliser les données de l'API, avec fallback vide si pas de données
  const courses = data || []

  const statusLabels: Record<string, { label: string; color: string }> = {
    true: { label: t('courses.statuses.published'), color: 'bg-green-100 text-green-800' },
    false: { label: t('courses.statuses.draft'), color: 'bg-yellow-100 text-yellow-800' },
    published: { label: t('courses.statuses.published'), color: 'bg-green-100 text-green-800' },
    draft: { label: t('courses.statuses.draft'), color: 'bg-yellow-100 text-yellow-800' },
    archived: { label: t('courses.statuses.archived'), color: 'bg-gray-100 text-gray-800' },
  }

  const levelLabels: Record<string, string> = {
    beginner: t('courses.levels.beginner'),
    intermediate: t('courses.levels.intermediate'),
    advanced: t('courses.levels.advanced'),
    expert: t('courses.levels.expert'),
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('courses.title')}</h1>
          <p className="text-muted-foreground">
            {t('courses.totalCourses', { count: courses.length })}
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('courses.newCourse')}
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
                <p className="text-sm text-muted-foreground">{t('courses.stats.total')}</p>
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
                <p className="text-sm text-muted-foreground">{t('courses.stats.published')}</p>
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
                <p className="text-sm text-muted-foreground">{t('courses.stats.drafts')}</p>
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
                <p className="text-sm text-muted-foreground">{t('courses.stats.totalEnrolled')}</p>
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
            placeholder={t('courses.filters.searchPlaceholder')}
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={t('courses.filters.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('courses.filters.allStatuses')}</SelectItem>
            <SelectItem value="published">{t('courses.statuses.published')}</SelectItem>
            <SelectItem value="draft">{t('courses.statuses.draft')}</SelectItem>
            <SelectItem value="archived">{t('courses.statuses.archived')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('courses.filters.allCategories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('courses.filters.allCategories')}</SelectItem>
            {courseCategories.map(({ code }) => (
              <SelectItem key={code} value={code}>{categoryLabel(code)}</SelectItem>
            ))}
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
                  <th className="text-left p-4 font-medium">{t('courses.table.course')}</th>
                  <th className="text-left p-4 font-medium">{t('courses.table.category')}</th>
                  <th className="text-left p-4 font-medium">{t('courses.table.level')}</th>
                  <th className="text-left p-4 font-medium">{t('courses.table.status')}</th>
                  <th className="text-left p-4 font-medium">{t('courses.table.modules')}</th>
                  <th className="text-left p-4 font-medium">{t('courses.table.rating')}</th>
                  <th className="text-right p-4 font-medium">{t('courses.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {courses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {t('courses.table.noResults')}
                    </td>
                  </tr>
                ) : (
                  courses.map((course: any) => (
                    <tr key={course.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{course.title}</p>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {audienceScopeLabel(course.audienceScope, t)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                            {course.description || t('courses.table.noDescription')}
                          </p>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">
                          {course.category ? categoryLabel(course.category) : t('courses.categories.undefined')}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <span className="text-sm">
                          {levelLabels[course.level] || course.level || '-'}
                        </span>
                      </td>
                      <td className="p-4">
                        <Badge className={statusLabels[String(course.isPublished)]?.color || statusLabels[course.status]?.color || 'bg-gray-100 text-gray-800'}>
                          {statusLabels[String(course.isPublished)]?.label || statusLabels[course.status]?.label || (course.isPublished ? t('courses.statuses.published') : t('courses.statuses.draft'))}
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
                            <Link to={`/courses/${course.publicId}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              {t('courses.rowActions.view')}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/admin/courses/${course.id}/edit`}>
                              <Settings className="h-4 w-4 mr-2" />
                              {t('courses.rowActions.manageContent')}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditCourse(course)}>
                            <Edit className="h-4 w-4 mr-2" />
                            {t('courses.rowActions.editInfo')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => togglePublishMutation.mutate(course)}
                            disabled={togglePublishMutation.isPending}
                          >
                            {course.isPublished ? (
                              <>
                                <EyeOff className="h-4 w-4 mr-2" />
                                {t('courses.rowActions.unpublish')}
                              </>
                            ) : (
                              <>
                                <Eye className="h-4 w-4 mr-2" />
                                {t('courses.rowActions.publish')}
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => cloneMutation.mutate(course.id)}
                            disabled={cloneMutation.isPending}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            {t('courses.rowActions.duplicate')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteCourse(course)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('courses.rowActions.delete')}
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
            <DialogTitle>{t('courses.addDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('courses.addDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('courses.addDialog.titleLabel')}</Label>
              <Input
                id="title"
                placeholder={t('courses.addDialog.titlePlaceholder')}
                value={newCourse.title}
                onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('courses.addDialog.descriptionLabel')}</Label>
              <Textarea
                id="description"
                placeholder={t('courses.addDialog.descriptionPlaceholder')}
                rows={4}
                value={newCourse.description}
                onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">{t('courses.addDialog.category')}</Label>
                <Select
                  value={newCourse.category}
                  onValueChange={(value) => setNewCourse({ ...newCourse, category: value })}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder={t('courses.addDialog.categoryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {courseCategories.map(({ code }) => (
                      <SelectItem key={code} value={code}>{categoryLabel(code)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="level">{t('courses.addDialog.level')}</Label>
                <Select
                  value={newCourse.level}
                  onValueChange={(value) => setNewCourse({ ...newCourse, level: value })}
                >
                  <SelectTrigger id="level">
                    <SelectValue placeholder={t('courses.addDialog.levelPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t('courses.levels.beginner')}</SelectItem>
                    <SelectItem value="intermediate">{t('courses.levels.intermediate')}</SelectItem>
                    <SelectItem value="advanced">{t('courses.levels.advanced')}</SelectItem>
                    <SelectItem value="expert">{t('courses.levels.expert')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">{t('courses.addDialog.duration')}</Label>
              <Input
                id="duration"
                placeholder={t('courses.addDialog.durationPlaceholder')}
                value={newCourse.duration}
                onChange={(e) => setNewCourse({ ...newCourse, duration: e.target.value })}
              />
            </div>
            <AudienceScopePicker
              value={newCourse.audienceScope}
              onChange={(audienceScope) => setNewCourse({ ...newCourse, audienceScope })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={createMutation.isPending}>
              {t('courses.addDialog.cancel')}
            </Button>
            <Button onClick={handleCreateCourse} disabled={createMutation.isPending}>
              {createMutation.isPending ? t('courses.addDialog.creating') : t('courses.addDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Course Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('courses.editDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('courses.editDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editTitle">{t('courses.addDialog.titleLabel')}</Label>
              <Input
                id="editTitle"
                value={editCourse.title}
                onChange={(e) => setEditCourse({ ...editCourse, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editDescription">{t('courses.addDialog.descriptionLabel')}</Label>
              <Textarea
                id="editDescription"
                rows={4}
                value={editCourse.description}
                onChange={(e) => setEditCourse({ ...editCourse, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editCategory">{t('courses.addDialog.category')}</Label>
                <Select
                  value={editCourse.category || "none"}
                  onValueChange={(value) => setEditCourse({ ...editCourse, category: value === "none" ? "" : value })}
                >
                  <SelectTrigger id="editCategory">
                    <SelectValue placeholder={t('courses.addDialog.categoryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('courses.categories.undefined')}</SelectItem>
                    {courseCategories.map(({ code }) => (
                      <SelectItem key={code} value={code}>{categoryLabel(code)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editLevel">{t('courses.addDialog.level')}</Label>
                <Select
                  value={editCourse.level}
                  onValueChange={(value) => setEditCourse({ ...editCourse, level: value })}
                >
                  <SelectTrigger id="editLevel">
                    <SelectValue placeholder={t('courses.addDialog.levelPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t('courses.levels.beginner')}</SelectItem>
                    <SelectItem value="intermediate">{t('courses.levels.intermediate')}</SelectItem>
                    <SelectItem value="advanced">{t('courses.levels.advanced')}</SelectItem>
                    <SelectItem value="expert">{t('courses.levels.expert')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editDuration">{t('courses.addDialog.duration')}</Label>
                <Input
                  id="editDuration"
                  value={editCourse.duration}
                  onChange={(e) => setEditCourse({ ...editCourse, duration: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editStatus">{t('courses.editDialog.status')}</Label>
                <Select
                  value={editCourse.isPublished ? 'published' : 'draft'}
                  onValueChange={(value) => setEditCourse({ ...editCourse, isPublished: value === 'published' })}
                >
                  <SelectTrigger id="editStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{t('courses.statuses.draft')}</SelectItem>
                    <SelectItem value="published">{t('courses.statuses.published')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <AudienceScopePicker
              value={editCourse.audienceScope}
              onChange={(audienceScope) => setEditCourse({ ...editCourse, audienceScope })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={updateMutation.isPending}>
              {t('courses.editDialog.cancel')}
            </Button>
            <Button onClick={handleUpdateCourse} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('courses.editDialog.saving') : t('courses.editDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!coursePendingDelete}
        onOpenChange={(open) => !open && setCoursePendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('courses.confirmDelete', { title: coursePendingDelete?.title })}
        onConfirm={() => {
          if (coursePendingDelete) {
            deleteMutation.mutate(coursePendingDelete.id)
          }
          setCoursePendingDelete(null)
        }}
      />
    </div>
  )
}

const AUDIENCE_ROLES = ['stagiaire', 'externe', 'agent', 'supervisor', 'manager', 'director', 'admin']

/** Short label for the course-list badge -- a NULL audience_scope (courses created
 * before this field had a UI) reads the same as an explicit 'general' scope. */
function audienceScopeLabel(scope: any, t: (key: string) => string): string {
  const level = scope?.level || 'general'
  if (level === 'general') return t('courses.audienceScope.levels.general')
  const count = level === 'role' ? (scope?.roles?.length || 0) : (scope?.ids?.length || 0)
  return `${t(`courses.audienceScope.levels.${level}`)} (${count})`
}

/** Who can see/access a course: "Général" (default, whole tenant) or scoped down to
 * specific enterprises/directions/services/roles. Reused for both the add and edit
 * course dialogs. Mirrors the target-checklist pattern from AdminAssignmentsPage.tsx
 * (course_assignments' own scope picker) for visual/UX consistency, adapted to this
 * component's own `{level, ids, roles}` shape rather than that page's `assignmentType`. */
function AudienceScopePicker({ value, onChange }: { value: any; onChange: (value: any) => void }) {
  const { t } = useTranslation('admin')

  const { data: enterprises = [] } = useQuery({
    queryKey: ['enterprises'],
    queryFn: () => api.organizations.getEnterprises(),
    enabled: value.level === 'enterprise',
  })
  const { data: subsidiaries = [] } = useQuery({
    queryKey: ['subsidiaries'],
    queryFn: () => api.organizations.getSubsidiaries(),
    enabled: value.level === 'subsidiary',
  })

  const { data: directions = [] } = useQuery({
    queryKey: ['directions'],
    queryFn: () => api.organizations.getDirections(),
    enabled: value.level === 'direction',
  })
  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.organizations.getServices(),
    enabled: value.level === 'service',
  })

  const getList = (): any[] => {
    switch (value.level) {
      case 'enterprise': return enterprises
      case 'subsidiary': return subsidiaries
      case 'direction': return directions
      case 'service': return services
      case 'role': return AUDIENCE_ROLES.map((r) => ({ id: r, name: getRoleLabel(r) }))
      default: return []
    }
  }

  const isRoleLevel = value.level === 'role'
  const selected: any[] = isRoleLevel ? value.roles : value.ids

  const toggle = (id: any) => {
    const key = isRoleLevel ? 'roles' : 'ids'
    const list = value[key] as any[]
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="course-audience-level">{t('courses.audienceScope.label')}</Label>
      <Select
        value={value.level}
        onValueChange={(level) => onChange({ level, ids: [], roles: [] })}
      >
        <SelectTrigger id="course-audience-level">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="general">{t('courses.audienceScope.levels.general')}</SelectItem>
          <SelectItem value="enterprise">{t('courses.audienceScope.levels.enterprise')}</SelectItem>
          <SelectItem value="subsidiary">{t('courses.audienceScope.levels.subsidiary')}</SelectItem>
          <SelectItem value="direction">{t('courses.audienceScope.levels.direction')}</SelectItem>
          <SelectItem value="service">{t('courses.audienceScope.levels.service')}</SelectItem>
          <SelectItem value="role">{t('courses.audienceScope.levels.role')}</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t('courses.audienceScope.hint')}</p>

      {value.level !== 'general' && (
        <div className="border rounded-lg max-h-40 overflow-y-auto">
          {getList().length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{t('courses.audienceScope.noItemsFound')}</p>
          ) : (
            getList().map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 ${
                  selected.includes(item.id) ? 'bg-primary/5' : ''
                }`}
                onClick={() => toggle(item.id)}
              >
                <div className={`h-5 w-5 rounded border flex items-center justify-center ${
                  selected.includes(item.id) ? 'bg-primary border-primary' : 'border-gray-300'
                }`}>
                  {selected.includes(item.id) && <CheckCircle className="h-4 w-4 text-white" />}
                </div>
                <span className="text-sm">{item.name}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
