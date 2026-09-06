import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import {
  Search,
  BookOpen,
  Users,
  FileText,
  MessageSquare,
  Calendar,
  X,
  Clock,
  Star,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'

interface SearchResult {
  id: number
  type: 'course' | 'user' | 'blog' | 'chat' | 'live_session'
  title: string
  description: string
  url: string
  metadata: any
  score: number
}

export default function SearchPage() {
  const { t } = useTranslation('search')
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const type = searchParams.get('type') || 'all'
  
  const [searchInput, setSearchInput] = useState(query)

  const { data: results = [], isLoading, isFetching } = useQuery<SearchResult[]>({
    queryKey: ['search', query, type],
    queryFn: async () => {
      if (!query) return []
      const response = await api.get('/search', {
        params: { q: query, type: type === 'all' ? undefined : type },
      })
      return response.data.data || []
    },
    enabled: query.length > 0,
  })

  // Records this search so it can surface later in "Recent searches" -- fires
  // once per completed query/result-set, not on every keystroke or refetch.
  useEffect(() => {
    if (query.length > 0 && !isFetching) {
      api.post('/search/log', { query, resultCount: results.length }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isFetching])

  const { data: recentSearches = [] } = useQuery<{ query: string; searched_at: string }[]>({
    queryKey: ['search-recent'],
    queryFn: async () => {
      const response = await api.get('/search/recent')
      return response.data.data || []
    },
    enabled: !query,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchInput.trim()) {
      setSearchParams({ q: searchInput.trim(), type })
    }
  }

  const handleTypeChange = (newType: string) => {
    setSearchParams({ q: query, type: newType })
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearchParams({})
  }

  const getResultIcon = (resultType: string) => {
    switch (resultType) {
      case 'course':
        return <BookOpen className="h-5 w-5 text-blue-500" />
      case 'user':
        return <Users className="h-5 w-5 text-green-500" />
      case 'blog':
        return <FileText className="h-5 w-5 text-purple-500" />
      case 'chat':
        return <MessageSquare className="h-5 w-5 text-orange-500" />
      case 'live_session':
        return <Calendar className="h-5 w-5 text-red-500" />
      default:
        return <FileText className="h-5 w-5 text-gray-500" />
    }
  }

  const getResultTypeBadge = (resultType: string) => {
    const labels: Record<string, string> = {
      course: t('resultTypes.course'),
      user: t('resultTypes.user'),
      blog: t('resultTypes.blog'),
      chat: t('resultTypes.chat'),
      live_session: t('resultTypes.live_session'),
    }
    return labels[resultType] || resultType
  }

  const filteredResults = type === 'all' 
    ? results 
    : results.filter((r) => r.type === type)

  const resultCounts = {
    all: results.length,
    course: results.filter((r) => r.type === 'course').length,
    blog: results.filter((r) => r.type === 'blog').length,
    user: results.filter((r) => r.type === 'user').length,
    live_session: results.filter((r) => r.type === 'live_session').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('placeholder')}
              className="pl-10 pr-10 h-12 text-lg"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <Button type="submit" size="lg" disabled={!searchInput.trim()}>
            {t('searchButton')}
          </Button>
        </div>
      </form>

      {/* Results */}
      {query && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {isFetching ? t('searching') : t('resultsCount', { count: results.length, query })}
            </p>
          </div>

          <Tabs value={type} onValueChange={handleTypeChange}>
            <TabsList>
              <TabsTrigger value="all">
                {t('tabs.all', { count: resultCounts.all })}
              </TabsTrigger>
              <TabsTrigger value="course">
                {t('tabs.course', { count: resultCounts.course })}
              </TabsTrigger>
              <TabsTrigger value="blog">
                {t('tabs.blog', { count: resultCounts.blog })}
              </TabsTrigger>
              <TabsTrigger value="user">
                {t('tabs.user', { count: resultCounts.user })}
              </TabsTrigger>
              <TabsTrigger value="live_session">
                {t('tabs.liveSession', { count: resultCounts.live_session })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value={type} className="mt-6">
              {isLoading ? (
                <PageLoading />
              ) : filteredResults.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">{t('noResults.title')}</h3>
                    <p className="text-muted-foreground">
                      {t('noResults.description')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {filteredResults.map((result) => (
                    <Link key={`${result.type}-${result.id}`} to={result.url}>
                      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              {getResultIcon(result.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="text-xs">
                                      {getResultTypeBadge(result.type)}
                                    </Badge>
                                    {result.score >= 0.9 && (
                                      <Badge className="bg-yellow-500 text-xs">
                                        <Star className="h-3 w-3 mr-1" />
                                        {t('bestMatch')}
                                      </Badge>
                                    )}
                                  </div>
                                  <h3 className="font-medium">{result.title}</h3>
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                    {result.description}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Metadata */}
                              {result.metadata && (
                                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                                  {result.type === 'course' && (
                                    <>
                                      <span>{result.metadata.instructor}</span>
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {result.metadata.duration}h
                                      </span>
                                      <Badge variant="secondary" className="text-xs">
                                        {result.metadata.level}
                                      </Badge>
                                    </>
                                  )}
                                  {result.type === 'blog' && (
                                    <>
                                      <span>{result.metadata.author}</span>
                                      <span>{formatDate(result.metadata.date)}</span>
                                    </>
                                  )}
                                  {result.type === 'user' && (
                                    <>
                                      <Badge variant="secondary" className="text-xs">
                                        {result.metadata.role}
                                      </Badge>
                                      {result.metadata.department && (
                                        <span>{result.metadata.department}</span>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Popular searches (when no query) */}
      {!query && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('recentSearches.title')}</CardTitle>
              <CardDescription>{t('recentSearches.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {recentSearches.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('recentSearches.none')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set(recentSearches.map((s) => s.query))).slice(0, 10).map((tag) => (
                    <Button
                      key={tag}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSearchInput(tag)
                        setSearchParams({ q: tag, type: 'all' })
                      }}
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('browseByCategory.title')}</CardTitle>
              <CardDescription>{t('browseByCategory.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link to="/courses?category=development">
                  <div className="p-4 rounded-lg border hover:border-primary transition-colors text-center">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                    <p className="font-medium">{t('browseByCategory.development')}</p>
                  </div>
                </Link>
                <Link to="/courses?category=design">
                  <div className="p-4 rounded-lg border hover:border-primary transition-colors text-center">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                    <p className="font-medium">{t('browseByCategory.design')}</p>
                  </div>
                </Link>
                <Link to="/courses?category=management">
                  <div className="p-4 rounded-lg border hover:border-primary transition-colors text-center">
                    <Users className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="font-medium">{t('browseByCategory.management')}</p>
                  </div>
                </Link>
                <Link to="/courses?category=marketing">
                  <div className="p-4 rounded-lg border hover:border-primary transition-colors text-center">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                    <p className="font-medium">{t('browseByCategory.marketing')}</p>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
