import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
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

const typeIcons: Record<string, React.ComponentType<any>> = {
  course: BookOpen,
  lesson: FileText,
  quiz: HelpCircle,
  blog: Newspaper,
  badge: Award,
  live_session: Video,
  user: Users,
}

export function QuickSearch() {
  const { t } = useTranslation('shared')
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const goToResult = (result: SearchResult) => {
    navigate(result.url)
    setIsOpen(false)
    setInput('')
  }

  const goToFullSearch = () => {
    if (input.trim()) {
      navigate(`/search?q=${encodeURIComponent(input.trim())}`)
      setIsOpen(false)
      setInput('')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    goToFullSearch()
  }

  const showDropdown = isOpen && debouncedQuery.length >= 2

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder={t('quickSearch.placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsOpen(true)}
            className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </form>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 max-h-96 overflow-y-auto rounded-md border bg-popover shadow-lg z-50">
          {isFetching ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('quickSearch.searching')}
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t('quickSearch.noResults', { query: debouncedQuery })}
            </div>
          ) : (
            <>
              <ul className="py-1">
                {results.map((result) => {
                  const Icon = typeIcons[result.type] || FileText
                  return (
                    <li key={`${result.type}-${result.id}`}>
                      <button
                        type="button"
                        onClick={() => goToResult(result)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
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
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={goToFullSearch}
                className="w-full border-t px-3 py-2 text-center text-sm text-primary hover:bg-muted"
              >
                {t('quickSearch.viewAllResults', { query: debouncedQuery })}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
