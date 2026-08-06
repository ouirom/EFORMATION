import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_IDLE_LIMIT_MS = 4 * 60 * 1000 // Activity resets this; after 4 minutes idle, show the warning
const WARNING_DURATION_S = 60 // 1 minute countdown before automatic logout

// Minimum time between proactive session-refresh calls triggered by activity —
// activity events fire far more often than that, this just throttles them.
const ACTIVITY_REFRESH_THROTTLE_MS = 4 * 60 * 1000

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const

export interface UseIdleTimeoutOptions {
  /** Idle time before the "about to log out" warning appears. Defaults to 4 minutes;
   *  pass a larger value (e.g. while a long lesson is open) to be more lenient. */
  idleLimitMs?: number
  /** Called (throttled) on genuine user activity, to proactively refresh the auth
   *  session so it never expires under an actively-used tab. */
  onActivity?: () => void
}

export function useIdleTimeout(onTimeout: () => void, options: UseIdleTimeoutOptions = {}) {
  const [isWarning, setIsWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARNING_DURATION_S)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const countdownRef = useRef<ReturnType<typeof setInterval>>()
  const warningRef = useRef(false)
  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout
  const idleLimitMs = options.idleLimitMs ?? DEFAULT_IDLE_LIMIT_MS
  const idleLimitRef = useRef(idleLimitMs)
  idleLimitRef.current = idleLimitMs
  const onActivityRef = useRef(options.onActivity)
  onActivityRef.current = options.onActivity
  const lastActivityRefreshRef = useRef(0)

  const clearTimers = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }

  const startWarning = useCallback(() => {
    warningRef.current = true
    setIsWarning(true)
    let remaining = WARNING_DURATION_S
    setSecondsLeft(remaining)
    countdownRef.current = setInterval(() => {
      remaining -= 1
      setSecondsLeft(remaining)
      if (remaining <= 0) {
        clearTimers()
        onTimeoutRef.current()
      }
    }, 1000)
  }, [])

  const resetIdleTimer = useCallback(() => {
    // Ignore passive page activity once the countdown is showing — only the
    // explicit "stay connected" action (stayActive) should cancel it.
    if (warningRef.current) return
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(startWarning, idleLimitRef.current)

    const now = Date.now()
    if (onActivityRef.current && now - lastActivityRefreshRef.current > ACTIVITY_REFRESH_THROTTLE_MS) {
      lastActivityRefreshRef.current = now
      onActivityRef.current()
    }
  }, [startWarning])

  const stayActive = useCallback(() => {
    warningRef.current = false
    setIsWarning(false)
    clearTimers()
    resetIdleTimer()
  }, [resetIdleTimer])

  useEffect(() => {
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetIdleTimer))
    resetIdleTimer()
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetIdleTimer))
      clearTimers()
    }
  }, [resetIdleTimer])

  // Re-apply immediately when the idle limit itself changes (e.g. opening or
  // leaving a lesson), instead of waiting for the next activity event to pick it up.
  useEffect(() => {
    if (warningRef.current) return
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(startWarning, idleLimitMs)
  }, [idleLimitMs, startWarning])

  return { isWarning, secondsLeft, stayActive }
}
