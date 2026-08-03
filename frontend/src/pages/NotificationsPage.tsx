import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import {
  Bell,
  CheckCheck,
  Trash2,
  BookOpen,
  Award,
  MessageSquare,
  Calendar,
  AlertCircle,
  Info,
  Settings,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'
import { Link } from 'react-router-dom'

interface Notification {
  id: number
  type: string
  title: string
  body: string
  data: any
  isRead: boolean
  createdAt: string
}

export default function NotificationsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get('/notifications')
      return response.data.data || []
    },
  })

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      await api.put(`/notifications/${notificationId}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.put('/notifications/read-all')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast({ title: 'Succès', description: 'Toutes les notifications ont été marquées comme lues' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      await api.delete(`/notifications/${notificationId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast({ title: 'Succès', description: 'Notification supprimée' })
    },
  })

  const filteredNotifications = notifications.filter((n: Notification) =>
    filter === 'all' ? true : !n.isRead
  )

  const unreadCount = notifications.filter((n: Notification) => !n.isRead).length

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'course_assigned':
      case 'course_completed':
        return <BookOpen className="h-5 w-5 text-blue-500" />
      case 'badge_earned':
        return <Award className="h-5 w-5 text-yellow-500" />
      case 'message_received':
        return <MessageSquare className="h-5 w-5 text-green-500" />
      case 'live_session_reminder':
        return <Calendar className="h-5 w-5 text-purple-500" />
      case 'alert':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      default:
        return <Info className="h-5 w-5 text-gray-500" />
    }
  }

  const getNotificationLink = (notification: Notification) => {
    if (notification.data?.courseId) {
      return `/courses/${notification.data.courseId}`
    }
    if (notification.data?.conversationId) {
      return `/chat/${notification.data.conversationId}`
    }
    if (notification.data?.sessionId) {
      return `/live/${notification.data.sessionId}`
    }
    return null
  }

  if (isLoading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} non lue(s)` : 'Toutes vos notifications'}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Tout marquer comme lu
            </Button>
          )}
          <Link to="/settings/notifications">
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Préférences
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')}>
        <TabsList>
          <TabsTrigger value="all">
            Toutes ({notifications.length})
          </TabsTrigger>
          <TabsTrigger value="unread">
            Non lues ({unreadCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="mt-4">
          {filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Aucune notification</h3>
                <p className="text-muted-foreground">
                  {filter === 'unread'
                    ? 'Vous avez lu toutes vos notifications'
                    : 'Vous n\'avez pas encore de notifications'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredNotifications.map((notification: Notification) => {
                const link = getNotificationLink(notification)
                const content = (
                  <Card
                    className={`transition-colors cursor-pointer hover:bg-muted/50 ${
                      !notification.isRead ? 'border-l-4 border-l-primary bg-primary/5' : ''
                    }`}
                    onClick={() => {
                      if (!notification.isRead) {
                        markReadMutation.mutate(notification.id)
                      }
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-medium">{notification.title}</h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                {notification.body}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!notification.isRead && (
                                <Badge variant="default" className="bg-primary">
                                  Nouveau
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteMutation.mutate(notification.id)
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatDate(notification.createdAt)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )

                return link ? (
                  <Link key={notification.id} to={link}>
                    {content}
                  </Link>
                ) : (
                  <div key={notification.id}>{content}</div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
