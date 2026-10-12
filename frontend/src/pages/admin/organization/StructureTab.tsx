import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Network, FolderTree, Layers, Plus, Pencil, Trash2, Users, Loader2, Copy } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/services/api'
import { CopyStructureDialog } from './CopyStructureDialog'

type Level = 'enterprise' | 'subsidiary' | 'direction' | 'service'

interface Unit {
  id: number
  name: string
  code: string | null
  member_count: number
  enterprise_id?: number
  subsidiary_id?: number | null
}
interface DirectionNode extends Unit { services: Unit[] }
interface SubsidiaryNode extends Unit { directions: DirectionNode[] }
interface EnterpriseNode extends Unit { subsidiaries: SubsidiaryNode[]; directions: DirectionNode[] }

const ENDPOINT: Record<Level, string> = {
  enterprise: 'enterprises',
  subsidiary: 'subsidiaries',
  direction: 'directions',
  service: 'services',
}

const ICON: Record<Level, ReactNode> = {
  enterprise: <Building2 className="h-4 w-4 text-primary" />,
  subsidiary: <Network className="h-4 w-4 text-indigo-500" />,
  direction: <FolderTree className="h-4 w-4 text-amber-600" />,
  service: <Layers className="h-4 w-4 text-emerald-600" />,
}

/** What the create/edit dialog is doing. */
interface Editing {
  level: Level
  unit?: Unit
  /** For a new unit: its parent ids. */
  parent?: { enterpriseId?: number; subsidiaryId?: number | null; directionId?: number }
  /** For a direction: the subsidiaries it can be attached to. */
  subsidiaries?: SubsidiaryNode[]
}

/**
 * Administration > Organisation > Structure: entreprise -> filiale (optional) ->
 * direction -> service. Directions can hang under a subsidiary or directly under
 * their enterprise, and move between them; the server refuses to delete a unit
 * that still has members, sub-units, assignments or teams.
 */
export function StructureTab() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [form, setForm] = useState({ name: '', code: '', subsidiaryId: '' })
  const [deleting, setDeleting] = useState<{ level: Level; unit: Unit } | null>(null)
  const [copying, setCopying] = useState<SubsidiaryNode | null>(null)

  const { data: tree = [], isLoading } = useQuery<EnterpriseNode[]>({
    queryKey: ['organization-tree'],
    queryFn: async () => (await api.get('/organizations/tree')).data.data,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['organization-tree'] })
    // Pickers elsewhere (users, assignments, teams...) list these units too.
    for (const key of ['enterprises', 'subsidiaries', 'directions', 'services', 'organization-history', 'organization-copy-preview']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }

  const errorText = (error: any) => {
    const code = error?.response?.data?.error?.code
    if (code === 'ORG_UNIT_IN_USE') return t('organization.structure.inUse')
    return error?.response?.data?.error?.message || t('organization.structure.error')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return
      const body: Record<string, any> = { name: form.name.trim(), code: form.code.trim() || null }
      if (editing.level === 'direction') body.subsidiaryId = form.subsidiaryId ? Number(form.subsidiaryId) : null
      if (editing.unit) {
        return api.put(`/organizations/${ENDPOINT[editing.level]}/${editing.unit.id}`, body)
      }
      if (editing.level === 'subsidiary') body.enterpriseId = editing.parent?.enterpriseId
      if (editing.level === 'direction') body.enterpriseId = editing.parent?.enterpriseId
      if (editing.level === 'service') body.directionId = editing.parent?.directionId
      return api.post(`/organizations/${ENDPOINT[editing.level]}`, body)
    },
    onSuccess: () => {
      refresh()
      setEditing(null)
      toast({ title: tCommon('status.success'), description: t('organization.structure.saved') })
    },
    onError: (error: any) => toast({ title: tCommon('status.error'), description: errorText(error), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (target: { level: Level; unit: Unit }) => api.delete(`/organizations/${ENDPOINT[target.level]}/${target.unit.id}`),
    onSuccess: () => {
      refresh()
      toast({ title: tCommon('status.success'), description: t('organization.structure.deleted') })
    },
    onError: (error: any) => toast({ title: tCommon('status.error'), description: errorText(error), variant: 'destructive' }),
    onSettled: () => setDeleting(null),
  })

  const openEditor = (next: Editing) => {
    setEditing(next)
    setForm({
      name: next.unit?.name ?? '',
      code: next.unit?.code ?? '',
      subsidiaryId: next.unit?.subsidiary_id
        ? String(next.unit.subsidiary_id)
        : next.parent?.subsidiaryId
          ? String(next.parent.subsidiaryId)
          : '',
    })
  }

  if (isLoading) return <PageLoading />

  const actions = (level: Level, unit: Unit, extra: ReactNode, edit: Editing) => (
    <div className="flex items-center gap-1 shrink-0">
      {extra}
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('organization.structure.edit')} onClick={() => openEditor(edit)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={t('organization.structure.delete')} onClick={() => setDeleting({ level, unit })}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

  const addButton = (label: string, onClick: () => void) => (
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClick}>
      <Plus className="h-3.5 w-3.5 mr-1" />
      {label}
    </Button>
  )

  const row = (level: Level, unit: Unit, children: ReactNode, actionBar: ReactNode) => (
    <div>
      <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-muted/60">
        <div className="flex items-center gap-2 min-w-0">
          {ICON[level]}
          <span className="font-medium truncate">{unit.name}</span>
          {unit.code && <span className="text-xs text-muted-foreground">({unit.code})</span>}
          <Badge variant="outline" className="text-[10px] shrink-0">{t(`organization.structure.levels.${level}`)}</Badge>
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0" title={t('organization.structure.members')}>
            <Users className="h-3 w-3" />
            {unit.member_count}
          </span>
        </div>
        {actionBar}
      </div>
      {children && <div className="ml-5 border-l pl-3">{children}</div>}
    </div>
  )

  const directionRow = (direction: DirectionNode, enterprise: EnterpriseNode) =>
    row(
      'direction',
      direction,
      direction.services.length > 0 &&
        direction.services.map((service) => (
          <div key={service.id}>
            {row('service', service, null, actions('service', service, null, { level: 'service', unit: service }))}
          </div>
        )),
      actions(
        'direction',
        direction,
        addButton(t('organization.structure.addService'), () => openEditor({ level: 'service', parent: { directionId: direction.id } })),
        { level: 'direction', unit: direction, subsidiaries: enterprise.subsidiaries }
      )
    )

  const levelLabel = editing ? t(`organization.structure.levels.${editing.level}`) : ''

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">{t('organization.structure.intro')}</p>
        <Button onClick={() => openEditor({ level: 'enterprise' })}>
          <Plus className="h-4 w-4 mr-2" />
          {t('organization.structure.addEnterprise')}
        </Button>
      </div>

      {tree.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t('organization.structure.empty')}</CardContent>
        </Card>
      )}

      {tree.map((enterprise) => (
        <Card key={enterprise.id}>
          <CardContent className="p-4 space-y-1">
            {row(
              'enterprise',
              enterprise,
              <>
                {enterprise.subsidiaries.map((subsidiary) => (
                  <div key={`s${subsidiary.id}`}>
                    {row(
                      'subsidiary',
                      subsidiary,
                      subsidiary.directions.map((direction) => <div key={direction.id}>{directionRow(direction, enterprise)}</div>),
                      actions(
                        'subsidiary',
                        subsidiary,
                        <>
                          {addButton(t('organization.structure.addDirection'), () =>
                            openEditor({ level: 'direction', parent: { enterpriseId: enterprise.id, subsidiaryId: subsidiary.id }, subsidiaries: enterprise.subsidiaries })
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={t('organization.structure.copy.action')}
                            title={t('organization.structure.copy.action')}
                            onClick={() => setCopying(subsidiary)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </>,
                        { level: 'subsidiary', unit: subsidiary }
                      )
                    )}
                  </div>
                ))}
                {enterprise.directions.map((direction) => <div key={`d${direction.id}`}>{directionRow(direction, enterprise)}</div>)}
              </>,
              actions(
                'enterprise',
                enterprise,
                <>
                  {addButton(t('organization.structure.addSubsidiary'), () => openEditor({ level: 'subsidiary', parent: { enterpriseId: enterprise.id } }))}
                  {addButton(t('organization.structure.addDirection'), () =>
                    openEditor({ level: 'direction', parent: { enterpriseId: enterprise.id, subsidiaryId: null }, subsidiaries: enterprise.subsidiaries })
                  )}
                </>,
                { level: 'enterprise', unit: enterprise }
              )
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.unit ? t('organization.structure.editTitle', { level: levelLabel }) : t('organization.structure.createTitle', { level: levelLabel })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-unit-name">{t('organization.structure.name')}</Label>
              <Input id="org-unit-name" value={form.name} maxLength={200} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-unit-code">{t('organization.structure.code')}</Label>
              <Input id="org-unit-code" value={form.code} maxLength={50} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <p className="text-xs text-muted-foreground">{t('organization.structure.codeHint')}</p>
            </div>
            {editing?.level === 'direction' && (
              <div className="space-y-2">
                <Label htmlFor="org-unit-parent">{t('organization.structure.attachment')}</Label>
                <select
                  id="org-unit-parent"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.subsidiaryId}
                  onChange={(e) => setForm({ ...form, subsidiaryId: e.target.value })}
                >
                  <option value="">{t('organization.structure.directlyUnderEnterprise')}</option>
                  {(editing.subsidiaries ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{t('organization.structure.inSubsidiary', { name: s.name })}</option>
                  ))}
                </select>
                {editing.unit && <p className="text-xs text-muted-foreground">{t('organization.structure.moveHint')}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{t('organization.tabs.cancel')}</Button>
            <Button disabled={!form.name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('organization.tabs.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CopyStructureDialog
        source={copying}
        targets={tree.map((e) => ({ enterprise: { id: e.id, name: e.name }, subsidiaries: e.subsidiaries }))}
        onClose={() => setCopying(null)}
        onCopied={refresh}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('organization.structure.deleteTitle', { name: deleting?.unit.name ?? '' })}
        description={t('organization.structure.deleteDescription')}
        confirmLabel={t('organization.structure.delete')}
        variant="destructive"
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </div>
  )
}
