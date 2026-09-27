import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  Mail,
  MessageSquare,
  Smartphone,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'
import { useOrganization } from '@/lib/tenantSettings'
import { Link } from 'react-router-dom'

// Matches the real notifications table (backend/src/routes/notification.routes.ts) --
// not a {type,title,isRead,data} shape invented independently of the schema.
interface Notification {
  id: number
  user_id: number
  channel: 'email' | 'sms' | 'whatsapp' | 'push' | 'in_app'
  subject: string | null
  body: string
  action_url: string | null
  read_at: string | null
  created_at: string
  user_name?: string
}

const channelValues = [
  { value: 'in_app', icon: Bell },
  { value: 'email', icon: Mail },
  { value: 'sms', icon: MessageSquare },
  { value: 'whatsapp', icon: MessageSquare },
  { value: 'push', icon: Smartphone },
]

// Matches users.role's real CHECK constraint (backend/src/routes/user.routes.ts and
// friends) -- not the fictional learner/instructor/admin set the form used to offer.
const roleValues = ['admin', 'director', 'manager', 'supervisor', 'agent', 'externe', 'stagiaire']

interface NotificationFormValues {
  channel: string
  subject: string
  body: string
  targetType: string
  targetUserId: string
  targetRole: string
}

// Defined at module scope so its identity stays stable across parent
// re-renders -- a component defined inside another component's render body
// gets recreated as a new type on every render, which makes React unmount
// and remount its inputs on every keystroke, resetting cursor position.
function NotificationForm({
  t,
  formData,
  onChange,
  channels,
  roles,
  users,
}: {
  t: (key: string) => string
  formData: NotificationFormValues
  onChange: (data: NotificationFormValues) => void
  channels: { value: string; icon: any; label: string }[]
  roles: { value: string; label: string }[]
  users: any[]
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="notification-channel">{t('notificationsAdmin.form.channel')}</Label>
        <Select value={formData.channel} onValueChange={(v) => onChange({ ...formData, channel: v })}>
          <SelectTrigger id="notification-channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <div className="flex items-center gap-2">
                  <c.icon className="h-4 w-4" />
                  {c.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notification-subject">{t('notificationsAdmin.form.subject')}</Label>
        <Input
          id="notification-subject"
          value={formData.subject}
          onChange={(e) => onChange({ ...formData, subject: e.target.value })}
          placeholder={t('notificationsAdmin.form.subjectPlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notification-message">{t('notificationsAdmin.form.message')}</Label>
        <Textarea
          id="notification-message"
          value={formData.body}
          onChange={(e) => onChange({ ...formData, body: e.target.value })}
          placeholder={t('notificationsAdmin.form.messagePlaceholder')}
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notification-recipients">{t('notificationsAdmin.form.recipients')}</Label>
        <Select value={formData.targetType} onValueChange={(v) => onChange({ ...formData, targetType: v })}>
          <SelectTrigger id="notification-recipients">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('notificationsAdmin.form.allUsers')}
              </div>
            </SelectItem>
            <SelectItem value="specific">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {t('notificationsAdmin.form.specificUser')}
              </div>
            </SelectItem>
            <SelectItem value="role">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                {t('notificationsAdmin.form.byRole')}
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.targetType === 'specific' && (
        <div className="space-y-2">
          <Label htmlFor="notification-target-user">{t('notificationsAdmin.form.selectUser')}</Label>
          <Select value={formData.targetUserId} onValueChange={(v) => onChange({ ...formData, targetUserId: v })}>
            <SelectTrigger id="notification-target-user">
              <SelectValue placeholder={t('notificationsAdmin.form.chooseUser')} />
            </SelectTrigger>
            <SelectContent>
              {users.map((user: any) => (
                <SelectItem key={user.id} value={user.id.toString()}>
                  {user.display_name} ({user.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {formData.targetType === 'role' && (
        <div className="space-y-2">
          <Label htmlFor="notification-target-role">{t('notificationsAdmin.form.selectRole')}</Label>
          <Select value={formData.targetRole} onValueChange={(v) => onChange({ ...formData, targetRole: v })}>
            <SelectTrigger id="notification-target-role">
              <SelectValue placeholder={t('notificationsAdmin.form.chooseRole')} />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

export default function AdminNotificationsPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const channels = channelValues.map((c) => ({ ...c, label: t(`notificationsAdmin.channels.${c.value}`) }))
  const roles = roleValues.map((value) => ({ value, label: t(`notificationsAdmin.roles.${value}`) }))
  const queryClient = useQueryClient()
  const { data: organization } = useOrganization()
  // Sending is refused by the API while the organization has notifications turned off.
  const notificationsDisabled = organization?.settings?.enableNotifications === false
  const [searchTerm, setSearchTerm] = useState('')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    channel: 'in_app',
    subject: '',
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
      await api.post('/notifications/bulk', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] })
      setIsCreateDialogOpen(false)
      resetForm()
      toast({ title: tCommon('status.success'), description: t('notificationsAdmin.toasts.sentDescription') })
    },
    onError: (error: any) => {
      const disabled = error.response?.data?.error?.code === 'FEATURE_DISABLED'
      toast({
        title: tCommon('status.error'),
        description: t(disabled ? 'notificationsAdmin.disabledBanner.title' : 'notificationsAdmin.toasts.sendErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/notifications/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] })
      toast({ title: tCommon('status.success'), description: t('notificationsAdmin.toasts.deletedDescription') })
    },
  })

  const resetForm = () => {
    setFormData({
      channel: 'in_app',
      subject: '',
      body: '',
      targetType: 'all',
      targetUserId: '',
      targetRole: '',
    })
  }

  const handleSend = () => {
    const data: any = {
      channel: formData.channel,
      subject: formData.subject,
      body: formData.body,
    }

    if (formData.targetType === 'specific') {
      data.userIds = [parseInt(formData.targetUserId)]
    } else if (formData.targetType === 'role') {
      data.role = formData.targetRole
    }

    sendMutation.mutate(data)
  }

  const getChannelIcon = (channel: string) => {
    const c = channels.find((c) => c.value === channel)
    if (c) {
      const Icon = c.icon
      return <Icon className="h-4 w-4 text-primary" />
    }
    return <Bell className="h-4 w-4" />
  }

  const filteredNotifications = notifications
    .filter((notif) =>
      (notif.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      notif.body.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter((notif) => channelFilter === 'all' || notif.channel === channelFilter)

  if (isLoading) {
    return <PageLoading />
  }

  const totalSent = notifications.length
  const readCount = notifications.filter((n) => n.read_at).length
  const unreadCount = totalSent - readCount

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('notificationsAdmin.title')}</h1>
          <p className="text-muted-foreground">{t('notificationsAdmin.subtitle')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} disabled={notificationsDisabled}>
              <Send className="h-4 w-4 mr-2" />
              {t('notificationsAdmin.sendButton')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('notificationsAdmin.createDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('notificationsAdmin.createDialog.description')}
              </DialogDescription>
            </DialogHeader>
            <NotificationForm t={t} formData={formData} onChange={setFormData} channels={channels} roles={roles} users={users} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                {t('notificationsAdmin.createDialog.cancel')}
              </Button>
              <Button onClick={handleSend} disabled={sendMutation.isPending || !formData.body}>
                {sendMutation.isPending ? t('notificationsAdmin.createDialog.sending') : t('notificationsAdmin.createDialog.send')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {notificationsDisabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-300">{t('notificationsAdmin.disabledBanner.title')}</p>
          <p className="text-amber-700 dark:text-amber-400 mt-1">
            {t('notificationsAdmin.disabledBanner.description')}{' '}
            <Link to="/admin/organization" className="underline">{t('notificationsAdmin.disabledBanner.link')}</Link>
          </p>
        </div>
      )}

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
                <p className="text-sm text-muted-foreground">{t('notificationsAdmin.stats.totalSent')}</p>
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
                <p className="text-sm text-muted-foreground">{t('notificationsAdmin.stats.read')}</p>
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
                <p className="text-sm text-muted-foreground">{t('notificationsAdmin.stats.unread')}</p>
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
                <p className="text-sm text-muted-foreground">{t('notificationsAdmin.stats.users')}</p>
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
            placeholder={t('notificationsAdmin.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('notificationsAdmin.allChannels')}</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
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
            <h3 className="text-lg font-medium mb-2">{t('notificationsAdmin.empty.title')}</h3>
            <p className="text-muted-foreground">
              {t('notificationsAdmin.empty.description')}
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
                      {getChannelIcon(notif.channel)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium">{notif.subject || t('notificationsAdmin.defaultSubject')}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {notif.body}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={notif.read_at ? 'secondary' : 'default'}>
                            {notif.read_at ? t('notificationsAdmin.readStatus') : t('notificationsAdmin.unreadStatus')}
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
                          {notif.user_name || t('notificationsAdmin.userFallback', { id: notif.user_id })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(notif.created_at)}
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
