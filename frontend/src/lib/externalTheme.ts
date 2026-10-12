import { useEffect } from 'react'
import { hexToHslTriplet } from '@/lib/utils'

/**
 * Partner theme of the external participants' space (role 'externe'): an accent
 * color (buttons, links, active menu item, ribbon) and a surface color (sidebar,
 * left panel of /external/login), set in Administration > Organisation >
 * Personnalisation. Exposed as CSS variables (--ext-*) holding plain hex colors,
 * consumed with Tailwind arbitrary values such as bg-[color:var(--ext-accent)].
 */
export const DEFAULT_EXTERNAL_ACCENT_COLOR = '#D97706'
export const DEFAULT_EXTERNAL_SURFACE_COLOR = '#0F172A'

/** Text color used on light accents / surfaces (near-black, matches the dark navy). */
export const DARK_FOREGROUND = '#0F172A'
export const LIGHT_FOREGROUND = '#FFFFFF'

/** WCAG AA minimum contrast for normal-size text. */
export const MIN_TEXT_CONTRAST = 4.5

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

/** The color to apply: the given one when it is a valid #RRGGBB, otherwise the fallback. */
export function normalizeHexColor(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.toUpperCase() : fallback
}

function toRgb(hex: string): [number, number, number] {
  const int = parseInt(hex.slice(1), 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors, from 1 (same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** White or near-black, whichever reads better on the given background. */
export function readableForeground(background: string): string {
  return contrastRatio(background, LIGHT_FOREGROUND) >= contrastRatio(background, DARK_FOREGROUND)
    ? LIGHT_FOREGROUND
    : DARK_FOREGROUND
}

/** `weight` of `color` over `base` (0 = base, 1 = color). */
export function mixHex(color: string, base: string, weight: number): string {
  const a = toRgb(color)
  const b = toRgb(base)
  return toHex([0, 1, 2].map((i) => a[i] * weight + b[i] * (1 - weight)) as [number, number, number])
}

/**
 * `color` moved toward `toward` just enough to reach `minRatio` against
 * `background` (for accent-colored text on a page or on the dark surface).
 */
export function ensureContrast(color: string, background: string, toward: string, minRatio = MIN_TEXT_CONTRAST): string {
  for (let step = 0; step <= 20; step++) {
    const candidate = mixHex(toward, color, step / 20)
    if (contrastRatio(candidate, background) >= minRatio) return candidate
  }
  return toward
}

export interface ExternalThemeColors {
  accent: string
  surface: string
}

/** Every --ext-* variable derived from the two chosen colors. */
export function externalThemeVars({ accent, surface }: ExternalThemeColors): Record<string, string> {
  const accentForeground = readableForeground(accent)
  const surfaceForeground = readableForeground(surface)
  return {
    '--ext-accent': accent,
    '--ext-accent-foreground': accentForeground,
    '--ext-accent-hover': mixHex(accentForeground === LIGHT_FOREGROUND ? '#000000' : '#FFFFFF', accent, 0.12),
    // Accent as text / tints on the (light) page.
    '--ext-accent-text': ensureContrast(accent, '#FFFFFF', '#000000'),
    '--ext-accent-soft': mixHex(accent, '#FFFFFF', 0.1),
    '--ext-accent-border': mixHex(accent, '#FFFFFF', 0.45),
    '--ext-surface': surface,
    '--ext-surface-foreground': surfaceForeground,
    '--ext-surface-muted': mixHex(surfaceForeground, surface, 0.65),
    '--ext-surface-raised': mixHex(surfaceForeground, surface, 0.08),
    '--ext-surface-border': mixHex(surfaceForeground, surface, 0.14),
    // Accent as text / tints on the surface (sidebar, auth panel).
    '--ext-surface-accent-text': ensureContrast(accent, surface, surfaceForeground),
    '--ext-surface-accent-soft': mixHex(accent, surface, 0.18),
  }
}

/** Contrast between a color and the text drawn on it (below MIN_TEXT_CONTRAST is hard to read). */
export function textContrast(background: string): number {
  return contrastRatio(background, readableForeground(background))
}

/**
 * Sets the --ext-* variables on <html> while the caller is mounted. With
 * `asPrimary`, the accent also replaces the organization's primary color
 * (--primary, --ring, --primary-foreground) so buttons, links and active tabs
 * follow it.
 */
export function useExternalTheme(
  colors: { accent?: string | null; surface?: string | null } | null,
  { asPrimary = false }: { asPrimary?: boolean } = {}
) {
  const accent = colors ? normalizeHexColor(colors.accent, DEFAULT_EXTERNAL_ACCENT_COLOR) : null
  const surface = colors ? normalizeHexColor(colors.surface, DEFAULT_EXTERNAL_SURFACE_COLOR) : null

  useEffect(() => {
    if (!accent || !surface) return
    const style = document.documentElement.style
    const vars = externalThemeVars({ accent, surface })
    if (asPrimary) {
      vars['--primary'] = hexToHslTriplet(accent)!
      vars['--ring'] = hexToHslTriplet(accent)!
      vars['--primary-foreground'] = hexToHslTriplet(vars['--ext-accent-foreground'])!
    }
    for (const [name, value] of Object.entries(vars)) style.setProperty(name, value)
    return () => {
      for (const name of Object.keys(vars)) style.removeProperty(name)
    }
  }, [accent, surface, asPrimary])
}
