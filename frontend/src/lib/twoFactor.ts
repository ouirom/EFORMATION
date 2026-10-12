/**
 * Helpers of the two-step sign-in screens (login, external portal, Profil >
 * Sécurité): what the code field accepts and how server errors read.
 */

/** Keeps the digits of what was typed or pasted ("123 456", "Code : 123456"), at most 6. */
export function sanitizeCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

/** Server error codes of /auth/2fa/* -> key in the `auth` namespace (twoFactor.errors.*). */
const ERROR_KEYS: Record<string, string> = {
  TWO_FACTOR_INVALID_CODE: 'invalidCode',
  TWO_FACTOR_EXPIRED: 'expired',
  TWO_FACTOR_TOO_MANY_ATTEMPTS: 'tooManyAttempts',
  TWO_FACTOR_INVALID_CHALLENGE: 'invalidChallenge',
  TWO_FACTOR_RESEND_TOO_SOON: 'resendTooSoon',
  TWO_FACTOR_TOO_MANY_SENDS: 'tooManySends',
}

/** Errors after which this challenge can't succeed any more: only "start again" helps. */
export const TERMINAL_ERRORS = ['TWO_FACTOR_TOO_MANY_ATTEMPTS', 'TWO_FACTOR_INVALID_CHALLENGE', 'TWO_FACTOR_TOO_MANY_SENDS']

export function twoFactorErrorKey(code?: string): string | null {
  return code && ERROR_KEYS[code] ? `twoFactor.errors.${ERROR_KEYS[code]}` : null
}

/** 125 -> "2:05" */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
