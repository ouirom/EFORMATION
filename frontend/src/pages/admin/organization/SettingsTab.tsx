import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Save, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/services/api'
import { FieldGroup, FieldSpec } from './settingsFields'

// Zones commonly used by this platform's organizations, shown first.
const COMMON_TIME_ZONES = ['Africa/Abidjan', 'Europe/Paris', 'Africa/Lagos', 'Africa/Douala', 'Africa/Casablanca', 'UTC']

function timeZoneOptions(current: string): string[] {
  let all: string[] = []
  try {
    all = (Intl as any).supportedValuesOf?.('timeZone') ?? []
  } catch {
    all = []
  }
  return Array.from(new Set([...COMMON_TIME_ZONES, current, ...all])).filter(Boolean)
}

/** Domains are edited as text ("a.com, b.org"), stored as a list. */
const toEditable = (field: FieldSpec, value: any) =>
  field.type === 'domains' ? (Array.isArray(value) ? value.join(', ') : value ?? '') : value ?? (field.type === 'bool' ? false : '')

const sameValue = (field: FieldSpec, a: any, b: any) =>
  field.type === 'domains' ? String(toEditable(field, a)).replace(/\s/g, '') === String(toEditable(field, b)).replace(/\s/g, '') : String(a ?? '') === String(b ?? '')

interface SettingsTabProps {
  groups: FieldGroup[]
  settings: Record<string, any> | undefined
  defaults: Record<string, any> | undefined
}

/**
 * One tab of the organization settings: fields from `groups`, the current value,
 * the default next to it (with a reset button when it differs), and a save that
 * only sends this tab's keys (the server keeps every other setting).
 */
export function SettingsTab({ groups, settings, defaults }: SettingsTabProps) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fields = useMemo(() => groups.flatMap((g) => g.fields), [groups])

  const initial = useMemo(() => {
    const values: Record<string, any> = {}
    for (const field of fields) values[field.key] = toEditable(field, settings?.[field.key])
    return values
  }, [fields, settings])
  const [values, setValues] = useState<Record<string, any>>(initial)
  useEffect(() => setValues(initial), [initial])

  const dirty = fields.some((f) => !sameValue(f, values[f.key], initial[f.key]))

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Only what changed, so the history (Historique) names the settings really edited.
      const payload: Record<string, any> = {}
      for (const field of fields) {
        if (!sameValue(field, values[field.key], initial[field.key])) payload[field.key] = values[field.key]
      }
      return api.put('/organizations/current/settings', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      queryClient.invalidateQueries({ queryKey: ['organization-history'] })
      toast({ title: tCommon('status.success'), description: t('organization.toasts.settingsUpdatedDescription') })
    },
    onError: (error: any) => {
      const details = error?.response?.data?.error?.details
      const invalid = Array.isArray(details) ? details.map((d: any) => d.path).filter(Boolean) : []
      const labels = invalid.map((key: string) => {
        const field = fields.find((f) => f.key === key)
        return field ? t(field.labelKey) : key
      })
      toast({
        title: tCommon('status.error'),
        description: labels.length > 0
          ? t('organization.tabs.invalidFields', { fields: labels.join(', ') })
          : t('organization.toasts.settingsUpdateErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const formatValue = (field: FieldSpec, value: any): string => {
    if (field.type === 'bool') return value ? t('organization.platformSettings.enabled') : t('organization.platformSettings.disabled')
    if (field.type === 'int' && Number(value) === 0 && field.zeroLabelKey) return t(field.zeroLabelKey)
    if (field.type === 'select') {
      const option = field.options?.find((o) => o.value === value)
      return option?.labelKey ? t(option.labelKey) : option?.label ?? String(value)
    }
    if (field.type === 'domains') return (Array.isArray(value) ? value : []).length ? value.map((d: string) => '@' + d).join(', ') : t('organization.security.anyDomain')
    if (value === '' || value === null || value === undefined) return t('organization.tabs.empty')
    return String(value)
  }

  const set = (key: string, value: any) => setValues((prev) => ({ ...prev, [key]: value }))

  const renderInput = (field: FieldSpec, id: string, disabled: boolean) => {
    const value = values[field.key]
    switch (field.type) {
      case 'bool':
        return (
          <input id={id} type="checkbox" className="h-5 w-5 mt-0.5" checked={!!value} disabled={disabled} onChange={(e) => set(field.key, e.target.checked)} />
        )
      case 'int':
        return (
          <Input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            value={value}
            disabled={disabled}
            className="w-32"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              set(field.key, Number.isNaN(n) ? field.min ?? 0 : Math.min(field.max ?? n, Math.max(field.min ?? n, n)))
            }}
          />
        )
      case 'select':
      case 'timezone':
        return (
          <select
            id={id}
            className="h-10 w-full sm:w-72 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
            value={value}
            disabled={disabled}
            onChange={(e) => set(field.key, e.target.value)}
          >
            {field.type === 'timezone'
              ? timeZoneOptions(value).map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)
              : field.options?.map((o) => <option key={o.value} value={o.value}>{o.labelKey ? t(o.labelKey) : o.label}</option>)}
          </select>
        )
      case 'textarea':
        return <Textarea id={id} rows={6} maxLength={field.max} value={value} disabled={disabled} onChange={(e) => set(field.key, e.target.value)} />
      default:
        return (
          <Input
            id={id}
            type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
            placeholder={field.type === 'domains' ? 'belife.ci, exemple.com' : field.type === 'url' ? 'https://' : undefined}
            value={value}
            disabled={disabled}
            onChange={(e) => set(field.key, e.target.value)}
          />
        )
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((group, groupIndex) => (
        <Card key={group.titleKey ?? groupIndex}>
          {group.titleKey && (
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t(group.titleKey)}</CardTitle>
            </CardHeader>
          )}
          <CardContent className="divide-y">
            {group.fields.map((field) => {
              const id = `setting-${field.key}`
              const disabled = !!field.disabledWhen?.(values)
              const defaultValue = defaults?.[field.key]
              const isDefault = defaults ? sameValue(field, values[field.key], toEditable(field, defaultValue)) : true
              return (
                <div key={field.key} className={`py-4 flex flex-col gap-2 ${field.type === 'bool' ? 'sm:flex-row sm:items-start sm:justify-between' : ''} ${disabled ? 'opacity-60' : ''}`}>
                  <div className="space-y-1 sm:max-w-xl">
                    <Label htmlFor={id}>{t(field.labelKey)}</Label>
                    {field.hintKey && <p className="text-xs text-muted-foreground">{t(field.hintKey)}</p>}
                    {defaults && (
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>{t('organization.tabs.defaultValue', { value: formatValue(field, defaultValue) })}</span>
                        {!isDefault && !disabled && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={() => set(field.key, toEditable(field, defaultValue))}
                          >
                            <RotateCcw className="h-3 w-3" />
                            {t('organization.tabs.reset')}
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                  <div className={field.type === 'textarea' || field.type === 'domains' || field.type === 'url' || field.type === 'email' ? 'w-full sm:max-w-xl' : ''}>
                    {renderInput(field, id, disabled)}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}
      <div className="sticky bottom-0 flex items-center justify-end gap-3 bg-background/90 backdrop-blur py-3 border-t">
        {dirty && <span className="text-sm text-muted-foreground">{t('organization.tabs.unsaved')}</span>}
        <Button variant="outline" disabled={!dirty || saveMutation.isPending} onClick={() => setValues(initial)}>
          {t('organization.tabs.cancel')}
        </Button>
        <Button disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {t('organization.tabs.save')}
        </Button>
      </div>
    </div>
  )
}
