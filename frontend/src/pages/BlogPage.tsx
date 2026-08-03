import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageLoading } from '@/components/ui/loading'
import { getInitials, formatDate } from '@/lib/utils'
import {
  Newspaper,
  Search,
  Calendar,
  Eye,
  Heart,
  MessageSquare,
  BookmarkPlus,
  Plus,
  TrendingUp,
  Clock,
} from 'lucide-react'
import { api } from '@/services/api'

export default function BlogPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['blog-posts', { search, category: activeCategory }],
    queryFn: () => api.blog.getPosts({ search, category: activeCategory !== 'all' ? activeCategory : undefined }),
  })

  if (isLoading) {
    return <PageLoading />
  }

  const posts = data || [
    {
      id: '1',
      title: 'Les meilleures pratiques pour apprendre le Machine Learning en 2024',
      excerpt: 'Découvrez les stratégies les plus efficaces pour maîtriser le ML cette année...',
      content: '',
      author: {
        name: 'Marie Dupont',
        avatar: '/avatars/1.jpg',
        role: 'Data Scientist',
      },
      category: 'Machine Learning',
      tags: ['ML', 'IA', 'Python', 'Data Science'],
      publishedAt: new Date(),
      readTime: 8,
      views: 1250,
      likes: 89,
      comments: 23,
      featured: true,
      image: '/blog/ml-2024.jpg',
    },
    {
      id: '2',
      title: 'Guide complet: React 19 et les nouvelles fonctionnalités',
      excerpt: 'Tout ce que vous devez savoir sur la nouvelle version de React...',
      content: '',
      author: {
        name: 'Thomas Martin',
        avatar: '/avatars/2.jpg',
        role: 'Frontend Developer',
      },
      category: 'Développement',
      tags: ['React', 'JavaScript', 'Frontend'],
      publishedAt: new Date(Date.now() - 2 * 86400000),
      readTime: 12,
      views: 890,
      likes: 67,
      comments: 15,
      featured: false,
    },
    {
      id: '3',
      title: 'Comment réussir sa transition vers le management',
      excerpt: 'Les clés pour passer de développeur à manager avec succès...',
      content: '',
      author: {
        name: 'Sophie Laurent',
        avatar: '/avatars/3.jpg',
        role: 'Engineering Manager',
      },
      category: 'Carrière',
      tags: ['Management', 'Leadership', 'Carrière'],
      publishedAt: new Date(Date.now() - 5 * 86400000),
      readTime: 6,
      views: 567,
      likes: 45,
      comments: 8,
      featured: false,
    },
  ]

  const categories = [
    { id: 'all', name: 'Tous', count: 45 },
    { id: 'ml', name: 'Machine Learning', count: 12 },
    { id: 'dev', name: 'Développement', count: 18 },
    { id: 'career', name: 'Carrière', count: 8 },
    { id: 'tips', name: 'Conseils', count: 7 },
  ]

  const featuredPost = posts.find((p: any) => p.featured)
  const regularPosts = posts.filter((p: any) => !p.featured)
  const trendingPosts = [...posts].sort((a: any, b: any) => b.views - a.views).slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Blog Interne</h1>
          <p className="text-muted-foreground">
            Articles, actualités et partage de connaissances
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Écrire un article
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un article..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Featured Post */}
          {featuredPost && (
            <FeaturedPostCard post={featuredPost} />
          )}

          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.name} ({cat.count})
              </Button>
            ))}
          </div>

          {/* Posts Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {regularPosts.map((post: any) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Trending */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Tendances
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
                        {post.views} vues
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tags populaires</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {['React', 'Python', 'Machine Learning', 'TypeScript', 'DevOps', 'Leadership'].map(
                  (tag) => (
                    <Badge key={tag} variant="secondary" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">
                      {tag}
                    </Badge>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function FeaturedPostCard({ post }: { post: any }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-2">
        <div className="h-64 md:h-auto bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <Newspaper className="h-16 w-16 text-primary" />
        </div>
        <div className="p-6">
          <Badge className="mb-3">À la une</Badge>
          <Link to={`/blog/${post.id}`}>
            <h2 className="text-xl font-bold mb-2 hover:text-primary transition-colors">
              {post.title}
            </h2>
          </Link>
          <p className="text-muted-foreground mb-4 line-clamp-3">{post.excerpt}</p>
          
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src={post.author.avatar} />
              <AvatarFallback>{getInitials(post.author.name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">{post.author.name}</p>
              <p className="text-xs text-muted-foreground">{post.author.role}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(post.publishedAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {post.readTime} min
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function PostCard({ post }: { post: any }) {
  return (
    <Card className="overflow-hidden group hover:shadow-lg transition-shadow">
      <div className="h-40 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
        <Newspaper className="h-10 w-10 text-primary" />
      </div>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline">{post.category}</Badge>
          <span className="text-xs text-muted-foreground">{post.readTime} min</span>
        </div>
        <Link to={`/blog/${post.id}`}>
          <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
            {post.title}
          </CardTitle>
        </Link>
        <CardDescription className="line-clamp-2">{post.excerpt}</CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-6 w-6">
            <AvatarImage src={post.author.avatar} />
            <AvatarFallback>{getInitials(post.author.name)}</AvatarFallback>
          </Avatar>
          <span className="text-sm">{post.author.name}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDate(post.publishedAt)}
          </span>
        </div>
      </CardContent>
      <CardFooter className="pt-2 border-t">
        <div className="flex items-center gap-4 text-sm text-muted-foreground w-full">
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {post.views}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-4 w-4" />
            {post.likes}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            {post.comments}
          </span>
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8">
            <BookmarkPlus className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
