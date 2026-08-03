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
  Bell,
  Search,
  Send,
  Users,
  User,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'

interface Notification {
  id: number
  userId: number | null
  type: string
  title: string
  body: string
  data: any
  isRead: boolean
  createdAt: string
  userName?: string
}

const notificationTypes = [
  { value: 'info', label: 'Information', icon: Info, color: 'blue' },
  { value: 'success', label: 'Succès', icon: CheckCircle, color: 'green' },
  { value: 'warning', label: 'Avertissement', icon: AlertTriangle, color: 'yellow' },
  { value: 'alert', label: 'Alerte', icon: XCircle, color: 'red' },
  { value: 'course_assigned', label: 'Cours attribué', icon: MessageSquare, color: 'purple' },
]

export default function AdminNotificationsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    type: 'info',
    title: '',
    body: '',
    targetType: 'all', // all, specific, role
    targetUserId: '',
    targetRole: '',
  })

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['admin-notifications'],
    queryFn: async () => {
      const response = await api.get('/notifications/all')
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

  const sendMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.post('/notifications/send', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] })
      setIsCreateDialogOpen(false)
      resetForm()
      toast({ title: 'Succès', description: 'Notification envoyée avec succès' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de l\'envoi', variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/notifications/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] })
      toast({ title: 'Succès', description: 'Notification supprimée' })
    },
  })

  const resetForm = () => {
    setFormData({
      type: 'info',
      title: '',
      body: '',
      targetType: 'all',
      targetUserId: '',
      targetRole: '',
    })
  }

  const handleSend = () => {
    const data: any = {
      type: formData.type,
      title: formData.title,
      body: formData.body,
    }

    if (formData.targetType === 'specific') {
      data.userId = parseInt(formData.targetUserId)
    } else if (formData.targetType === 'role') {
      data.role = formData.targetRole
    }

    sendMutation.mutate(data)
  }

  const getTypeIcon = (type: string) => {
    const notifType = notificationTypes.find((t) => t.value === type)
    if (notifType) {
      const Icon = notifType.icon
      return <Icon className={`h-4 w-4 text-${notifType.color}-500`} />
    }
    return <Bell className="h-4 w-4" />
  }

  const filteredNotifications = notifications
    .filter((notif) =>
      notif.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notif.body.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter((notif) => typeFilter === 'all' || notif.type === typeFilter)

  if (isLoading) {
    return <PageLoading />
  }

  const totalSent = notifications.length
  const readCount = notifications.filter((n) => n.isRead).length
  const unreadCount = totalSent - readCount

  const NotificationForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Type de notification</Label>
        <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {notificationTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                <div className="flex items-center gap-2">
                  <type.icon className={`h-4 w-4 text-${type.color}-500`} />
                  {type.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Titre</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Titre de la notification"
        />
      </div>

      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          value={formData.body}
          onChange={(e) => setFormData({ ...formData, body: e.target.value })}
          placeholder="Contenu de la notification..."
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label>Destinataires</Label>
        <Select value={formData.targetType} onValueChange={(v) => setFormData({ ...formData, targetType: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Tous les utilisateurs
              </div>
            </SelectItem>
            <SelectItem value="specific">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Utilisateur spécifique
              </div>
            </SelectItem>
            <SelectItem value="role">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Par rôle
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.targetType === 'specific' && (
        <div className="space-y-2">
          <Label>Sélectionner l'utilisateur</Label>
          <Select value={formData.targetUserId} onValueChange={(v) => setFormData({ ...formData, targetUserId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un utilisateur" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user: any) => (
                <SelectItem key={user.id} value={user.id.toString()}>
                  {user.firstName} {user.lastName} ({user.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {formData.targetType === 'role' && (
        <div className="space-y-2">
          <Label>Sélectionner le rôle</Label>
          <Select value={formData.targetRole} onValueChange={(v) => setFormData({ ...formData, targetRole: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un rôle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="learner">Apprenants</SelectItem>
              <SelectItem value="instructor">Instructeurs</SelectItem>
              <SelectItem value="admin">Administrateurs</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Centre de notifications</h1>
          <p className="text-muted-foreground">Envoyez et gérez les notifications aux utilisateurs</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Send className="h-4 w-4 mr-2" />
              Envoyer une notification
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouvelle notification</DialogTitle>
              <DialogDescription>
                Envoyez une notification à vos utilisateurs
              </DialogDescription>
            </DialogHeader>
            <NotificationForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSend} disabled={sendMutation.isPending || !formData.title || !formData.body}>
                {sendMutation.isPending ? 'Envoi...' : 'Envoyer'}
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
                <Bell className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalSent}</p>
                <p className="text-sm text-muted-foreground">Total envoyées</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{readCount}</p>
                <p className="text-sm text-muted-foreground">Lues</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{unreadCount}</p>
                <p className="text-sm text-muted-foreground">Non lues</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-sm text-muted-foreground">Utilisateurs</p>
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
            placeholder="Rechercher une notification..."
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {notificationTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Notifications list */}
      {filteredNotifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Aucune notification trouvée</h3>
            <p className="text-muted-foreground">
              Envoyez votre première notification aux utilisateurs
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredNotifications.map((notif) => (
                <div key={notif.id} className="p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {getTypeIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium">{notif.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {notif.body}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={notif.isRead ? 'secondary' : 'default'}>
                            {notif.isRead ? 'Lu' : 'Non lu'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(notif.id)}
                          >
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {notif.userName || (notif.userId ? `User #${notif.userId}` : 'Tous les utilisateurs')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(notif.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
