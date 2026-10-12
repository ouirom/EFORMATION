import { describe, expect, it } from 'vitest'
import { formatCountdown, sanitizeCode, twoFactorErrorKey, TERMINAL_ERRORS } from './twoFactor'

describe('two-step sign-in helpers', () => {
  it('keeps only the six digits of a typed or pasted code', () => {
    expect(sanitizeCode('123 456')).toBe('123456')
    expect(sanitizeCode('Code : 987-654')).toBe('987654')
    expect(sanitizeCode('12345678')).toBe('123456')
    expect(sanitizeCode('abc')).toBe('')
  })

  it('maps server errors to translations, unknown ones to null', () => {
    expect(twoFactorErrorKey('TWO_FACTOR_EXPIRED')).toBe('twoFactor.errors.expired')
    expect(twoFactorErrorKey('TWO_FACTOR_TOO_MANY_ATTEMPTS')).toBe('twoFactor.errors.tooManyAttempts')
    expect(twoFactorErrorKey('SOMETHING_ELSE')).toBeNull()
    expect(twoFactorErrorKey(undefined)).toBeNull()
  })

  it('treats used-up challenges as terminal, a wrong code as retryable', () => {
    expect(TERMINAL_ERRORS).toContain('TWO_FACTOR_TOO_MANY_ATTEMPTS')
    expect(TERMINAL_ERRORS).not.toContain('TWO_FACTOR_INVALID_CODE')
  })

  it('formats the resend countdown', () => {
    expect(formatCountdown(60)).toBe('1:00')
    expect(formatCountdown(5)).toBe('0:05')
    expect(formatCountdown(-3)).toBe('0:00')
  })
})
