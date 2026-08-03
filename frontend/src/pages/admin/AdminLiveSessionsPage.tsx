import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import {
  Video,
  Plus,
  Search,
  Edit,
  Trash2,
  Calendar,
  Clock,
  Users,
  Play,
  Copy,
  ExternalLink,
  User,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'

interface LiveSession {
  id: number
  title: string
  description: string
  instructorId: number
  instructorName?: string
  scheduledAt: string
  duration: number
  meetingUrl: string
  maxParticipants: number
  currentParticipants: number
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'
  recordingUrl: string | null
  courseId?: number
  courseName?: string
}

export default function AdminLiveSessionsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    instructorId: '',
    scheduledAt: '',
    duration: 60,
    meetingUrl: '',
    maxParticipants: 100,
    courseId: '',
  })

  const { data: sessions = [], isLoading } = useQuery<LiveSession[]>({
    queryKey: ['admin-live-sessions'],
    queryFn: async () => {
      const response = await api.get('/live-sessions')
      return response.data.data || []
    },
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users')
      return response.data.data || []
    },
  })

  const { data: courses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const response = await api.get('/courses')
      return response.data.data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.post('/live-sessions', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-live-sessions'] })
      setIsCreateDialogOpen(false)
      resetForm()
      toast({ title: 'Succès', description: 'Session créée avec succès' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la création', variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await api.put(`/live-sessions/${id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-live-sessions'] })
      setEditingSession(null)
      resetForm()
      toast({ title: 'Succès', description: 'Session mise à jour' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la mise à jour', variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/live-sessions/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-live-sessions'] })
      toast({ title: 'Succès', description: 'Session supprimée' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la suppression', variant: 'destructive' })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.put(`/live-sessions/${id}/cancel`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-live-sessions'] })
      toast({ title: 'Succès', description: 'Session annulée' })
    },
  })

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      instructorId: '',
      scheduledAt: '',
      duration: 60,
      meetingUrl: '',
      maxParticipants: 100,
      courseId: '',
    })
  }

  const handleEdit = (session: LiveSession) => {
    setEditingSession(session)
    setFormData({
      title: session.title,
      description: session.description,
      instructorId: session.instructorId.toString(),
      scheduledAt: new Date(session.scheduledAt).toISOString().slice(0, 16),
      duration: session.duration,
      meetingUrl: session.meetingUrl,
      maxParticipants: session.maxParticipants,
      courseId: session.courseId?.toString() || '',
    })
  }

  const handleSubmit = () => {
    const data = {
      ...formData,
      instructorId: parseInt(formData.instructorId),
      courseId: formData.courseId ? parseInt(formData.courseId) : null,
    }
    if (editingSession) {
      updateMutation.mutate({ id: editingSession.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url)
    toast({ title: 'Lien copié', description: 'Le lien a été copié dans le presse-papier' })
  }

  const filteredSessions = sessions
    .filter((session) =>
      session.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.instructorName?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter((session) => statusFilter === 'all' || session.status === statusFilter)

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      scheduled: { variant: 'secondary', label: 'Planifiée' },
      live: { variant: 'default', label: 'En cours' },
      completed: { variant: 'outline', label: 'Terminée' },
      cancelled: { variant: 'destructive', label: 'Annulée' },
    }
    const style = styles[status] || { variant: 'outline', label: status }
    return <Badge variant={style.variant}>{style.label}</Badge>
  }

  if (isLoading) {
    return <PageLoading />
  }

  const scheduledCount = sessions.filter((s) => s.status === 'scheduled').length
  const liveCount = sessions.filter((s) => s.status === 'live').length
  const completedCount = sessions.filter((s) => s.status === 'completed').length

  const SessionForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Titre de la session</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Ex: Introduction à React - Session Live"
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Description de la session..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Instructeur</Label>
          <Select value={formData.instructorId} onValueChange={(v) => setFormData({ ...formData, instructorId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner un instructeur" />
            </SelectTrigger>
            <SelectContent>
              {users.filter((u: any) => u.role === 'instructor' || u.role === 'admin').map((user: any) => (
                <SelectItem key={user.id} value={user.id.toString()}>
                  {user.firstName} {user.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Cours associé (optionnel)</Label>
          <Select value={formData.courseId} onValueChange={(v) => setFormData({ ...formData, courseId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Aucun cours" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Aucun</SelectItem>
              {courses.map((course: any) => (
                <SelectItem key={course.id} value={course.id.toString()}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date et heure</Label>
          <Input
            type="datetime-local"
            value={formData.scheduledAt}
            onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Durée (minutes)</Label>
          <Input
            type="number"
            min={15}
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>URL de la réunion</Label>
          <Input
            value={formData.meetingUrl}
            onChange={(e) => setFormData({ ...formData, meetingUrl: e.target.value })}
            placeholder="https://meet.google.com/..."
          />
        </div>
        <div className="space-y-2">
          <Label>Participants max</Label>
          <Input
            type="number"
            min={1}
            value={formData.maxParticipants}
            onChange={(e) => setFormData({ ...formData, maxParticipants: parseInt(e.target.value) })}
          />
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sessions en direct</h1>
          <p className="text-muted-foreground">Gérez les sessions de formation en direct</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle session
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Créer une session</DialogTitle>
              <DialogDescription>
                Planifiez une nouvelle session de formation en direct
              </DialogDescription>
            </DialogHeader>
            <SessionForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Création...' : 'Créer la session'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Video className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sessions.length}</p>
                <p className="text-sm text-muted-foreground">Total sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{scheduledCount}</p>
                <p className="text-sm text-muted-foreground">Planifiées</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Play className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{liveCount}</p>
                <p className="text-sm text-muted-foreground">En cours</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Video className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedCount}</p>
                <p className="text-sm text-muted-foreground">Terminées</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher une session..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="scheduled">Planifiées</SelectItem>
            <SelectItem value="live">En cours</SelectItem>
            <SelectItem value="completed">Terminées</SelectItem>
            <SelectItem value="cancelled">Annulées</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sessions list */}
      {filteredSessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Aucune session trouvée</h3>
            <p className="text-muted-foreground">
              Créez votre première session de formation en direct
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredSessions.map((session) => (
            <Card key={session.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                      session.status === 'live' ? 'bg-red-100' : 'bg-muted'
                    }`}>
                      <Video className={`h-6 w-6 ${session.status === 'live' ? 'text-red-600' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{session.title}</h3>
                        {getStatusBadge(session.status)}
                        {session.status === 'live' && (
                          <span className="flex items-center gap-1 text-xs text-red-600 animate-pulse">
                            <span className="h-2 w-2 rounded-full bg-red-600" />
                            EN DIRECT
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {session.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {session.instructorName || `Instructeur #${session.instructorId}`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(session.scheduledAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {session.duration} min
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {session.currentParticipants}/{session.maxParticipants}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {session.meetingUrl && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => copyLink(session.meetingUrl)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleEdit(session)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    {session.status === 'scheduled' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelMutation.mutate(session.id)}
                      >
                        Annuler
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(session.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier la session</DialogTitle>
          </DialogHeader>
          <SessionForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSession(null)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
