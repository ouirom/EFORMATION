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
