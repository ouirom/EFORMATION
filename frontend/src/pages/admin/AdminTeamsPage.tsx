import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageLoading } from '@/components/ui/loading'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import {
  UsersRound,
  Plus,
  Edit,
  Trash2,
  Search,
  CheckCircle,
  X,
} from 'lucide-react'

interface SelectedMember {
  memberType: 'user' | 'enterprise' | 'direction' | 'service'
  targetId: number
  label: string
}

interface TeamFormValues {
  name: string
  description: string
}

// Defined at module scope (not inside AdminTeamsPage) so its identity stays
// stable across parent re-renders -- a component defined inside another
// component's render body gets recreated as a new type on every render,
// which makes React unmount and remount its inputs on every keystroke,
// resetting cursor position each time.
function TeamForm({
  t,
  formData,
  onChange,
  selectedMembers,
  onRemoveMember,
  pickerType,
  onPickerTypeChange,
  searchUsers,
  onSearchUsersChange,
  pickerItems,
  onToggleItem,
  isItemSelected,
  getItemLabel,
}: {
  t: (key: string, opts?: any) => string
  formData: TeamFormValues
  onChange: (data: TeamFormValues) => void
  selectedMembers: SelectedMember[]
  onRemoveMember: (memberType: string, targetId: number) => void
  pickerType: SelectedMember['memberType']
  onPickerTypeChange: (type: SelectedMember['memberType']) => void
  searchUsers: string
  onSearchUsersChange: (value: string) => void
  pickerItems: any[]
  onToggleItem: (item: any) => void
  isItemSelected: (item: any) => boolean
  getItemLabel: (item: any) => string
}) {
  const grouped: Record<string, SelectedMember[]> = {}
  for (const m of selectedMembers) {
    grouped[m.memberType] = grouped[m.memberType] || []
    grouped[m.memberType].push(m)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="team-name">{t('teamsAdmin.form.name')}</Label>
        <Input
          id="team-name"
          value={formData.name}
          onChange={(e) => onChange({ ...formData, name: e.target.value })}
          placeholder={t('teamsAdmin.form.namePlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="team-description">{t('teamsAdmin.form.description')}</Label>
        <Textarea
          id="team-description"
          value={formData.description}
          onChange={(e) => onChange({ ...formData, description: e.target.value })}
          placeholder={t('teamsAdmin.form.descriptionPlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="team-add-members-type">{t('teamsAdmin.form.addMembers')}</Label>
        <Select value={pickerType} onValueChange={(value: string) => onPickerTypeChange(value as SelectedMember['memberType'])}>
          <SelectTrigger id="team-add-members-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">{t('teamsAdmin.form.types.user')}</SelectItem>
            <SelectItem value="direction">{t('teamsAdmin.form.types.direction')}</SelectItem>
            <SelectItem value="service">{t('teamsAdmin.form.types.service')}</SelectItem>
            <SelectItem value="enterprise">{t('teamsAdmin.form.types.enterprise')}</SelectItem>
          </SelectContent>
        </Select>

        {pickerType === 'user' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('teamsAdmin.form.searchUsersPlaceholder')}
              className="pl-10"
              value={searchUsers}
              onChange={(e) => onSearchUsersChange(e.target.value)}
            />
          </div>
        )}

        <div className="border rounded-lg max-h-40 overflow-y-auto">
          {pickerItems.length === 0 ? (
            <p className="p-4 text-center text-muted-foreground">{t('teamsAdmin.form.noItemsFound')}</p>
          ) : (
            pickerItems.map((item: any) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 ${isItemSelected(item) ? 'bg-primary/5' : ''}`}
                onClick={() => onToggleItem(item)}
              >
                <div className={`h-5 w-5 rounded border flex items-center justify-center ${isItemSelected(item) ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                  {isItemSelected(item) && <CheckCircle className="h-4 w-4 text-white" />}
                </div>
                <span>{getItemLabel(item)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('teamsAdmin.form.selectedMembers', { count: selectedMembers.length })}</Label>
        {selectedMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('teamsAdmin.form.noMembersYet')}</p>
        ) : (
          <div className="space-y-2">
            {(['user', 'direction', 'service', 'enterprise'] as const).map((type) =>
              grouped[type]?.length ? (
                <div key={type} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t(`teamsAdmin.form.types.${type}`)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {grouped[type].map((m) => (
                      <Badge key={`${m.memberType}-${m.targetId}`} variant="outline" className="flex items-center gap-1 pr-1">
                        {m.label}
                        <button
                          type="button"
                          onClick={() => onRemoveMember(m.memberType, m.targetId)}
                          className="rounded-full hover:bg-muted p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminTeamsPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null)
  const [teamPendingDelete, setTeamPendingDelete] = useState<any>(null)
  const [formData, setFormData] = useState<TeamFormValues>({ name: '', description: '' })
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([])
  const [pickerType, setPickerType] = useState<SelectedMember['memberType']>('user')
  const [searchUsers, setSearchUsers] = useState('')

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['admin-teams'],
    queryFn: () => api.teams.list(),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users-for-team', searchUsers],
    queryFn: () => api.assignments.getUsers(searchUsers),
    enabled: isDialogOpen && pickerType === 'user',
  })

  const { data: directions = [] } = useQuery({
    queryKey: ['directions'],
    queryFn: () => api.organizations.getDirections(),
    enabled: isDialogOpen && pickerType === 'direction',
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.organizations.getServices(),
    enabled: isDialogOpen && pickerType === 'service',
  })

  const { data: enterprises = [] } = useQuery({
    queryKey: ['enterprises'],
    queryFn: () => api.organizations.getEnterprises(),
    enabled: isDialogOpen && pickerType === 'enterprise',
  })

  const resetForm = () => {
    setFormData({ name: '', description: '' })
    setSelectedMembers([])
    setPickerType('user')
    setSearchUsers('')
  }

  const createMutation = useMutation({
    mutationFn: (data: any) => api.teams.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] })
      toast({ title: tCommon('status.success'), description: t('teamsAdmin.toasts.createdDescription') })
      setIsDialogOpen(false)
      resetForm()
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('teamsAdmin.toasts.createErrorDescription'), variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.teams.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] })
      toast({ title: tCommon('status.success'), description: t('teamsAdmin.toasts.updatedDescription') })
      setIsDialogOpen(false)
      setEditingTeamId(null)
      resetForm()
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('teamsAdmin.toasts.updateErrorDescription'), variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.teams.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] })
      toast({ title: tCommon('status.success'), description: t('teamsAdmin.toasts.deletedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('teamsAdmin.toasts.deleteErrorDescription'), variant: 'destructive' })
    },
  })

  const openCreateDialog = () => {
    resetForm()
    setEditingTeamId(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = async (teamId: number) => {
    resetForm()
    setEditingTeamId(teamId)
    setIsDialogOpen(true)
    const team = await api.teams.get(teamId)
    setFormData({ name: team.name, description: team.description || '' })
    setSelectedMembers(
      (team.members || []).map((m: any) => ({
        memberType: m.memberType,
        targetId: m.targetId,
        label: m.targetName || `#${m.targetId}`,
      }))
    )
  }

  const getPickerItems = () => {
    switch (pickerType) {
      case 'user': return users
      case 'direction': return directions
      case 'service': return services
      case 'enterprise': return enterprises
      default: return []
    }
  }

  const getItemLabel = (item: any) => (pickerType === 'user' ? `${item.displayName} (${item.email})` : item.name)

  const isItemSelected = (item: any) => selectedMembers.some((m) => m.memberType === pickerType && m.targetId === item.id)

  const toggleItem = (item: any) => {
    setSelectedMembers((prev) => {
      const exists = prev.some((m) => m.memberType === pickerType && m.targetId === item.id)
      if (exists) return prev.filter((m) => !(m.memberType === pickerType && m.targetId === item.id))
      return [...prev, { memberType: pickerType, targetId: item.id, label: getItemLabel(item) }]
    })
  }

  const removeMember = (memberType: string, targetId: number) => {
    setSelectedMembers((prev) => prev.filter((m) => !(m.memberType === memberType && m.targetId === targetId)))
  }

  const handleSubmit = () => {
    const payload = {
      name: formData.name,
      description: formData.description || null,
      members: selectedMembers.map((m) => ({ memberType: m.memberType, targetId: m.targetId })),
    }
    if (editingTeamId) {
      updateMutation.mutate({ id: editingTeamId, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  if (teamsLoading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('teamsAdmin.title')}</h1>
          <p className="text-muted-foreground">{t('teamsAdmin.subtitle')}</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          {t('teamsAdmin.newTeam')}
        </Button>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <UsersRound className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('teamsAdmin.none')}</p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              {t('teamsAdmin.newTeam')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team: any) => (
            <Card key={team.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{team.name}</CardTitle>
                    {team.description && <CardDescription>{team.description}</CardDescription>}
                  </div>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <UsersRound className="h-3 w-3" />
                    {t('teamsAdmin.card.userCount', { count: team.resolvedUserCount })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(team.id)}>
                    <Edit className="h-4 w-4 mr-1" />
                    {t('teamsAdmin.card.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTeamPendingDelete(team)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) {
            setEditingTeamId(null)
            resetForm()
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTeamId ? t('teamsAdmin.editDialog.title') : t('teamsAdmin.createDialog.title')}</DialogTitle>
            <DialogDescription>{t('teamsAdmin.createDialog.description')}</DialogDescription>
          </DialogHeader>
          <TeamForm
            t={t}
            formData={formData}
            onChange={setFormData}
            selectedMembers={selectedMembers}
            onRemoveMember={removeMember}
            pickerType={pickerType}
            onPickerTypeChange={setPickerType}
            searchUsers={searchUsers}
            onSearchUsersChange={setSearchUsers}
            pickerItems={getPickerItems()}
            onToggleItem={toggleItem}
            isItemSelected={isItemSelected}
            getItemLabel={getItemLabel}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t('teamsAdmin.createDialog.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? t('teamsAdmin.createDialog.saving')
                : editingTeamId
                ? t('teamsAdmin.createDialog.save')
                : t('teamsAdmin.createDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!teamPendingDelete}
        onOpenChange={(open) => !open && setTeamPendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('teamsAdmin.card.confirmDelete', { name: teamPendingDelete?.name })}
        onConfirm={() => {
          if (teamPendingDelete) {
            deleteMutation.mutate(teamPendingDelete.id)
          }
          setTeamPendingDelete(null)
        }}
      />
    </div>
  )
}
