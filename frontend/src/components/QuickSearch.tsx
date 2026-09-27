import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { NavItem, adminSectionNavItems, userSpaceNavItems } from '@/lib/navigation'
import { useTenantFeatures } from '@/lib/tenantSettings'
import {
  Search,
  BookOpen,
  FileText,
  Users,
  Newspaper,
  Award,
  Video,
  HelpCircle,
  Loader2,
} from 'lucide-react'

interface SearchResult {
  id: number
  type: string
  title: string
  description: string
  url: string
  metadata: any
  score: number
}

interface PageMatch {
  item: NavItem
  label: string
  section: 'user' | 'admin'
}

const typeIcons: Record<string, React.ComponentType<any>> = {
  course: BookOpen,
  lesson: FileText,
  quiz: HelpCircle,
  blog: Newspaper,
  badge: Award,
  live_session: Video,
  user: Users,
}

const MAX_PAGE_MATCHES = 6

/** Lowercase, accent-free text for matching ("Paramètres" ~ "parametres"). */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

export function QuickSearch() {
  const { t } = useTranslation('shared')
  const { t: tLayout } = useTranslation('layout')
  const { user } = useAuth()
  const { chat: chatEnabled, liveSessions: liveEnabled } = useTenantFeatures()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(input.trim()), 300)
    return () => clearTimeout(timer)
  }, [input])

  const { data: results = [], isFetching } = useQuery<SearchResult[]>({
    queryKey: ['quick-search', debouncedQuery],
    queryFn: async () => {
      const response = await api.get('/search', { params: { q: debouncedQuery, limit: 8 } })
      return response.data.data || []
    },
    enabled: debouncedQuery.length >= 2,
  })

  // Navigation tabs the user can reach, matched instantly (no request, from the first letter).
  const pageMatches = useMemo<PageMatch[]>(() => {
    const needle = fold(input.trim())
    if (!needle) return []
    const modules = { chat: chatEnabled, liveSessions: liveEnabled }
    const candidates: PageMatch[] = [
      ...userSpaceNavItems(user?.role, modules).map((item) => ({ item, label: tLayout(item.labelKey), section: 'user' as const })),
      ...adminSectionNavItems(user?.role, modules).map((item) => ({ item, label: tLayout(item.labelKey), section: 'admin' as const })),
    ]
    return candidates
      .filter((c) => fold(c.label).includes(needle))
      // Labels starting with the query first ("rap" -> "Rapports" before "Paramètres de rappel").
      .sort((a, b) => Number(!fold(a.label).startsWith(needle)) - Number(!fold(b.label).startsWith(needle)))
      .slice(0, MAX_PAGE_MATCHES)
  }, [input, user?.role, tLayout, chatEnabled, liveEnabled])

  const showContent = debouncedQuery.length >= 2
  const contentResults = showContent && !isFetching ? results : []
  const optionCount = pageMatches.length + contentResults.length

  useEffect(() => setHighlighted(-1), [input])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Ctrl+K / Cmd+K jumps to the search box from anywhere.
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setIsOpen(true)
      }
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  const reset = () => {
    setIsOpen(false)
    setInput('')
    setHighlighted(-1)
  }

  const goTo = (url: string) => {
    navigate(url)
    reset()
    inputRef.current?.blur()
  }

  const goToFullSearch = () => {
    if (input.trim()) {
      navigate(`/search?q=${encodeURIComponent(input.trim())}`)
      reset()
    }
  }

  const openHighlighted = () => {
    if (highlighted < 0) return false
    if (highlighted < pageMatches.length) goTo(pageMatches[highlighted].item.path)
    else goTo(contentResults[highlighted - pageMatches.length].url)
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!openHighlighted()) goToFullSearch()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && optionCount > 0) {
      e.preventDefault()
      setIsOpen(true)
      setHighlighted((h) => (h + 1) % optionCount)
    } else if (e.key === 'ArrowUp' && optionCount > 0) {
      e.preventDefault()
      setHighlighted((h) => (h <= 0 ? optionCount - 1 : h - 1))
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }

  const showDropdown = isOpen && input.trim().length > 0
  const optionId = (index: number) => `quick-search-option-${index}`

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit} role="search">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            placeholder={t('quickSearch.placeholder')}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls="quick-search-listbox"
            aria-activedescendant={highlighted >= 0 ? optionId(highlighted) : undefined}
            aria-autocomplete="list"
            className="w-full rounded-md border border-input bg-background pl-10 pr-16 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </div>
      </form>

      {showDropdown && (
        <div
          id="quick-search-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 max-h-[28rem] overflow-y-auto rounded-md border bg-popover shadow-lg z-50"
        >
          {pageMatches.length > 0 && (
            <div className="py-1">
              <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('quickSearch.pagesGroup')}
              </p>
              {pageMatches.map(({ item, label, section }, index) => (
                <button
                  key={item.path}
                  id={optionId(index)}
                  role="option"
                  aria-selected={highlighted === index}
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => goTo(item.path)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${highlighted === index ? 'bg-muted' : 'hover:bg-muted'}`}
                >
                  <item.icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1 truncate font-medium">{label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {section === 'admin' ? t('quickSearch.sectionAdmin') : t('quickSearch.sectionUser')}
                  </span>
                </button>
              ))}
            </div>
          )}

          {showContent && (
            <div className={pageMatches.length > 0 ? 'border-t' : undefined}>
              {isFetching ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('quickSearch.searching')}
                </div>
              ) : contentResults.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t('quickSearch.noResults', { query: debouncedQuery })}
                </div>
              ) : (
                <div className="py-1">
                  {pageMatches.length > 0 && (
                    <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('quickSearch.contentGroup')}
                    </p>
                  )}
                  {contentResults.map((result, i) => {
                    const index = pageMatches.length + i
                    const Icon = typeIcons[result.type] || FileText
                    return (
                      <button
                        key={`${result.type}-${result.id}`}
                        id={optionId(index)}
                        role="option"
                        aria-selected={highlighted === index}
                        type="button"
                        onMouseEnter={() => setHighlighted(index)}
                        onClick={() => goTo(result.url)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${highlighted === index ? 'bg-muted' : 'hover:bg-muted'}`}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate font-medium">{result.title}</span>
                          {result.description && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {result.description}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t(`quickSearch.types.${result.type}`, { defaultValue: result.type })}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={goToFullSearch}
                className="w-full border-t px-3 py-2 text-center text-sm text-primary hover:bg-muted"
              >
                {t('quickSearch.viewAllResults', { query: debouncedQuery })}
              </button>
            </div>
          )}

          {!showContent && pageMatches.length === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {t('quickSearch.keepTyping')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
