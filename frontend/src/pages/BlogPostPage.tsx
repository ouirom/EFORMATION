import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { formatDate, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Newspaper, Calendar, Eye, MessageSquare, Send, Trash2 } from 'lucide-react'
import { api } from '@/services/api'

const BLOG_MANAGER_ROLES = ['super_admin', 'admin', 'director', 'manager']

export default function BlogPostPage() {
  const { t } = useTranslation('blog')
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const postId = id ? parseInt(id, 10) : null
  const [commentDraft, setCommentDraft] = useState('')

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['blog-post', postId],
    queryFn: () => api.blog.getPost(postId!),
    enabled: !!postId,
    retry: false,
  })

  const { data: comments = [] } = useQuery({
    queryKey: ['blog-comments', postId],
    queryFn: () => api.blog.getComments(postId!),
    enabled: !!postId,
  })

  const addCommentMutation = useMutation({
    mutationFn: (body: string) => api.blog.addComment(postId!, body),
    onSuccess: () => {
      setCommentDraft('')
      queryClient.invalidateQueries({ queryKey: ['blog-comments', postId] })
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) => api.blog.deleteComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-comments', postId] })
    },
  })

  if (isLoading) {
    return <PageLoading />
  }

  if (error || !post) {
    return (
      <div className="text-center py-12">
        <Newspaper className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t('postNotFoundTitle')}</h2>
        <p className="text-muted-foreground mb-4">{t('postNotFoundHint')}</p>
        <Link to="/blog">
          <Button>{t('backToBlog')}</Button>
        </Link>
      </div>
    )
  }

  const canModerate = BLOG_MANAGER_ROLES.includes(user?.role || '')

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to="/blog">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('backToBlog')}
        </Button>
      </Link>

      <div className="space-y-3">
        {post.status !== 'published' && (
          <Badge variant="secondary">{t(`status.${post.status}`)}</Badge>
        )}
        <h1 className="text-3xl font-bold">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>{post.author_name || t('anonymousAuthor')}</span>
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {formatDate(post.published_at || post.created_at)}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {post.view_count || 0}
          </span>
          {post.category_name && <Badge variant="outline">{post.category_name}</Badge>}
        </div>
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag: any) => (
              <Badge key={tag.id} variant="secondary">{tag.name}</Badge>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="prose prose-sm max-w-none whitespace-pre-wrap">{post.body}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {t('commentsTitle', { count: comments.length })}
          </h3>

          <div className="flex items-start gap-2">
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder={t('commentPlaceholder')}
              className="w-full h-20 p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button
              size="icon"
              onClick={() => commentDraft.trim() && addCommentMutation.mutate(commentDraft.trim())}
              disabled={addCommentMutation.isPending || !commentDraft.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {comments.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('noComments')}</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment: any) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  canModerate={canModerate}
                  userId={user?.id}
                  onDelete={(commentId) => deleteCommentMutation.mutate(commentId)}
                  t={t}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CommentItem({
  comment,
  canModerate,
  userId,
  onDelete,
  t,
  nested = false,
}: {
  comment: any
  canModerate: boolean
  userId?: number
  onDelete: (commentId: number) => void
  t: (key: string) => string
  nested?: boolean
}) {
  return (
    <div className={nested ? 'ml-8' : ''}>
      <div className="flex items-start justify-between gap-2 p-3 border rounded-lg">
        <div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{comment.author_name || t('anonymousAuthor')}</span>
            <span className="text-muted-foreground text-xs">{formatDateTime(comment.created_at)}</span>
          </div>
          <p className="text-sm mt-1 whitespace-pre-wrap">{comment.body}</p>
        </div>
        {(comment.user_id === userId || canModerate) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onDelete(comment.id)}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>
      {comment.replies?.length > 0 && (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply: any) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              canModerate={canModerate}
              userId={userId}
              onDelete={onDelete}
              t={t}
              nested
            />
          ))}
        </div>
      )}
    </div>
  )
}
