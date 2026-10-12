import { describe, expect, it } from 'vitest'
import { DARK_FOREGROUND, LIGHT_FOREGROUND, contrastRatio, isHexColor } from './externalTheme'
import { MIN_ACTIVE_CONTRAST, sidebarActiveColors, sidebarContrast, sidebarThemeVars } from './sidebarTheme'

describe('sidebarThemeVars', () => {
  it('puts white text on a dark sidebar and near-black text on a light one', () => {
    expect(sidebarThemeVars('#0F172A', '#3B82F6')['--sb-fg']).toBe(LIGHT_FOREGROUND)
    expect(sidebarThemeVars('#8B1E1E', '#3B82F6')['--sb-fg']).toBe(LIGHT_FOREGROUND)
    expect(sidebarThemeVars('#FFFFFF', '#3B82F6')['--sb-fg']).toBe(DARK_FOREGROUND)
    expect(sidebarThemeVars('#FDE68A', '#3B82F6')['--sb-fg']).toBe(DARK_FOREGROUND)
  })

  it('only produces hex colors', () => {
    for (const value of Object.values(sidebarThemeVars('#0F172A', '#3B82F6'))) expect(isHexColor(value)).toBe(true)
  })
})

describe('sidebarActiveColors', () => {
  it('uses the primary color when it stands out from the sidebar', () => {
    const active = sidebarActiveColors('#0F172A', '#3B82F6')
    expect(active).toMatchObject({ background: '#3B82F6', usesPrimary: true })
    expect(contrastRatio(active.background, active.foreground)).toBeGreaterThan(contrastRatio(active.background, active.foreground === LIGHT_FOREGROUND ? DARK_FOREGROUND : LIGHT_FOREGROUND))
  })

  it('falls back to a neutral pill when the primary color is too close to the sidebar', () => {
    // Sidebar = primary color: no contrast at all.
    const same = sidebarActiveColors('#8B1E1E', '#8B1E1E')
    expect(same.usesPrimary).toBe(false)
    expect(same.foreground).toBe(LIGHT_FOREGROUND)
    expect(same.background).not.toBe('#8B1E1E')

    const light = sidebarActiveColors('#FFFFFF', '#FDE68A')
    expect(light.usesPrimary).toBe(false)
    expect(light.foreground).toBe(DARK_FOREGROUND)
  })

  it('switches exactly at the 3:1 threshold', () => {
    expect(contrastRatio('#3B82F6', '#FFFFFF')).toBeGreaterThanOrEqual(MIN_ACTIVE_CONTRAST)
    expect(sidebarActiveColors('#FFFFFF', '#3B82F6').usesPrimary).toBe(true)
    // #10B981 (default secondary) is about 2.5:1 on white.
    expect(sidebarActiveColors('#FFFFFF', '#10B981').usesPrimary).toBe(false)
  })
})

describe('sidebarContrast', () => {
  it('flags a mid gray sidebar as hard to read', () => {
    expect(sidebarContrast('#7A7A7A', '#3B82F6').text).toBeLessThan(4.5)
    expect(sidebarContrast('#0F172A', '#3B82F6').text).toBeGreaterThanOrEqual(4.5)
  })

  it('reports the active item contrast', () => {
    expect(sidebarContrast('#0F172A', '#3B82F6').active).toBeGreaterThanOrEqual(MIN_ACTIVE_CONTRAST)
    const fallback = sidebarContrast('#8B1E1E', '#8B1E1E')
    expect(fallback.usesPrimary).toBe(false)
    // The neutral pill keeps its text readable.
    expect(fallback.active).toBeGreaterThanOrEqual(MIN_ACTIVE_CONTRAST)
  })
})
