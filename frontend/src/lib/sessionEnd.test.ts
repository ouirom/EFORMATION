import { afterEach, describe, expect, it } from 'vitest'
import { clearSessionReplacedFlag, hasSessionReplacedFlag, loginPathForRole, roleFromAccessToken, SESSION_REPLACED_KEY } from './sessionEnd'

const b64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fakeToken = (claims: Record<string, unknown>) => `${b64url({ alg: 'HS256' })}.${b64url(claims)}.signature`

afterEach(() => sessionStorage.clear())

describe('session replaced by a login elsewhere', () => {
  it('sends external participants to their own login page', () => {
    expect(loginPathForRole(roleFromAccessToken(fakeToken({ id: 1, role: 'externe' })))).toBe('/external/login')
    expect(loginPathForRole(roleFromAccessToken(fakeToken({ id: 1, role: 'agent' })))).toBe('/login')
  })

  it('falls back to /login without a readable token', () => {
    expect(roleFromAccessToken(null)).toBeNull()
    expect(roleFromAccessToken('not-a-jwt')).toBeNull()
    expect(loginPathForRole(null)).toBe('/login')
  })

  it('shows the banner for a recent sign-out, until the next login clears it', () => {
    sessionStorage.setItem(SESSION_REPLACED_KEY, String(Date.now() - 60 * 60 * 1000))
    expect(hasSessionReplacedFlag()).toBe(false)
    sessionStorage.setItem(SESSION_REPLACED_KEY, String(Date.now()))
    expect(hasSessionReplacedFlag()).toBe(true)
    expect(hasSessionReplacedFlag()).toBe(true)
    clearSessionReplacedFlag()
    expect(hasSessionReplacedFlag()).toBe(false)
  })
})
