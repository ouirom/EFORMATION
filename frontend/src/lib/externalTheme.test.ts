import { describe, expect, it } from 'vitest'
import {
  DARK_FOREGROUND,
  LIGHT_FOREGROUND,
  contrastRatio,
  ensureContrast,
  externalThemeVars,
  isHexColor,
  mixHex,
  normalizeHexColor,
  readableForeground,
  relativeLuminance,
  textContrast,
} from './externalTheme'

describe('isHexColor / normalizeHexColor', () => {
  it('accepts #RRGGBB only', () => {
    expect(isHexColor('#0E7490')).toBe(true)
    expect(isHexColor('#0e7490')).toBe(true)
    for (const value of ['0E7490', '#FFF', '#0E74901', '#GGGGGG', 'red', '', null, undefined, 42]) {
      expect(isHexColor(value)).toBe(false)
    }
  })

  it('upper-cases valid colors and falls back otherwise', () => {
    expect(normalizeHexColor('#0e7490', '#000000')).toBe('#0E7490')
    expect(normalizeHexColor(null, '#D97706')).toBe('#D97706')
    expect(normalizeHexColor('blue', '#D97706')).toBe('#D97706')
  })
})

describe('luminance and contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1)
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21)
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1)
    // #767676 on white is the classic "just passes AA" gray.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('readableForeground', () => {
  it('puts white text on dark colors and near-black text on light ones', () => {
    expect(readableForeground('#0F172A')).toBe(LIGHT_FOREGROUND)
    expect(readableForeground('#0E7490')).toBe(LIGHT_FOREGROUND)
    expect(readableForeground('#FFFFFF')).toBe(DARK_FOREGROUND)
    expect(readableForeground('#FDE68A')).toBe(DARK_FOREGROUND)
  })

  it('picks the better of the two for the default amber', () => {
    const fg = readableForeground('#D97706')
    const other = fg === LIGHT_FOREGROUND ? DARK_FOREGROUND : LIGHT_FOREGROUND
    expect(contrastRatio('#D97706', fg)).toBeGreaterThan(contrastRatio('#D97706', other))
  })
})

describe('mixHex / ensureContrast', () => {
  it('mixes two colors', () => {
    expect(mixHex('#FFFFFF', '#000000', 0)).toBe('#000000')
    expect(mixHex('#FFFFFF', '#000000', 1)).toBe('#FFFFFF')
    expect(mixHex('#FFFFFF', '#000000', 0.5)).toBe('#808080')
  })

  it('darkens a light accent until it is readable on white', () => {
    const text = ensureContrast('#FACC15', '#FFFFFF', '#000000')
    expect(contrastRatio(text, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(ensureContrast('#0E7490', '#FFFFFF', '#000000')).toBe('#0E7490')
  })
})

describe('externalThemeVars / textContrast', () => {
  it('derives every variable from the two colors', () => {
    const vars = externalThemeVars({ accent: '#0E7490', surface: '#0F172A' })
    expect(vars['--ext-accent']).toBe('#0E7490')
    expect(vars['--ext-accent-foreground']).toBe(LIGHT_FOREGROUND)
    expect(vars['--ext-surface']).toBe('#0F172A')
    expect(vars['--ext-surface-foreground']).toBe(LIGHT_FOREGROUND)
    for (const value of Object.values(vars)) expect(isHexColor(value)).toBe(true)
    expect(contrastRatio(vars['--ext-surface-accent-text'], '#0F172A')).toBeGreaterThanOrEqual(4.5)
  })

  it('tells whether a color can carry readable text', () => {
    expect(textContrast('#0E7490')).toBeGreaterThanOrEqual(4.5)
    expect(textContrast('#0F172A')).toBeGreaterThanOrEqual(4.5)
    // #808080 still just reaches 4.5:1 with near-black text; #7A7A7A reaches it with neither.
    expect(textContrast('#808080')).toBeGreaterThanOrEqual(4.5)
    expect(textContrast('#7A7A7A')).toBeLessThan(4.5)
  })
})
