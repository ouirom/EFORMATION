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
  Award,
  Plus,
  Search,
  Edit,
  Trash2,
  Users,
  Star,
  Trophy,
  Target,
  Flame,
} from 'lucide-react'
import { api } from '@/services/api'

interface BadgeType {
  id: number
  code: string
  name: string
  description: string | null
  icon_url: string | null
  criteria: Record<string, any>
  badge_type: string | null
  awarded_count?: number
}

// Matches badges.badge_type (backend/src/routes/badge.routes.ts) -- these are the
// only values the automatic awarding logic (award-quiz/award-course) recognizes;
// badges without one of these can still be awarded manually via POST /:id/award.
const badgeTypeValues = [
  { value: 'trophy', icon: Trophy },
  { value: 'quiz_completion', icon: Target },
  { value: 'perfect_score', icon: Star },
  { value: 'course_start', icon: Flame },
  { value: 'course_completion', icon: Users },
]

interface BadgeFormValues {
  code: string
  name: string
  description: string
  badgeType: string
  criteria: string
}

// Defined at module scope so its identity stays stable across parent
// re-renders -- a component defined inside another component's render body
// gets recreated as a new type on every render, which makes React unmount
// and remount its inputs on every keystroke, resetting cursor position.
function BadgeForm({
  t,
  formData,
  onChange,
  badgeTypes,
  isEditing,
  criteriaError,
}: {
  t: (key: string) => string
  formData: BadgeFormValues
  onChange: (data: BadgeFormValues) => void
  badgeTypes: { value: string; icon: any; label: string }[]
  isEditing: boolean
  criteriaError: string | null
}) {
  const idPrefix = isEditing ? 'edit-badge' : 'add-badge'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-code`}>{t('badges.form.code')}</Label>
          <Input
            id={`${idPrefix}-code`}
            value={formData.code}
            onChange={(e) => onChange({ ...formData, code: e.target.value })}
            placeholder={t('badges.form.codePlaceholder')}
            disabled={isEditing}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`}>{t('badges.form.name')}</Label>
          <Input
            id={`${idPrefix}-name`}
            value={formData.name}
            onChange={(e) => onChange({ ...formData, name: e.target.value })}
            placeholder={t('badges.form.namePlaceholder')}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-type`}>{t('badges.form.type')}</Label>
        <Select value={formData.badgeType} onValueChange={(v) => onChange({ ...formData, badgeType: v })}>
          <SelectTrigger id={`${idPrefix}-type`}>
            <SelectValue placeholder={t('badges.form.typePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {badgeTypes.map((bt) => (
              <SelectItem key={bt.value} value={bt.value}>
                <div className="flex items-center gap-2">
                  <bt.icon className="h-4 w-4" />
                  {bt.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>{t('badges.form.description')}</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={formData.description}
          onChange={(e) => onChange({ ...formData, description: e.target.value })}
          placeholder={t('badges.form.descriptionPlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-criteria`}>{t('badges.form.criteria')}</Label>
        <Textarea
          id={`${idPrefix}-criteria`}
          value={formData.criteria}
          onChange={(e) => onChange({ ...formData, criteria: e.target.value })}
          placeholder='{"type": "quiz_pass"}'
          className="font-mono text-sm"
          rows={4}
        />
        {criteriaError && <p className="text-sm text-red-500">{criteriaError}</p>}
      </div>
    </div>
  )
}

export default function AdminBadgesPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const badgeTypes = badgeTypeValues.map((bt) => ({ ...bt, label: t(`badges.types.${bt.value}`) }))
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingBadge, setEditingBadge] = useState<BadgeType | null>(null)
  const [criteriaError, setCriteriaError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    badgeType: '',
    criteria: '{}',
  })

  const { data: badges = [], isLoading } = useQuery<BadgeType[]>({
    queryKey: ['admin-badges'],
    queryFn: async () => {
      const response = await api.get('/badges')
      return response.data.data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await api.post('/badges', {
        code: data.code,
        name: data.name,
        description: data.description,
        badgeType: data.badgeType || undefined,
        criteria: JSON.parse(data.criteria),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-badges'] })
      setIsCreateDialogOpen(false)
      resetForm()
      toast({ title: tCommon('status.success'), description: t('badges.toasts.createdDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('badges.toasts.createErrorDescription'), variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      await api.put(`/badges/${id}`, {
        name: data.name,
        description: data.description,
        badgeType: data.badgeType || undefined,
        criteria: JSON.parse(data.criteria),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-badges'] })
      setEditingBadge(null)
      resetForm()
      toast({ title: tCommon('status.success'), description: t('badges.toasts.updatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('badges.toasts.updateErrorDescription'), variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/badges/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-badges'] })
      toast({ title: tCommon('status.success'), description: t('badges.toasts.deletedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('badges.toasts.deleteErrorDescription'), variant: 'destructive' })
    },
  })

  const resetForm = () => {
    setCriteriaError(null)
    setFormData({
      code: '',
      name: '',
      description: '',
      badgeType: '',
      criteria: '{}',
    })
  }

  const handleEdit = (badge: BadgeType) => {
    setCriteriaError(null)
    setEditingBadge(badge)
    setFormData({
      code: badge.code,
      name: badge.name,
      description: badge.description || '',
      badgeType: badge.badge_type || '',
      criteria: JSON.stringify(badge.criteria || {}, null, 2),
    })
  }

  const handleSubmit = () => {
    try {
      JSON.parse(formData.criteria)
    } catch {
      setCriteriaError(t('badges.invalidCriteriaJson'))
      return
    }
    setCriteriaError(null)
    if (editingBadge) {
      updateMutation.mutate({ id: editingBadge.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const filteredBadges = badges.filter((badge) =>
    badge.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (badge.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getBadgeTypeIcon = (badgeType: string | null) => {
    const bt = badgeTypes.find((b) => b.value === badgeType)
    return bt ? <bt.icon className="h-4 w-4" /> : <Award className="h-4 w-4" />
  }

  if (isLoading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('badges.title')}</h1>
          <p className="text-muted-foreground">{t('badges.subtitle')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              {t('badges.newBadge')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('badges.createDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('badges.createDialog.description')}
              </DialogDescription>
            </DialogHeader>
            <BadgeForm
              t={t}
              formData={formData}
              onChange={setFormData}
              badgeTypes={badgeTypes}
              isEditing={!!editingBadge}
              criteriaError={criteriaError}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                {t('badges.createDialog.cancel')}
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? t('badges.createDialog.creating') : t('badges.createDialog.create')}
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
                <Award className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{badges.length}</p>
                <p className="text-sm text-muted-foreground">{t('badges.stats.total')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Target className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{badges.filter((b) => b.badge_type === 'trophy').length}</p>
                <p className="text-sm text-muted-foreground">{t('badges.stats.trophies')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{badges.reduce((sum, b) => sum + (b.awarded_count || 0), 0)}</p>
                <p className="text-sm text-muted-foreground">{t('badges.stats.awarded')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Star className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{new Set(badges.map((b) => b.badge_type).filter(Boolean)).size}</p>
                <p className="text-sm text-muted-foreground">{t('badges.stats.types')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t('badges.searchPlaceholder')}
          className="pl-9"
        />
      </div>

      {/* Badges grid */}
      {filteredBadges.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('badges.empty.title')}</h3>
            <p className="text-muted-foreground">
              {t('badges.empty.description')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBadges.map((badge) => (
            <Card key={badge.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    {badge.icon_url ? (
                      <img src={badge.icon_url} alt={badge.name} className="h-12 w-12 object-contain" />
                    ) : (
                      <Award className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium truncate">{badge.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {getBadgeTypeIcon(badge.badge_type)}
                            <span className="ml-1">
                              {badgeTypes.find((bt) => bt.value === badge.badge_type)?.label || badge.code}
                            </span>
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(badge)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(badge.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {badge.description}
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="truncate">{JSON.stringify(badge.criteria)}</span>
                      <span className="shrink-0">{t('badges.awardedCount', { count: badge.awarded_count || 0 })}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingBadge} onOpenChange={(open) => !open && setEditingBadge(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('badges.editDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('badges.editDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <BadgeForm
            t={t}
            formData={formData}
            onChange={setFormData}
            badgeTypes={badgeTypes}
            isEditing={!!editingBadge}
            criteriaError={criteriaError}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBadge(null)}>
              {t('badges.editDialog.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('badges.editDialog.saving') : t('badges.editDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
