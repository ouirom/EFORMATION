import { createContext, useContext, useMemo, useState, ReactNode } from 'react'

interface SessionTimeoutContextType {
  /** Currently active idle-timeout override in ms, if any page has requested one. */
  idleLimitOverrideMs: number | null
  /** A page (e.g. a lesson) can request a more lenient idle-timeout window while it's
   *  mounted. Pass `null` to clear the override (done automatically on unmount). */
  setIdleLimitOverrideMs: (ms: number | null) => void
}

const SessionTimeoutContext = createContext<SessionTimeoutContextType | undefined>(undefined)

export function SessionTimeoutProvider({ children }: { children: ReactNode }) {
  const [idleLimitOverrideMs, setIdleLimitOverrideMs] = useState<number | null>(null)

  const value = useMemo(
    () => ({ idleLimitOverrideMs, setIdleLimitOverrideMs }),
    [idleLimitOverrideMs]
  )

  return (
    <SessionTimeoutContext.Provider value={value}>
      {children}
    </SessionTimeoutContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook co-located with its Provider
export function useSessionTimeoutContext() {
  const context = useContext(SessionTimeoutContext)
  if (context === undefined) {
    throw new Error('useSessionTimeoutContext must be used within a SessionTimeoutProvider')
  }
  return context
}

/**
 * Days/minutes of lesson `duration_min` -> idle-timeout window, while that lesson is
 * open: proportional but bounded, so a 5-minute lesson still gets a reasonable buffer
 * and a multi-hour one doesn't disable the safety timeout altogether.
 */
export function idleLimitForLessonDuration(durationMin: number | null | undefined): number | null {
  if (!durationMin || durationMin <= 0) return null
  const minutes = Math.min(Math.max(durationMin * 1.5, 10), 60)
  return minutes * 60 * 1000
}
