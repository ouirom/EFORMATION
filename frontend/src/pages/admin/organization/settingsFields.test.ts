import { describe, expect, it } from 'vitest'
import { COMPLIANCE_GROUPS, LEARNING_GROUPS, PLATFORM_GROUPS, SECURITY_GROUPS } from './settingsFields'

const ALL = [...PLATFORM_GROUPS, ...SECURITY_GROUPS, ...LEARNING_GROUPS, ...COMPLIANCE_GROUPS].flatMap((g) => g.fields)

describe('organization settings fields', () => {
  it('edits each setting in exactly one place', () => {
    const keys = ALL.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives every number a range and every select its options', () => {
    for (const field of ALL) {
      if (field.type === 'int') expect([field.key, typeof field.min, typeof field.max]).toEqual([field.key, 'number', 'number'])
      if (field.type === 'select') expect(field.options?.length).toBeGreaterThan(1)
    }
  })

  it('greys out the leaderboard settings while XP is off', () => {
    const scope = ALL.find((f) => f.key === 'leaderboardScope')!
    expect(scope.disabledWhen?.({ enableXp: false })).toBe(true)
    expect(scope.disabledWhen?.({ enableXp: true })).toBe(false)
  })

  it('offers the one-session-per-user switch in the sessions group of the security tab', () => {
    const sessions = SECURITY_GROUPS.find((g) => g.titleKey === 'organization.tabs.groups.sessions')!
    const field = sessions.fields.find((f) => f.key === 'singleSessionPerUser')
    expect(field).toMatchObject({ type: 'bool', labelKey: 'organization.settingsDialog.security.singleSessionPerUser' })
  })
})
