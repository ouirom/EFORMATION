import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Award, BookOpen, Briefcase, LayoutDashboard, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DEFAULT_EXTERNAL_ACCENT_COLOR,
  DEFAULT_EXTERNAL_SURFACE_COLOR,
  MIN_TEXT_CONTRAST,
  externalThemeVars,
  isHexColor,
  normalizeHexColor,
  textContrast,
} from '@/lib/externalTheme'

/**
 * Miniature of the external participants' space (sidebar, ribbon, button,
 * badge) in the given colors. The --ext-* variables are scoped to the preview,
 * so it never changes the admin's own theme.
 */
export function ExternalThemePreview({ accent, surface }: { accent: string; surface: string }) {
  const { t } = useTranslation('admin')
  const colors = {
    accent: normalizeHexColor(accent, DEFAULT_EXTERNAL_ACCENT_COLOR),
    surface: normalizeHexColor(surface, DEFAULT_EXTERNAL_SURFACE_COLOR),
  }
  const k = 'organization.customization.externalTheme'
  const navItem = 'flex items-center gap-1.5 rounded px-2 py-1 text-[11px]'

  return (
    <div
      className="flex h-40 overflow-hidden rounded-lg border bg-background text-foreground"
      style={externalThemeVars(colors) as CSSProperties}
      aria-label={t(`${k}.previewTitle`)}
      data-testid="external-theme-preview"
    >
      <div className="flex w-36 shrink-0 flex-col gap-1 bg-[color:var(--ext-surface)] p-2 text-[color:var(--ext-surface-foreground)]">
        <div className="mb-1 border-b border-[color:var(--ext-surface-border)] pb-1.5">
          <p className="text-xs font-bold">E-Formation</p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--ext-surface-accent-text)]">
            {t(`${k}.previewSpace`)}
          </p>
        </div>
        <span className={`${navItem} bg-[color:var(--ext-accent)] text-[color:var(--ext-accent-foreground)]`}>
          <LayoutDashboard className="h-3 w-3" />
          {t(`${k}.previewNavActive`)}
        </span>
        <span className={navItem}>
          <BookOpen className="h-3 w-3" />
          {t(`${k}.previewNavItem1`)}
        </span>
        <span className={`${navItem} text-[color:var(--ext-surface-muted)]`}>
          <Award className="h-3 w-3" />
          {t(`${k}.previewNavItem2`)}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-5 items-center gap-1 bg-[color:var(--ext-accent)] px-2 text-[10px] font-medium text-[color:var(--ext-accent-foreground)]">
          <Briefcase className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{t(`${k}.previewBadge`)}</span>
        </div>
        <div className="flex flex-1 flex-col items-start justify-center gap-3 p-3">
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[color:var(--ext-accent)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--ext-accent-foreground)]">
            <Briefcase className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{t(`${k}.previewBadge`)}</span>
          </span>
          <span className="rounded-md bg-[color:var(--ext-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--ext-accent-foreground)]">
            {t(`${k}.previewButton`)}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Readability warnings (WCAG ratio below 4.5:1 between a color and its text). */
export function ExternalThemeContrastWarnings({ accent, surface }: { accent: string; surface: string }) {
  const { t, i18n } = useTranslation('admin')
  const k = 'organization.customization.externalTheme'
  const warnings = (
    [
      ['areaAccent', accent],
      ['areaSurface', surface],
    ] as const
  )
    .filter(([, color]) => isHexColor(color))
    .map(([area, color]) => ({ area, ratio: textContrast(color) }))
    .filter(({ ratio }) => ratio < MIN_TEXT_CONTRAST)

  if (warnings.length === 0) return null
  return (
    <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
      {warnings.map(({ area, ratio }) => (
        <p key={area} className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(`${k}.contrastWarning`, {
            area: t(`${k}.${area}`),
            ratio: ratio.toLocaleString(i18n.language, { maximumFractionDigits: 1 }),
          })}
        </p>
      ))}
    </div>
  )
}

function ColorField({
  id,
  label,
  value,
  fallback,
  onChange,
}: {
  id: string
  label: string
  value: string
  fallback: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation('admin')
  const invalid = !isHexColor(value)
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="color"
          value={normalizeHexColor(value, fallback).toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="w-20 h-10 p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          className="font-mono"
          aria-invalid={invalid}
          aria-label={label}
          maxLength={7}
        />
      </div>
      {invalid && <p className="text-xs text-destructive">{t('organization.customization.externalTheme.invalidColor')}</p>}
    </div>
  )
}

/** "Espace intervenants externes" block of the organization edit dialog. */
export function ExternalThemeFields({
  accent,
  surface,
  onChange,
}: {
  accent: string
  surface: string
  onChange: (colors: { externalAccentColor?: string; externalSurfaceColor?: string }) => void
}) {
  const { t } = useTranslation('admin')
  const k = 'organization.customization.externalTheme'
  const isDefault =
    accent.toUpperCase() === DEFAULT_EXTERNAL_ACCENT_COLOR && surface.toUpperCase() === DEFAULT_EXTERNAL_SURFACE_COLOR

  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{t(`${k}.title`)}</legend>
      <p className="text-xs text-muted-foreground">{t(`${k}.description`)}</p>
      <div className="grid grid-cols-2 gap-4">
        <ColorField
          id="org-external-accent-color"
          label={t(`${k}.accentColor`)}
          value={accent}
          fallback={DEFAULT_EXTERNAL_ACCENT_COLOR}
          onChange={(value) => onChange({ externalAccentColor: value })}
        />
        <ColorField
          id="org-external-surface-color"
          label={t(`${k}.surfaceColor`)}
          value={surface}
          fallback={DEFAULT_EXTERNAL_SURFACE_COLOR}
          onChange={(value) => onChange({ externalSurfaceColor: value })}
        />
      </div>
      <ExternalThemeContrastWarnings accent={accent} surface={surface} />
      <ExternalThemePreview accent={accent} surface={surface} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isDefault}
        onClick={() =>
          onChange({ externalAccentColor: DEFAULT_EXTERNAL_ACCENT_COLOR, externalSurfaceColor: DEFAULT_EXTERNAL_SURFACE_COLOR })
        }
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        {t(`${k}.reset`)}
      </Button>
    </fieldset>
  )
}
