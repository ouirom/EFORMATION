import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Award, BookOpen, Info, LayoutDashboard, MessageSquare, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { MIN_TEXT_CONTRAST, isHexColor, normalizeHexColor } from '@/lib/externalTheme'
import { DEFAULT_PRIMARY_COLOR, MIN_ACTIVE_CONTRAST, sidebarContrast, sidebarThemeVars } from '@/lib/sidebarTheme'
import { ColorField } from './ExternalThemeFields'

const k = 'organization.customization.sidebar'

/** Starting point when switching to "custom" (dark navy). */
const DEFAULT_CUSTOM_SIDEBAR_COLOR = '#0F172A'

/**
 * Miniature of the staff interface (side menu with logo, 4 items, user chip; a
 * top bar and a content area). `sidebar` null = the default look, drawn with the
 * theme tokens so it follows light/dark mode like the real menu. The --sb-*
 * variables are scoped to the preview, so it never changes the admin's own menu.
 */
export function SidebarColorPreview({ sidebar, primary }: { sidebar: string | null; primary: string }) {
  const { t } = useTranslation('admin')
  const primaryColor = normalizeHexColor(primary, DEFAULT_PRIMARY_COLOR)
  const custom = isHexColor(sidebar) ? sidebar.toUpperCase() : null
  const navItem = 'flex items-center gap-1.5 rounded px-2 py-1 text-[11px]'
  const items = [
    { icon: LayoutDashboard, label: t(`${k}.previewNav1`) },
    { icon: BookOpen, label: t(`${k}.previewNav2`) },
    { icon: Award, label: t(`${k}.previewNav3`) },
    { icon: MessageSquare, label: t(`${k}.previewNav4`) },
  ]

  return (
    <div
      className="flex h-44 overflow-hidden rounded-lg border bg-background text-foreground"
      style={custom ? (sidebarThemeVars(custom, primaryColor) as CSSProperties) : undefined}
      aria-label={t(`${k}.previewTitle`)}
      data-testid="sidebar-color-preview"
    >
      <div
        className={cn(
          'flex w-36 shrink-0 flex-col border-r',
          custom
            ? 'border-[color:var(--sb-border)] bg-[color:var(--sb-bg)] text-[color:var(--sb-fg)]'
            : 'bg-card text-card-foreground'
        )}
      >
        <div className={cn('flex items-center gap-1.5 border-b p-2', custom && 'border-[color:var(--sb-border)]')}>
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
            style={{ backgroundColor: primaryColor, color: '#FFFFFF' }}
          >
            E
          </span>
          <span className="truncate text-xs font-bold">E-Formation</span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-1.5">
          {items.map(({ icon: Icon, label }, index) => (
            <span
              key={label}
              className={cn(
                navItem,
                index === 0 && custom && 'bg-[color:var(--sb-active-bg)] font-medium text-[color:var(--sb-active-fg)]'
              )}
              // Default look: the real menu's bg-primary/10 text-primary.
              style={index === 0 && !custom ? { backgroundColor: `${primaryColor}1A`, color: primaryColor } : undefined}
            >
              <Icon className="h-3 w-3 shrink-0" />
              <span className="truncate">{label}</span>
            </span>
          ))}
        </div>
        <div className={cn('flex items-center gap-1.5 border-t p-2', custom && 'border-[color:var(--sb-border)]')}>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
            MD
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-medium">{t(`${k}.previewUser`)}</span>
            <span className={cn('block truncate text-[9px]', custom ? 'text-[color:var(--sb-muted)]' : 'text-muted-foreground')}>
              {t(`${k}.previewRole`)}
            </span>
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-6 items-center gap-2 border-b px-2">
          <span className="h-2.5 w-20 rounded bg-muted" />
          <span className="ml-auto h-3 w-3 rounded-full bg-muted" />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <span className="h-3 w-24 rounded bg-muted" />
          <div className="grid grid-cols-2 gap-2">
            <span className="h-10 rounded border bg-card" />
            <span className="h-10 rounded border bg-card" />
          </div>
          <span className="h-5 w-16 rounded" style={{ backgroundColor: primaryColor }} />
        </div>
      </div>
    </div>
  )
}

/** Readability warnings: menu text below 4.5:1, active item below 3:1; a note when the primary color can't be used. */
export function SidebarContrastWarnings({ sidebar, primary }: { sidebar: string | null; primary: string }) {
  const { t, i18n } = useTranslation('admin')
  if (!isHexColor(sidebar)) return null
  const contrast = sidebarContrast(sidebar.toUpperCase(), normalizeHexColor(primary, DEFAULT_PRIMARY_COLOR))
  // Rounded down, so 4.46 doesn't read as "4.5:1 (minimum 4.5:1)".
  const format = (ratio: number) => (Math.floor(ratio * 10) / 10).toLocaleString(i18n.language, { maximumFractionDigits: 1 })
  const warnings = [
    contrast.text < MIN_TEXT_CONTRAST ? t(`${k}.textWarning`, { ratio: format(contrast.text) }) : null,
    contrast.active < MIN_ACTIVE_CONTRAST ? t(`${k}.activeWarning`, { ratio: format(contrast.active) }) : null,
  ].filter((warning): warning is string => !!warning)

  return (
    <>
      {warnings.length > 0 && (
        <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      )}
      {!contrast.usesPrimary && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="sidebar-active-fallback">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(`${k}.activeFallback`)}
        </p>
      )}
    </>
  )
}

/** "Menu latéral" block of the organization edit dialog. `value` '' = default look. */
export function SidebarColorFields({
  value,
  primary,
  secondary,
  onChange,
}: {
  value: string
  primary: string
  secondary: string
  onChange: (sidebarColor: string) => void
}) {
  const { t } = useTranslation('admin')
  const isCustom = value !== ''
  // Brought back when switching default -> custom again.
  const [lastCustom, setLastCustom] = useState(isCustom ? value : DEFAULT_CUSTOM_SIDEBAR_COLOR)
  const pick = (color: string) => {
    setLastCustom(color)
    onChange(color)
  }
  const swatches = [
    { key: 'swatchNavy', color: '#0F172A' },
    { key: 'swatchPrimary', color: primary },
    { key: 'swatchSecondary', color: secondary },
    { key: 'swatchWhite', color: '#FFFFFF' },
    { key: 'swatchBurgundy', color: '#8B1E1E' },
  ].filter(({ color }) => isHexColor(color))

  return (
    <fieldset className="space-y-3 rounded-lg border p-3" data-testid="sidebar-color-fields">
      <legend className="px-1 text-sm font-medium">{t(`${k}.title`)}</legend>
      <p className="text-xs text-muted-foreground">{t(`${k}.description`)}</p>
      <div role="radiogroup" aria-label={t(`${k}.title`)} className="flex flex-col gap-2 sm:flex-row">
        {(
          [
            ['default', t(`${k}.modeDefault`)],
            ['custom', t(`${k}.modeCustom`)],
          ] as const
        ).map(([mode, label]) => {
          const checked = (mode === 'custom') === isCustom
          return (
            <label
              key={mode}
              className={cn(
                'flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                checked && 'border-primary bg-primary/5'
              )}
            >
              <input
                type="radio"
                name="sidebar-color-mode"
                value={mode}
                checked={checked}
                onChange={() => onChange(mode === 'custom' ? lastCustom : '')}
                className="accent-[hsl(var(--primary))]"
              />
              {label}
            </label>
          )
        })}
      </div>

      {isCustom && (
        <>
          <ColorField
            id="org-sidebar-color"
            label={t(`${k}.color`)}
            value={value}
            fallback={DEFAULT_CUSTOM_SIDEBAR_COLOR}
            onChange={pick}
          />
          <div className="space-y-2">
            <Label>{t(`${k}.swatches`)}</Label>
            <div className="flex flex-wrap gap-2">
              {swatches.map(({ key, color }) => {
                const selected = color.toUpperCase() === value.toUpperCase()
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pick(color.toUpperCase())}
                    title={`${t(`${k}.${key}`)} (${color.toUpperCase()})`}
                    aria-label={`${t(`${k}.${key}`)} (${color.toUpperCase()})`}
                    aria-pressed={selected}
                    data-swatch={key}
                    className={cn(
                      'h-8 w-8 rounded-md border shadow-sm transition-transform hover:scale-110',
                      selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                    )}
                    style={{ backgroundColor: color }}
                  />
                )
              })}
            </div>
          </div>
          <SidebarContrastWarnings sidebar={value} primary={primary} />
        </>
      )}

      <SidebarColorPreview sidebar={isCustom ? value : null} primary={primary} />
      <Button type="button" variant="outline" size="sm" disabled={!isCustom} onClick={() => onChange('')}>
        <RotateCcw className="mr-2 h-4 w-4" />
        {t(`${k}.reset`)}
      </Button>
    </fieldset>
  )
}
