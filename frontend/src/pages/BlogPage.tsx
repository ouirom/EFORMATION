import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import {
  Newspaper,
  Search,
  Calendar,
  Eye,
  MessageSquare,
  Plus,
  TrendingUp,
  Clock,
} from 'lucide-react'
import { api } from '@/services/api'

const BLOG_MANAGER_ROLES = ['super_admin', 'admin', 'director', 'manager']
const WORDS_PER_MINUTE = 200

function estimateReadTime(body?: string): number {
  if (!body) return 1
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

function excerptOf(body?: string, length = 160): string {
  if (!body) return ''
  const plain = body.replace(/\s+/g, ' ').trim()
  return plain.length > length ? `${plain.slice(0, length)}...` : plain
}

export default function BlogPage() {
  const { t } = useTranslation('blog')
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeTag, setActiveTag] = useState<number | null>(null)
  const [page, setPage] = useState(1)

  const { data: categories = [] } = useQuery({
    queryKey: ['blog-categories'],
    queryFn: () => api.blog.getCategories(),
  })

  const { data: tags = [] } = useQuery({
    queryKey: ['blog-tags'],
    queryFn: () => api.blog.getTags(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['blog-posts', { search, activeCategory, activeTag, page }],
    queryFn: () =>
      api.blog.getPosts({
        search: search || undefined,
        categoryId: activeCategory !== 'all' ? activeCategory : undefined,
        tagId: activeTag || undefined,
        page,
      }),
  })

  if (isLoading) {
    return <PageLoading />
  }

  const posts: any[] = data?.data || []
  const meta = data?.meta as { page: number; totalPages: number; total: number } | undefined
  const canWrite = BLOG_MANAGER_ROLES.includes(user?.role || '')

  const featuredPost = page === 1 ? posts[0] : undefined
  const regularPosts = featuredPost ? posts.slice(1) : posts
  const trendingPosts = [...posts].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 5)

  const categoryTabs = [
    { id: 'all', name: t('allCategories'), count: undefined as number | undefined },
    ...categories.map((c: any) => ({ id: String(c.id), name: c.name, count: c.post_count })),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        {canWrite && (
          <Link to="/admin/blog">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t('writePost')}
            </Button>
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('searchPlaceholder')}
          className="pl-10"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Featured Post */}
          {featuredPost && (
            <FeaturedPostCard post={featuredPost} t={t} />
          )}

          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categoryTabs.map((cat) => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setActiveCategory(cat.id)
                  setPage(1)
                }}
              >
                {cat.name}{cat.count !== undefined ? ` (${cat.count})` : ''}
              </Button>
            ))}
          </div>

          {/* Posts Grid */}
          {regularPosts.length === 0 && !featuredPost ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Newspaper className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t('noPosts')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {regularPosts.map((post: any) => (
                <PostCard key={post.id} post={post} t={t} />
              ))}
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('pagination.pageOf', { page: meta.page, totalPages: meta.totalPages })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('pagination.previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                >
                  {t('pagination.next')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Trending */}
          {trendingPosts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  {t('trending')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {trendingPosts.map((post: any, index: number) => (
                  <Link key={post.id} to={`/blog/${post.id}`}>
                    <div className="flex gap-3 group">
                      <span className="text-2xl font-bold text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <p className="font-medium text-sm group-hover:text-primary transition-colors line-clamp-2">
                          {post.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('viewsCount', { count: post.view_count || 0 })}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('popularTags')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag: any) => (
                    <Badge
                      key={tag.id}
                      variant={activeTag === tag.id ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => {
                        setActiveTag(activeTag === tag.id ? null : tag.id)
                        setPage(1)
                      }}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function FeaturedPostCard({ post, t }: { post: any; t: (key: string, opts?: any) => string }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-2">
        <div className="h-64 md:h-auto bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <Newspaper className="h-16 w-16 text-primary" />
        </div>
        <div className="p-6">
          <Badge className="mb-3">{t('featured')}</Badge>
          <Link to={`/blog/${post.id}`}>
            <h2 className="text-xl font-bold mb-2 hover:text-primary transition-colors">
              {post.title}
            </h2>
          </Link>
          <p className="text-muted-foreground mb-4 line-clamp-3">{excerptOf(post.body)}</p>

          <div className="flex items-center gap-3 mb-4">
            <p className="text-sm font-medium">{post.author_name || t('anonymousAuthor')}</p>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(post.published_at || post.created_at)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {t('readTimeMinutes', { count: estimateReadTime(post.body) })}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function PostCard({ post, t }: { post: any; t: (key: string, opts?: any) => string }) {
  return (
    <Card className="overflow-hidden group hover:shadow-lg transition-shadow">
      <div className="h-40 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
        <Newspaper className="h-10 w-10 text-primary" />
      </div>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 mb-2">
          {post.category_name && <Badge variant="outline">{post.category_name}</Badge>}
          <span className="text-xs text-muted-foreground">{t('readTimeMinutes', { count: estimateReadTime(post.body) })}</span>
        </div>
        <Link to={`/blog/${post.id}`}>
          <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
            {post.title}
          </CardTitle>
        </Link>
        <CardDescription className="line-clamp-2">{excerptOf(post.body)}</CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="flex items-center gap-3">
          <span className="text-sm">{post.author_name || t('anonymousAuthor')}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDate(post.published_at || post.created_at)}
          </span>
        </div>
      </CardContent>
      <CardFooter className="pt-2 border-t">
        <div className="flex items-center gap-4 text-sm text-muted-foreground w-full">
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {post.view_count || 0}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            {post.comment_count || 0}
          </span>
        </div>
      </CardFooter>
    </Card>
  )
}
