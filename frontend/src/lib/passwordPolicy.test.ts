import { describe, expect, it } from 'vitest'
import { isPasswordCompliant, passwordRules, policyFromSettings } from './passwordPolicy'

describe('passwordRules', () => {
  it('lists every rule under the default policy', () => {
    expect(passwordRules('abc').map((r) => r.key)).toEqual(['minLength', 'uppercase', 'lowercase', 'digit', 'special'])
  })

  it('only checks the length when complexity is off', () => {
    const policy = { minLength: 12, requireComplexity: false }
    expect(passwordRules('abc', policy).map((r) => r.key)).toEqual(['minLength'])
    expect(isPasswordCompliant('twelve chars', policy)).toBe(true)
    expect(isPasswordCompliant('eleven char', policy)).toBe(false)
  })

  it('accepts any non-alphanumeric character as special, like the server', () => {
    expect(isPasswordCompliant('Passw0rd-long')).toBe(true)
    expect(isPasswordCompliant('Passw0rdlong')).toBe(false)
  })
})

describe('policyFromSettings', () => {
  it('uses the organization values, never below 8 characters', () => {
    expect(policyFromSettings({ passwordMinLength: 14, passwordRequireComplexity: false })).toEqual({
      minLength: 14,
      requireComplexity: false,
    })
    expect(policyFromSettings({ passwordMinLength: 4 }).minLength).toBe(8)
    expect(policyFromSettings(undefined)).toEqual({ minLength: 8, requireComplexity: true })
  })
})
