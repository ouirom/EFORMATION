import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/services/api'
import {
  directionState,
  hasSomethingToCreate,
  selectAll,
  selectionPayload,
  summaryParts,
  toggleDirection,
  toggleService,
  type CopyDirectionNode,
  type CopySelection,
  type CopySummary,
} from './structureCopy'

interface SubsidiaryOption {
  id: number
  name: string
}
export interface CopyTargetGroup {
  enterprise: { id: number; name: string }
  subsidiaries: SubsidiaryOption[]
}

interface PlannedUnit {
  sourceId: number
  name: string
  code: string | null
  sourceCode: string | null
  action: 'create' | 'merge' | 'skip'
}
interface CopyPlan {
  directions: (PlannedUnit & { services: PlannedUnit[] })[]
  summary: CopySummary
}

interface Props {
  source: (SubsidiaryOption & { directions: CopyDirectionNode[] }) | null
  /** Every subsidiary of the tenant, by enterprise (the source is left out here). */
  targets: CopyTargetGroup[]
  onClose: () => void
  onCopied: () => void
}

/** Native checkbox that can also show the "partly ticked" state. */
function TriCheckbox({ state, onChange, label }: { state: 'all' | 'partial' | 'none'; onChange: (checked: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="h-4 w-4 rounded border-gray-300 cursor-pointer"
      checked={state === 'all'}
      ref={(el) => {
        if (el) el.indeterminate = state === 'partial'
      }}
      onChange={(e) => onChange(state === 'partial' ? true : e.target.checked)}
    />
  )
}

/**
 * Structure tab > subsidiary > "Copier la structure vers..." : copies the ticked
 * directions and services of a subsidiary into another one (structure only, no
 * members). The server's dry run is shown before anything is written.
 */
export function CopyStructureDialog({ source, targets, onClose, onCopied }: Props) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const [targetId, setTargetId] = useState('')
  const [selection, setSelection] = useState<CopySelection>({ directions: new Set(), services: new Set() })

  const directions = source?.directions ?? []
  const groups = useMemo(
    () =>
      targets
        .map((g) => ({ ...g, subsidiaries: g.subsidiaries.filter((s) => s.id !== source?.id) }))
        .filter((g) => g.subsidiaries.length > 0),
    [targets, source?.id]
  )

  // Fresh state each time the dialog opens on a subsidiary.
  useEffect(() => {
    if (!source) return
    setTargetId('')
    setSelection(selectAll(source.directions))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id])

  const payload = selectionPayload(selection, directions)
  const body = { targetSubsidiaryId: Number(targetId), ...payload }

  const preview = useQuery<CopyPlan>({
    queryKey: ['organization-copy-preview', source?.id, body],
    queryFn: async () => (await api.post(`/organizations/subsidiaries/${source!.id}/copy-structure`, { ...body, dryRun: true })).data.data,
    enabled: !!source && !!targetId && payload.directionIds.length > 0,
    placeholderData: keepPreviousData,
  })

  const copyMutation = useMutation({
    mutationFn: () => api.post(`/organizations/subsidiaries/${source!.id}/copy-structure`, body),
    onSuccess: (response) => {
      const summary: CopySummary = response.data.data.summary
      toast({ title: tCommon('status.success'), description: t('organization.structure.copy.done', { summary: summaryText(summary) }) })
      onCopied()
      onClose()
    },
    onError: (error: any) =>
      toast({
        title: tCommon('status.error'),
        description: error?.response?.data?.error?.message || t('organization.structure.error'),
        variant: 'destructive',
      }),
  })

  const summaryText = (summary: CopySummary) =>
    summaryParts(summary)
      .map((part) => t(`organization.structure.copy.summary.${part.key}`, { count: part.count }))
      .join(', ')

  const plan = preview.data
  const notable = plan
    ? plan.directions.flatMap((d) => [
        ...(d.action === 'merge' ? [{ key: `d${d.sourceId}`, text: t('organization.structure.copy.mergedInto', { name: d.name }) }] : []),
        ...(d.action === 'create' && d.code !== d.sourceCode
          ? [{ key: `dc${d.sourceId}`, text: t('organization.structure.copy.codeChanged', { name: d.name, code: d.code }) }]
          : []),
        ...d.services.flatMap((s) => [
          ...(s.action === 'skip' ? [{ key: `s${s.sourceId}`, text: t('organization.structure.copy.skipped', { name: s.name, direction: d.name }) }] : []),
          ...(s.action === 'create' && s.code !== s.sourceCode
            ? [{ key: `sc${s.sourceId}`, text: t('organization.structure.copy.codeChanged', { name: s.name, code: s.code }) }]
            : []),
        ]),
      ])
    : []

  const canCopy = !!targetId && payload.directionIds.length > 0 && !preview.isError && hasSomethingToCreate(plan?.summary) && !preview.isFetching && !copyMutation.isPending

  return (
    <Dialog open={!!source} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('organization.structure.copy.title', { name: source?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('organization.structure.copy.description')}</DialogDescription>
        </DialogHeader>

        {directions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('organization.structure.copy.noDirections')}</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('organization.structure.copy.noTarget')}</p>
        ) : (
          <div className="space-y-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="org-copy-target">{t('organization.structure.copy.target')}</Label>
              <select
                id="org-copy-target"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">{t('organization.structure.copy.chooseTarget')}</option>
                {groups.map((g) => (
                  <optgroup key={g.enterprise.id} label={g.enterprise.name}>
                    {g.subsidiaries.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{t('organization.structure.copy.selection')}</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelection(selectAll(directions))}>
                    {t('organization.structure.copy.selectAll')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSelection({ directions: new Set(), services: new Set() })}
                  >
                    {t('organization.structure.copy.selectNone')}
                  </Button>
                </div>
              </div>
              <div className="rounded-md border p-2 max-h-64 overflow-y-auto space-y-1" data-testid="org-copy-tree">
                {directions.map((direction) => (
                  <div key={direction.id}>
                    <label className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/60 cursor-pointer min-w-0">
                      <TriCheckbox
                        state={directionState(selection, direction)}
                        label={direction.name}
                        onChange={(checked) => setSelection((s) => toggleDirection(s, direction, checked))}
                      />
                      <span className="font-medium text-sm truncate">{direction.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {t('organization.structure.copy.serviceCount', { count: direction.services.length })}
                      </span>
                    </label>
                    {direction.services.length > 0 && (
                      <div className="ml-6 border-l pl-2">
                        {direction.services.map((service) => (
                          <label key={service.id} className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-muted/60 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              aria-label={service.name}
                              className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                              checked={selection.directions.has(direction.id) && selection.services.has(service.id)}
                              onChange={(e) => setSelection((s) => toggleService(s, direction, service.id, e.target.checked))}
                            />
                            <span className="text-sm truncate">{service.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {targetId && (
              <div className="rounded-md bg-muted/50 p-3 space-y-2 text-sm" data-testid="org-copy-preview" aria-live="polite">
                <div className="flex items-center gap-2 font-medium">
                  {t('organization.structure.copy.preview')}
                  {preview.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                </div>
                {preview.isError ? (
                  <p className="text-destructive">{(preview.error as any)?.response?.data?.error?.message || t('organization.structure.error')}</p>
                ) : payload.directionIds.length === 0 ? (
                  <p className="text-muted-foreground">{t('organization.structure.copy.nothingSelected')}</p>
                ) : plan ? (
                  <>
                    <p data-testid="org-copy-summary">
                      {summaryParts(plan.summary).length > 0 ? summaryText(plan.summary) : t('organization.structure.copy.nothing')}
                    </p>
                    {!hasSomethingToCreate(plan.summary) && <p className="text-muted-foreground">{t('organization.structure.copy.nothingToCreate')}</p>}
                    {notable.length > 0 && (
                      <ul className="text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
                        {notable.map((item) => (
                          <li key={item.key} className="break-words">• {item.text}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('organization.tabs.cancel')}</Button>
          <Button disabled={!canCopy} onClick={() => copyMutation.mutate()}>
            {copyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Copy className="h-4 w-4 mr-2" />}
            {t('organization.structure.copy.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
