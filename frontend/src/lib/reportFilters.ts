/**
 * Per-column ("header") filters for the report preview table. Pure functions so
 * the matching rules are unit-tested independently of the page.
 *
 * - text / date columns: case- and accent-insensitive "contains" on the displayed
 *   value (so a date filter matches what the user sees: "27/09", "2026"...).
 * - number / percent columns: a small expression — `>50`, `>=50`, `<10`, `<=10`,
 *   `=5` or just `5`, and ranges `10-20` / `10..20`. Decimal commas and a trailing
 *   `%` are accepted.
 * - "choice" columns (few distinct values, e.g. role or category): exact match
 *   on one of the listed values.
 */

export type FilterKind = 'text' | 'number' | 'choice'

/** Sentinel choice value for "cells that are empty". */
export const EMPTY_CHOICE = '__empty__'

/** Above this many distinct values a text column gets a free-text filter instead of a list. */
export const MAX_CHOICES = 12

export function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function toNumber(raw: string): number | null {
  const cleaned = raw.trim().replace('%', '').replace(/\s/g, '').replace(',', '.')
  if (cleaned === '' || Number.isNaN(Number(cleaned))) return null
  return Number(cleaned)
}

/**
 * Parses a numeric filter expression.
 * Returns undefined for an empty expression (no filtering), null when it can't
 * be understood (so the UI can flag it), otherwise the predicate.
 */
export function parseNumberFilter(expression: string): ((value: number) => boolean) | null | undefined {
  const expr = expression.trim()
  if (expr === '') return undefined

  const range = expr.match(/^(-?[\d\s.,]+)\s*(?:\.\.|-|–|à|to)\s*(-?[\d\s.,]+)%?$/i)
  if (range) {
    const [min, max] = [toNumber(range[1]), toNumber(range[2])]
    if (min === null || max === null) return null
    const [lo, hi] = min <= max ? [min, max] : [max, min]
    return (value) => value >= lo && value <= hi
  }

  const comparison = expr.match(/^(>=|<=|>|<|=)?\s*(.+)$/)
  const operator = comparison?.[1] ?? '='
  const operand = comparison ? toNumber(comparison[2]) : null
  if (operand === null) return null
  switch (operator) {
    case '>': return (value) => value > operand
    case '>=': return (value) => value >= operand
    case '<': return (value) => value < operand
    case '<=': return (value) => value <= operand
    default: return (value) => value === operand
  }
}

export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

/**
 * Whether a row's cell passes a column filter.
 * `raw` is the stored value, `displayed` its formatted text (what the user sees).
 */
export function cellMatches(kind: FilterKind, filter: string, raw: unknown, displayed: string): boolean {
  if (filter === '') return true
  if (kind === 'choice') {
    return filter === EMPTY_CHOICE ? isEmptyValue(raw) : !isEmptyValue(raw) && displayed === filter
  }
  if (kind === 'number') {
    const predicate = parseNumberFilter(filter)
    if (predicate === undefined) return true
    if (predicate === null) return false
    return typeof raw === 'number' && predicate(raw)
  }
  return fold(displayed).includes(fold(filter.trim()))
}

/** Distinct displayed values of a column, sorted, when few enough to offer as a list. */
export function choicesFor(values: string[]): string[] | null {
  const distinct = Array.from(new Set(values.filter((v) => v !== ''))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  )
  return distinct.length > 0 && distinct.length <= MAX_CHOICES ? distinct : null
}
