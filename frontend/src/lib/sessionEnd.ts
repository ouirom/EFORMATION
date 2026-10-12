/**
 * Ending a session the server closed: "the most recent login wins" (one active
 * session per user, Administration > Organisation > Sécurité). The kicked tab
 * learns it either from the socket (`session:revoked`, at once) or from its
 * next API call (401 SESSION_REPLACED); both end up here.
 */

/** sessionStorage flag read (and cleared) by the login pages to show the banner. */
export const SESSION_REPLACED_KEY = 'sessionReplaced'

/** The role claim of a stored access token, without verifying it (only to pick the login page). */
export function roleFromAccessToken(token: string | null): string | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    const role = JSON.parse(json)?.role
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

/** External participants sign in on their own portal. */
export function loginPathForRole(role: string | null | undefined): string {
  return role === 'externe' ? '/external/login' : '/login'
}

let ending = false

/**
 * Signs this browser out because the account signed in on another device:
 * clears the tokens, remembers the page to come back to and the reason (for the
 * banner), and goes to the right login page with a full reload (drops every
 * cached query of the previous user).
 */
export function endReplacedSession(): void {
  if (ending) return
  ending = true
  const role = roleFromAccessToken(localStorage.getItem('accessToken'))
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  sessionStorage.setItem(SESSION_REPLACED_KEY, String(Date.now()))
  const here = window.location.pathname + window.location.search
  if (!here.startsWith('/login') && !here.startsWith('/external/login')) {
    sessionStorage.setItem('postLoginRedirect', here)
  }
  window.location.href = loginPathForRole(role)
}

/** The banner explains a sign-out that just happened, not one from long ago. */
const BANNER_MAX_AGE_MS = 10 * 60 * 1000

/**
 * Whether the login page should explain the sign-out (see SessionReplacedBanner).
 * The flag is kept until the next successful login rather than cleared when
 * first read: on a kicked page React Router may render /login a moment before
 * the full reload to /login, and that first render must not use it up.
 */
export function hasSessionReplacedFlag(): boolean {
  const at = Number(sessionStorage.getItem(SESSION_REPLACED_KEY))
  return Number.isFinite(at) && at > 0 && Date.now() - at < BANNER_MAX_AGE_MS
}

export function clearSessionReplacedFlag(): void {
  sessionStorage.removeItem(SESSION_REPLACED_KEY)
}
