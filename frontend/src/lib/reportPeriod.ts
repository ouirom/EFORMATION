// Period selection for the admin reports page: presets resolved to local calendar
// days ("YYYY-MM-DD", the format POST /reports/generate expects for startDate /
// endDate, both inclusive). Everything works on local dates built from
// year/month/day parts -- never through toISOString(), which shifts the day in
// time zones east/west of UTC.

export const PERIOD_PRESETS = [
  'all',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'thisYear',
  'custom',
] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

/** Inclusive range of local days; both empty = the whole period (no filter). */
export interface DayRange {
  start: string
  end: string
}

export interface PeriodSelection {
  preset: PeriodPreset
  /** Only used by the "custom" preset. */
  customStart: string
  customEnd: string
}

export type CustomRangeError = 'startRequired' | 'endRequired' | 'invalidDate' | 'endBeforeStart' | 'inFuture'

export const DEFAULT_PERIOD: PeriodSelection = { preset: 'all', customStart: '', customEnd: '' }

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day of `date` as "YYYY-MM-DD". */
export function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local midnight of a "YYYY-MM-DD" key, or null when it isn't a real calendar day. */
export function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day)
  // Rejects 2026-02-30 and the like, which Date silently rolls over.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

// new Date(y, m, d) normalizes overflow/underflow (day 0 = last day of previous month).
const day = (year: number, month: number, date: number) => toDayKey(new Date(year, month, date))

/** The range a preset covers on `today` (current periods stop at today). "all" and "custom" give an open range. */
export function presetRange(preset: PeriodPreset, today: Date = new Date()): DayRange {
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  const end = day(y, m, d)
  switch (preset) {
    case 'last7':
      return { start: day(y, m, d - 6), end }
    case 'last30':
      return { start: day(y, m, d - 29), end }
    case 'thisMonth':
      return { start: day(y, m, 1), end }
    case 'lastMonth':
      return { start: day(y, m - 1, 1), end: day(y, m, 0) }
    case 'thisQuarter':
      return { start: day(y, m - (m % 3), 1), end }
    case 'thisYear':
      return { start: day(y, 0, 1), end }
    default:
      return { start: '', end: '' }
  }
}

/** Why a custom range can't be used, or null when it's valid (both days set, end >= start, not after today). */
export function validateCustomRange(start: string, end: string, today: Date = new Date()): CustomRangeError | null {
  if (!start) return 'startRequired'
  if (!end) return 'endRequired'
  if (!parseDayKey(start) || !parseDayKey(end)) return 'invalidDate'
  // "YYYY-MM-DD" keys compare correctly as strings.
  if (end < start) return 'endBeforeStart'
  if (end > toDayKey(today)) return 'inFuture'
  return null
}

/**
 * The range to send for a selection: open for "all", the preset's days otherwise.
 * A custom range that doesn't validate gives `error` and no usable range.
 */
export function resolvePeriod(
  selection: PeriodSelection,
  today: Date = new Date()
): { range: DayRange; error: CustomRangeError | null } {
  if (selection.preset !== 'custom') return { range: presetRange(selection.preset, today), error: null }
  const error = validateCustomRange(selection.customStart, selection.customEnd, today)
  return {
    range: error ? { start: '', end: '' } : { start: selection.customStart, end: selection.customEnd },
    error,
  }
}

/** A day key in words for `locale`, e.g. "1 sept. 2026" (fr-FR) or "Sep 1, 2026" (en-US). */
export function formatDayKey(key: string, locale: string): string {
  const date = parseDayKey(key)
  if (!date) return key
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

// --- Per-viewer memory of the chosen period (a convenience: any failure falls back to the default).

export const PERIOD_STORAGE_KEY = 'reports.period'

export function loadPeriodSelection(storage: Pick<Storage, 'getItem'> | undefined = safeLocalStorage()): PeriodSelection {
  try {
    const raw = storage?.getItem(PERIOD_STORAGE_KEY)
    if (!raw) return DEFAULT_PERIOD
    const parsed = JSON.parse(raw)
    if (!parsed || !PERIOD_PRESETS.includes(parsed.preset)) return DEFAULT_PERIOD
    const text = (v: unknown) => (typeof v === 'string' && parseDayKey(v) ? v : '')
    return { preset: parsed.preset, customStart: text(parsed.customStart), customEnd: text(parsed.customEnd) }
  } catch {
    return DEFAULT_PERIOD
  }
}

export function savePeriodSelection(
  selection: PeriodSelection,
  storage: Pick<Storage, 'setItem'> | undefined = safeLocalStorage()
): void {
  try {
    storage?.setItem(PERIOD_STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // Private mode / blocked storage: the choice just isn't remembered.
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  } catch {
    return undefined
  }
}
