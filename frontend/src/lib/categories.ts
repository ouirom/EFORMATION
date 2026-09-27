import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/services/api'

/**
 * Course categories are per tenant (GET /courses/categories, managed in
 * Administration > Assignments > Categories). A course stores the category `code`
 * in courses.category; the code never changes, so renaming a category never
 * detaches its courses.
 *
 * Label rule: an admin-chosen `name` wins; otherwise a built-in code gets its
 * translated default label (`shared` namespace, courseCategories.<code>); an
 * unknown code (e.g. a course whose category was deleted elsewhere) shows as-is.
 */
export const DEFAULT_COURSE_CATEGORIES = [
  'technology',
  'management',
  'marketing',
  'finance',
  'hr',
  'soft-skills',
  'compliance',
  'other',
] as const

export interface CourseCategory {
  code: string
  name: string | null
  isDefault: boolean
  courseCount: number
}

// Older rows/seed data used a short code for the same category.
const LEGACY_ALIASES: Record<string, string> = {
  tech: 'technology',
}

const DEFAULT_GRADIENTS: Record<string, string> = {
  technology: 'from-blue-600 to-indigo-700',
  management: 'from-purple-600 to-pink-600',
  marketing: 'from-rose-500 to-orange-500',
  finance: 'from-emerald-600 to-teal-700',
  hr: 'from-violet-600 to-fuchsia-600',
  'soft-skills': 'from-teal-600 to-emerald-600',
  compliance: 'from-amber-600 to-red-600',
  other: 'from-slate-500 to-slate-700',
}

// Tenant-created categories get a stable colour derived from their code.
const CUSTOM_GRADIENTS = [
  'from-sky-600 to-cyan-700',
  'from-lime-600 to-green-700',
  'from-orange-500 to-amber-600',
  'from-indigo-500 to-blue-700',
  'from-pink-500 to-rose-600',
  'from-cyan-600 to-teal-700',
]

const EMPTY_GRADIENT = 'from-primary/90 to-primary/60'

function normalizeCode(code: string): string {
  const key = code.trim().toLowerCase()
  return LEGACY_ALIASES[key] ?? key
}

function isDefaultCode(code: string): boolean {
  return (DEFAULT_COURSE_CATEGORIES as readonly string[]).includes(code)
}

/** Tailwind gradient classes for a course thumbnail without an image. */
export function categoryGradient(code?: string | null): string {
  if (!code) return EMPTY_GRADIENT
  const key = normalizeCode(code)
  if (DEFAULT_GRADIENTS[key]) return DEFAULT_GRADIENTS[key]
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return CUSTOM_GRADIENTS[hash % CUSTOM_GRADIENTS.length]
}

/** The tenant's categories (shared cache with every page that lists or labels them). */
export function useCourseCategories() {
  return useQuery<CourseCategory[]>({
    queryKey: ['course-categories'],
    queryFn: () => api.courses.getCategories(),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Returns a function translating a category code into its label (see rule above).
 * An empty category gets the generic "Training" label.
 */
export function useCategoryLabel() {
  const { t } = useTranslation('shared')
  const { data: categories } = useCourseCategories()

  return useCallback(
    (code?: string | null) => {
      if (!code) return t('courseCategories.none')
      const key = normalizeCode(code)
      const category = categories?.find((c) => c.code === key)
      if (category?.name) return category.name
      return isDefaultCode(key) ? t(`courseCategories.${key}`) : code
    },
    [t, categories]
  )
}
