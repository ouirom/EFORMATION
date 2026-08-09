import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import { getInitials, formatDate } from '@/lib/utils'
import {
  Video,
  Calendar,
  Clock,
  Users,
  Play,
  Plus,
  Search,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { api } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'

const CAN_CREATE_SESSION_ROLES = ['super_admin', 'admin', 'director', 'manager']

export default function LiveSessionsPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['live-sessions'],
    queryFn: () => api.liveSessions.list(),
  })

  if (isLoading) {
    return <PageLoading />
  }

  const sessionsList = sessions || []

  const upcomingSessions = sessionsList.filter((s: any) => s.status === 'scheduled')
  const liveSessions = sessionsList.filter((s: any) => s.status === 'live')
  const pastSessions = sessionsList.filter((s: any) => s.status === 'ended')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Sessions Live</h1>
          <p className="text-muted-foreground">
            Participez à des sessions interactives en direct
          </p>
        </div>
        {user && CAN_CREATE_SESSION_ROLES.includes(user.role) && (
          <Link to="/admin/live-sessions">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Créer une session
            </Button>
          </Link>
        )}
      </div>

      {/* Live Now Banner */}
      {liveSessions.length > 0 && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="font-semibold text-red-600 dark:text-red-400">EN DIRECT</span>
            </div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold">{liveSessions[0].title}</h3>
                <p className="text-sm text-muted-foreground">
                  {liveSessions[0].currentParticipants} participants
                </p>
              </div>
              <Link to={`/live/${liveSessions[0].id}`}>
                <Button>
                  <Play className="h-4 w-4 mr-2" />
                  Rejoindre maintenant
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher une session..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            À venir ({upcomingSessions.length})
          </TabsTrigger>
          <TabsTrigger value="live" className="flex items-center gap-2">
            En direct
            {liveSessions.length > 0 && (
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="recordings">
            Enregistrements ({pastSessions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {upcomingSessions.map((session: any) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
          {upcomingSessions.length === 0 && (
            <EmptyState
              icon={Calendar}
              title="Aucune session programmée"
              description="Les prochaines sessions apparaîtront ici"
            />
          )}
        </TabsContent>

        <TabsContent value="live" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {liveSessions.map((session: any) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
          {liveSessions.length === 0 && (
            <EmptyState
              icon={Video}
              title="Aucune session en direct"
              description="Consultez les sessions à venir"
            />
          )}
        </TabsContent>

        <TabsContent value="recordings" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pastSessions.map((session: any) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
          {pastSessions.length === 0 && (
            <EmptyState
              icon={Play}
              title="Aucun enregistrement"
              description="Les sessions passées seront disponibles ici"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SessionCard({ session }: { session: any }) {
  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-800',
    live: 'bg-red-100 text-red-800',
    ended: 'bg-gray-100 text-gray-800',
  }

  const statusLabels: Record<string, string> = {
    scheduled: 'Programmée',
    live: 'En direct',
    ended: 'Terminée',
  }

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="h-32 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative">
        <Video className="h-10 w-10 text-primary" />
        <Badge
          className={`absolute top-3 right-3 ${statusColors[session.status]}`}
        >
          {session.status === 'live' && (
            <div className="h-2 w-2 rounded-full bg-red-500 mr-1 animate-pulse" />
          )}
          {statusLabels[session.status]}
        </Badge>
      </div>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg line-clamp-1">{session.title}</CardTitle>
        <CardDescription className="line-clamp-2">
          {session.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback>
              {getInitials(session.instructorName || 'Formateur')}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{session.instructorName || 'Formateur non assigné'}</p>
            <p className="text-xs text-muted-foreground">Formateur</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {session.scheduledAt ? formatDate(session.scheduledAt) : 'Non planifiée'}
          </span>
          {session.duration && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {session.duration} min
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {session.currentParticipants}{session.maxParticipants ? `/${session.maxParticipants}` : ''}
          </span>
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        <Link to={`/live/${session.id}`} className="w-full">
          <Button className="w-full" variant={session.status === 'live' ? 'default' : 'outline'}>
            {session.status === 'live' && <Play className="h-4 w-4 mr-2" />}
            {session.status === 'live'
              ? 'Rejoindre'
              : session.status === 'ended'
              ? 'Voir l\'enregistrement'
              : 'S\'inscrire'}
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<any>
  title: string
  description: string
}) {
  return (
    <div className="text-center py-12">
      <Icon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}
