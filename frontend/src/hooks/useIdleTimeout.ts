import { useCallback, useEffect, useRef, useState } from 'react'

const IDLE_LIMIT_MS = 4 * 60 * 1000 // Activity resets this; after 4 minutes idle, show the warning
const WARNING_DURATION_S = 60 // 1 minute countdown before automatic logout

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const

export function useIdleTimeout(onTimeout: () => void) {
  const [isWarning, setIsWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARNING_DURATION_S)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const countdownRef = useRef<ReturnType<typeof setInterval>>()
  const warningRef = useRef(false)
  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout

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
    idleTimerRef.current = setTimeout(startWarning, IDLE_LIMIT_MS)
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

  return { isWarning, secondsLeft, stayActive }
}
