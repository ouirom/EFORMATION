import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { getInitials, formatDate } from '@/lib/utils'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  Play,
  ExternalLink,
  Video,
} from 'lucide-react'
import { api } from '@/services/api'
import { LiveKitRoomEmbed } from '@/components/LiveKitRoomEmbed'
import { useAuth } from '@/contexts/AuthContext'

const MANAGER_ROLES = ['super_admin', 'admin', 'director', 'manager']

const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  live: 'bg-red-100 text-red-800',
  ended: 'bg-gray-100 text-gray-800',
}

export default function LiveSessionDetailPage() {
  const { t } = useTranslation('live')
  const { t: tCommon } = useTranslation('common')
  const statusLabels: Record<string, string> = {
    scheduled: t('list.status.scheduled'),
    live: t('list.status.live'),
    ended: t('list.status.ended'),
  }
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [hasJoined, setHasJoined] = useState(false)
  const [inEmbeddedRoom, setInEmbeddedRoom] = useState(false)

  const { data: session, isLoading } = useQuery({
    queryKey: ['live-session', id],
    queryFn: () => api.liveSessions.get(Number(id)),
    enabled: !!id,
  })

  const joinMutation = useMutation({
    mutationFn: () => api.liveSessions.join(Number(id)),
    onSuccess: () => {
      setHasJoined(true)
      queryClient.invalidateQueries({ queryKey: ['live-session', id] })
      queryClient.invalidateQueries({ queryKey: ['live-sessions'] })
      toast({
        title: tCommon('status.success'),
        description:
          session?.status === 'live' ? t('detail.youJoined') : t('detail.enrollmentConfirmed'),
      })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('detail.enrollErrorDescription'), variant: 'destructive' })
    },
  })

  if (isLoading) {
    return <PageLoading />
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">{t('detail.notFound2')}</h2>
        <Link to="/live" className="text-primary hover:underline">
          {t('detail.backToSessions')}
        </Link>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${inEmbeddedRoom ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <Link to="/live" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t('detail.backToSessions')}
      </Link>

      <Card>
        <div className="h-40 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative rounded-t-xl">
          <Video className="h-12 w-12 text-primary" />
          <Badge className={`absolute top-4 right-4 ${statusColors[session.status]}`}>
            {session.status === 'live' && (
              <div className="h-2 w-2 rounded-full bg-red-500 mr-1 animate-pulse" />
            )}
            {statusLabels[session.status]}
          </Badge>
        </div>
        <CardHeader>
          <CardTitle className="text-2xl">{session.title}</CardTitle>
          {session.description && (
            <p className="text-muted-foreground mt-2">{session.description}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback>{getInitials(session.instructorName || t('detail.defaultInstructorLabel'))}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{session.instructorName || t('detail.noInstructorAssigned')}</p>
              <p className="text-xs text-muted-foreground">{t('detail.defaultInstructorLabel')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {session.scheduledAt ? formatDate(session.scheduledAt) : t('detail.notScheduled')}
            </span>
            {session.duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {session.duration} min
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {t('detail.participantsCountWithMax', { count: session.currentParticipants, max: session.maxParticipants ? `/${session.maxParticipants}` : '' })}
            </span>
          </div>

          {session.participants && session.participants.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">{t('detail.participantsLabel')}</p>
              <div className="flex flex-wrap gap-2">
                {session.participants.map((p: any) => (
                  <Badge key={p.user_id} variant="outline" className="font-normal">
                    {p.display_name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t">
            {session.status === 'ended' ? (
              session.recordingUrl ? (
                <a href={session.recordingUrl} target="_blank" rel="noopener noreferrer">
                  <Button>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t('detail.watchRecording')}
                  </Button>
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('detail.sessionEnded')}
                </p>
              )
            ) : session.status === 'live' ? (
              session.meetingUrl ? (
                <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer">
                  <Button onClick={() => !hasJoined && joinMutation.mutate()}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t('detail.openMeeting')}
                  </Button>
                </a>
              ) : inEmbeddedRoom ? (
                <LiveKitRoomEmbed
                  sessionId={Number(id)}
                  onLeave={() => setInEmbeddedRoom(false)}
                  isOrganizer={!!user && (user.id === session.instructorId || MANAGER_ROLES.includes(user.role))}
                />
              ) : (
                <Button onClick={() => setInEmbeddedRoom(true)}>
                  <Play className="h-4 w-4 mr-2" />
                  {t('detail.join')}
                </Button>
              )
            ) : hasJoined ? (
              <p className="text-sm text-muted-foreground">
                {t('detail.enrolledWaiting', { date: formatDate(session.scheduledAt) })}
              </p>
            ) : (
              <Button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
                {joinMutation.isPending ? t('detail.enrolling') : t('detail.enroll')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
