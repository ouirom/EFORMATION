import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import {
  FileText,
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Calendar,
  User,
  Tag,
  MessageSquare,
  ExternalLink,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'

interface BlogPost {
  id: number
  title: string
  slug: string
  body: string
  author_id: number
  author_name?: string
  category_id: number | null
  category_name?: string
  tags: { id: number; name: string }[]
  status: 'draft' | 'published'
  view_count: number
  comment_count: number
  published_at: string | null
  created_at: string
}

interface PostFormValues {
  title: string
  body: string
  categoryId: string
  tagIds: number[]
  status: string
}

const emptyForm: PostFormValues = { title: '', body: '', categoryId: '', tagIds: [], status: 'draft' }

// Defined at module scope so its identity stays stable across parent
// re-renders -- a component defined inside another component's render body
// gets recreated as a new type on every render, which makes React unmount
// and remount its inputs on every keystroke, resetting cursor position.
function PostForm({
  t,
  formData,
  onChange,
  isEditing,
  categories,
  tags,
  onCreateCategory,
  onCreateTag,
}: {
  t: (key: string) => string
  formData: PostFormValues
  onChange: (data: PostFormValues) => void
  isEditing: boolean
  categories: { id: number; name: string }[]
  tags: { id: number; name: string }[]
  onCreateCategory: (name: string) => void
  onCreateTag: (name: string) => void
}) {
  const idPrefix = isEditing ? 'edit-post' : 'add-post'
  const [newCategory, setNewCategory] = useState('')
  const [newTag, setNewTag] = useState('')

  const toggleTag = (tagId: number) => {
    onChange({
      ...formData,
      tagIds: formData.tagIds.includes(tagId)
        ? formData.tagIds.filter((id) => id !== tagId)
        : [...formData.tagIds, tagId],
    })
  }

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>{t('blogAdmin.form.title')}</Label>
        <Input
          id={`${idPrefix}-title`}
          value={formData.title}
          onChange={(e) => onChange({ ...formData, title: e.target.value })}
          placeholder={t('blogAdmin.form.titlePlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-body`}>{t('blogAdmin.form.content')}</Label>
        <Textarea
          id={`${idPrefix}-body`}
          value={formData.body}
          onChange={(e) => onChange({ ...formData, body: e.target.value })}
          placeholder={t('blogAdmin.form.contentPlaceholder')}
          rows={10}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-category`}>{t('blogAdmin.form.category')}</Label>
          <Select value={formData.categoryId} onValueChange={(v) => onChange({ ...formData, categoryId: v })}>
            <SelectTrigger id={`${idPrefix}-category`}>
              <SelectValue placeholder={t('blogAdmin.form.categoryPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder={t('blogAdmin.form.newCategoryPlaceholder')}
              className="h-8 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!newCategory.trim()}
              onClick={() => { onCreateCategory(newCategory.trim()); setNewCategory('') }}
            >
              {t('blogAdmin.form.add')}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-status`}>{t('blogAdmin.form.status')}</Label>
          <Select value={formData.status} onValueChange={(v) => onChange({ ...formData, status: v })}>
            <SelectTrigger id={`${idPrefix}-status`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t('blogAdmin.statuses.draft')}</SelectItem>
              <SelectItem value="published">{t('blogAdmin.statuses.published')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('blogAdmin.form.tags')}</Label>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              variant={formData.tagIds.includes(tag.id) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggleTag(tag.id)}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder={t('blogAdmin.form.newTagPlaceholder')}
            className="h-8 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!newTag.trim()}
            onClick={() => { onCreateTag(newTag.trim()); setNewTag('') }}
          >
            {t('blogAdmin.form.add')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function AdminBlogPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null)
  const [formData, setFormData] = useState<PostFormValues>(emptyForm)

  const { data: postsResult, isLoading } = useQuery({
    queryKey: ['admin-blog-posts', statusFilter],
    queryFn: () => api.blog.getPosts({ status: statusFilter !== 'all' ? statusFilter : undefined, limit: 50 }),
  })
  const posts: BlogPost[] = postsResult?.data || []

  const { data: categories = [] } = useQuery({
    queryKey: ['blog-categories'],
    queryFn: () => api.blog.getCategories(),
  })

  const { data: tags = [] } = useQuery({
    queryKey: ['blog-tags'],
    queryFn: () => api.blog.getTags(),
  })

  const invalidatePosts = () => queryClient.invalidateQueries({ queryKey: ['admin-blog-posts'] })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.blog.createPost(data),
    onSuccess: () => {
      invalidatePosts()
      setIsCreateDialogOpen(false)
      setFormData(emptyForm)
      toast({ title: tCommon('status.success'), description: t('blogAdmin.toasts.createdDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('blogAdmin.toasts.createErrorDescription'), variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.blog.updatePost(id, data),
    onSuccess: () => {
      invalidatePosts()
      setEditingPost(null)
      setFormData(emptyForm)
      toast({ title: tCommon('status.success'), description: t('blogAdmin.toasts.updatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('blogAdmin.toasts.updateErrorDescription'), variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.blog.deletePost(id),
    onSuccess: () => {
      invalidatePosts()
      toast({ title: tCommon('status.success'), description: t('blogAdmin.toasts.deletedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('blogAdmin.toasts.deleteErrorDescription'), variant: 'destructive' })
    },
  })

  const publishMutation = useMutation({
    mutationFn: (id: number) => api.blog.updatePost(id, { status: 'published' }),
    onSuccess: () => {
      invalidatePosts()
      toast({ title: tCommon('status.success'), description: t('blogAdmin.toasts.publishedDescription') })
    },
  })

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => api.blog.createCategory(name),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: ['blog-categories'] })
      setFormData((f) => ({ ...f, categoryId: String(category.id) }))
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('blogAdmin.toasts.categoryErrorDescription'), variant: 'destructive' })
    },
  })

  const createTagMutation = useMutation({
    mutationFn: (name: string) => api.blog.createTag(name),
    onSuccess: (tag) => {
      queryClient.invalidateQueries({ queryKey: ['blog-tags'] })
      setFormData((f) => ({ ...f, tagIds: [...f.tagIds, tag.id] }))
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('blogAdmin.toasts.tagErrorDescription'), variant: 'destructive' })
    },
  })

  const handleEdit = (post: BlogPost) => {
    setEditingPost(post)
    setFormData({
      title: post.title,
      body: post.body,
      categoryId: post.category_id ? String(post.category_id) : '',
      tagIds: post.tags?.map((tg) => tg.id) || [],
      status: post.status,
    })
  }

  const handleSubmit = () => {
    const data = {
      title: formData.title,
      body: formData.body,
      categoryId: formData.categoryId ? parseInt(formData.categoryId, 10) : null,
      tagIds: formData.tagIds,
      status: formData.status,
    }
    if (editingPost) {
      updateMutation.mutate({ id: editingPost.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: 'default' | 'secondary'; label: string }> = {
      draft: { variant: 'secondary', label: t('blogAdmin.statuses.draft') },
      published: { variant: 'default', label: t('blogAdmin.statuses.published') },
    }
    const style = styles[status] || { variant: 'outline' as const, label: status }
    return <Badge variant={style.variant}>{style.label}</Badge>
  }

  const filteredPosts = posts.filter((post) =>
    post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    post.body.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (isLoading) {
    return <PageLoading />
  }

  const publishedCount = posts.filter((p) => p.status === 'published').length
  const draftCount = posts.filter((p) => p.status === 'draft').length
  const totalViews = posts.reduce((sum, p) => sum + (p.view_count || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('blogAdmin.title')}</h1>
          <p className="text-muted-foreground">{t('blogAdmin.subtitle')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setFormData(emptyForm)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('blogAdmin.newPost')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('blogAdmin.createDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('blogAdmin.createDialog.description')}
              </DialogDescription>
            </DialogHeader>
            <PostForm
              t={t}
              formData={formData}
              onChange={setFormData}
              isEditing={false}
              categories={categories}
              tags={tags}
              onCreateCategory={(name) => createCategoryMutation.mutate(name)}
              onCreateTag={(name) => createTagMutation.mutate(name)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                {t('blogAdmin.createDialog.cancel')}
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || !formData.title.trim() || !formData.body.trim()}>
                {createMutation.isPending ? t('blogAdmin.createDialog.creating') : t('blogAdmin.createDialog.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{posts.length}</p>
                <p className="text-sm text-muted-foreground">{t('blogAdmin.stats.total')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{publishedCount}</p>
                <p className="text-sm text-muted-foreground">{t('blogAdmin.stats.published')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{draftCount}</p>
                <p className="text-sm text-muted-foreground">{t('blogAdmin.stats.drafts')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Eye className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalViews}</p>
                <p className="text-sm text-muted-foreground">{t('blogAdmin.stats.totalViews')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('blogAdmin.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('blogAdmin.allStatuses')}</SelectItem>
            <SelectItem value="draft">{t('blogAdmin.drafts')}</SelectItem>
            <SelectItem value="published">{t('blogAdmin.published')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Posts list */}
      {filteredPosts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('blogAdmin.empty.title')}</h3>
            <p className="text-muted-foreground">
              {t('blogAdmin.empty.description')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="h-20 w-32 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{post.title}</h3>
                          {getStatusBadge(post.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {post.body?.substring(0, 150)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {post.author_name || t('blogAdmin.authorFallback', { id: post.author_id })}
                      </span>
                      {post.category_name && (
                        <span className="flex items-center gap-1">
                          <Tag className="h-4 w-4" />
                          {post.category_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatDate(post.published_at || post.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        {post.view_count || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" />
                        {post.comment_count || 0}
                      </span>
                    </div>
                    {post.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {post.tags.map((tag) => (
                          <Badge key={tag.id} variant="outline" className="text-xs">
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {post.status === 'draft' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => publishMutation.mutate(post.id)}
                      >
                        {t('blogAdmin.publish')}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/blog/${post.id}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(post)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(post.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingPost} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('blogAdmin.editDialog.title')}</DialogTitle>
          </DialogHeader>
          <PostForm
            t={t}
            formData={formData}
            onChange={setFormData}
            isEditing={true}
            categories={categories}
            tags={tags}
            onCreateCategory={(name) => createCategoryMutation.mutate(name)}
            onCreateTag={(name) => createTagMutation.mutate(name)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPost(null)}>
              {t('blogAdmin.editDialog.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending || !formData.title.trim() || !formData.body.trim()}>
              {updateMutation.isPending ? t('blogAdmin.editDialog.saving') : t('blogAdmin.editDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
