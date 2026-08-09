import { useState } from 'react'
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
const badgeTypes = [
  { value: 'trophy', label: 'Trophée', icon: Trophy },
  { value: 'quiz_completion', label: 'Quiz complété', icon: Target },
  { value: 'perfect_score', label: 'Score parfait', icon: Star },
  { value: 'course_start', label: 'Début de cours', icon: Flame },
  { value: 'course_completion', label: 'Cours terminé', icon: Users },
]

export default function AdminBadgesPage() {
  const { toast } = useToast()
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
      toast({ title: 'Succès', description: 'Badge créé avec succès' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la création', variant: 'destructive' })
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
      toast({ title: 'Succès', description: 'Badge mis à jour avec succès' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la mise à jour', variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/badges/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-badges'] })
      toast({ title: 'Succès', description: 'Badge supprimé' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la suppression', variant: 'destructive' })
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
      setCriteriaError('Le critère doit être un JSON valide, ex: {"type": "quiz_pass"}')
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
    const t = badgeTypes.find((b) => b.value === badgeType)
    return t ? <t.icon className="h-4 w-4" /> : <Award className="h-4 w-4" />
  }

  if (isLoading) {
    return <PageLoading />
  }

  const BadgeForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Code (identifiant unique)</Label>
          <Input
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            placeholder="Ex: EXPERT_REACT"
            disabled={!!editingBadge}
          />
        </div>
        <div className="space-y-2">
          <Label>Nom du badge</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ex: Expert React"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={formData.badgeType} onValueChange={(v) => setFormData({ ...formData, badgeType: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner un type (optionnel)" />
          </SelectTrigger>
          <SelectContent>
            {badgeTypes.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <div className="flex items-center gap-2">
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Description du badge..."
        />
      </div>

      <div className="space-y-2">
        <Label>Critère d'obtention (JSON)</Label>
        <Textarea
          value={formData.criteria}
          onChange={(e) => setFormData({ ...formData, criteria: e.target.value })}
          placeholder='{"type": "quiz_pass"}'
          className="font-mono text-sm"
          rows={4}
        />
        {criteriaError && <p className="text-sm text-red-500">{criteriaError}</p>}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestion des badges</h1>
          <p className="text-muted-foreground">Créez et gérez les badges de gamification</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau badge
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Créer un badge</DialogTitle>
              <DialogDescription>
                Définissez les caractéristiques et critères d'obtention du badge
              </DialogDescription>
            </DialogHeader>
            <BadgeForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Création...' : 'Créer le badge'}
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
                <p className="text-sm text-muted-foreground">Total badges</p>
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
                <p className="text-sm text-muted-foreground">Trophées</p>
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
                <p className="text-sm text-muted-foreground">Badges attribués</p>
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
                <p className="text-sm text-muted-foreground">Types</p>
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
          placeholder="Rechercher un badge..."
          className="pl-9"
        />
      </div>

      {/* Badges grid */}
      {filteredBadges.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Aucun badge trouvé</h3>
            <p className="text-muted-foreground">
              Créez votre premier badge pour motiver vos apprenants
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
                              {badgeTypes.find((t) => t.value === badge.badge_type)?.label || badge.code}
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
                      <span className="shrink-0">{badge.awarded_count || 0} attribués</span>
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
            <DialogTitle>Modifier le badge</DialogTitle>
            <DialogDescription>
              Mettez à jour les informations du badge
            </DialogDescription>
          </DialogHeader>
          <BadgeForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBadge(null)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
