import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Course categories are stored as a code in courses.category. This is the single
 * list of known codes -- labels live in the `shared` namespace
 * (courseCategories.<code>), so every page (dashboard, catalog, course detail,
 * admin) shows the same translated name and the same thumbnail colour.
 */
export const COURSE_CATEGORIES = [
  'technology',
  'management',
  'marketing',
  'finance',
  'hr',
  'soft-skills',
  'compliance',
  'other',
] as const

export type CourseCategory = (typeof COURSE_CATEGORIES)[number]

// Older rows/seed data used a short code for the same category.
const LEGACY_ALIASES: Record<string, CourseCategory> = {
  tech: 'technology',
}

const GRADIENTS: Record<CourseCategory, string> = {
  technology: 'from-blue-600 to-indigo-700',
  management: 'from-purple-600 to-pink-600',
  marketing: 'from-rose-500 to-orange-500',
  finance: 'from-emerald-600 to-teal-700',
  hr: 'from-violet-600 to-fuchsia-600',
  'soft-skills': 'from-teal-600 to-emerald-600',
  compliance: 'from-amber-600 to-red-600',
  other: 'from-slate-500 to-slate-700',
}

const DEFAULT_GRADIENT = 'from-primary/90 to-primary/60'

export function normalizeCategory(code?: string | null): CourseCategory | null {
  if (!code) return null
  const key = code.trim().toLowerCase()
  if ((COURSE_CATEGORIES as readonly string[]).includes(key)) return key as CourseCategory
  return LEGACY_ALIASES[key] ?? null
}

/** Tailwind gradient classes for a course thumbnail without an image. */
export function categoryGradient(code?: string | null): string {
  const category = normalizeCategory(code)
  return category ? GRADIENTS[category] : DEFAULT_GRADIENT
}

/**
 * Returns a function translating a category code into its label. An empty
 * category gets the generic "Training" label; an unknown code (free text typed
 * before the list existed) is shown as-is rather than hidden.
 */
export function useCategoryLabel() {
  const { t } = useTranslation('shared')
  return useCallback(
    (code?: string | null) => {
      if (!code) return t('courseCategories.none')
      const category = normalizeCategory(code)
      return category ? t(`courseCategories.${category}`) : code
    },
    [t]
  )
}
