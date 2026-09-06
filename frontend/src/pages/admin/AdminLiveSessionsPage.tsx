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

// Surfaces the backend's actual validation message (e.g. "scheduledAt is required")
// instead of a generic "Erreur lors de la création" that gives the user no way to
// know what to fix -- this is what made session creation look silently broken
// whenever the date/heure field was left incomplete.
function describeApiError(error: any, fallback: string): string {
  const details = error?.response?.data?.error?.details
  if (Array.isArray(details) && details.length > 0) {
    return details.map((d: any) => d.msg).filter(Boolean).join(' ')
  }
  return error?.response?.data?.error?.message || fallback
}

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
  status: 'scheduled' | 'live' | 'ended' | 'canceled'
  recordingUrl: string | null
  courseId?: number
  courseName?: string
  visibility?: 'public' | 'private'
  invitees?: { user_id: number; display_name: string }[]
}

interface SessionFormData {
  title: string
  description: string
  instructorId: string
  scheduledAt: string
  duration: number
  meetingUrl: string
  maxParticipants: number
  courseId: string
  visibility: 'public' | 'private'
  inviteeIds: string[]
}

// Hoisted out of AdminLiveSessionsPage: defining this inline in the parent's render
// body gave it a new function identity on every render, so React treated it as a
// brand-new component type each time and remounted the whole form -- every keystroke
// in any field (title, date, description...) lost focus immediately after landing,
// making the form effectively impossible to type into. Keeping this as a stable,
// top-level component (state lives in the parent, passed down as props) fixes that.
function SessionForm({
  formData,
  setFormData,
  users,
  courses,
  isEditing,
}: {
  formData: SessionFormData
  setFormData: (data: SessionFormData) => void
  users: any[]
  courses: any[]
  isEditing: boolean
}) {
  const { t } = useTranslation('admin')
  const idPrefix = isEditing ? 'edit-session' : 'add-session'
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>{t('liveSessionsAdmin.form.title')}</Label>
        <Input
          id={`${idPrefix}-title`}
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder={t('liveSessionsAdmin.form.titlePlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>{t('liveSessionsAdmin.form.description')}</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder={t('liveSessionsAdmin.form.descriptionPlaceholder')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-instructor`}>{t('liveSessionsAdmin.form.instructor')}</Label>
          <Select value={formData.instructorId} onValueChange={(v) => setFormData({ ...formData, instructorId: v })}>
            <SelectTrigger id={`${idPrefix}-instructor`}>
              <SelectValue placeholder={t('liveSessionsAdmin.form.instructorPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {users
                .filter((u: any) => ['super_admin', 'admin', 'director', 'manager'].includes(u.role))
                .map((user: any) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.display_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-course`}>{t('liveSessionsAdmin.form.associatedCourse')}</Label>
          <Select value={formData.courseId} onValueChange={(v) => setFormData({ ...formData, courseId: v })}>
            <SelectTrigger id={`${idPrefix}-course`}>
              <SelectValue placeholder={t('liveSessionsAdmin.form.noCourse')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('liveSessionsAdmin.form.none')}</SelectItem>
              {courses.map((course: any) => (
                <SelectItem key={course.id} value={course.id.toString()}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-visibility`}>{t('liveSessionsAdmin.form.visibility')}</Label>
        <Select
          value={formData.visibility}
          onValueChange={(v) => setFormData({ ...formData, visibility: v as 'public' | 'private', inviteeIds: v === 'public' ? [] : formData.inviteeIds })}
        >
          <SelectTrigger id={`${idPrefix}-visibility`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">{t('liveSessionsAdmin.form.visibilityPublic')}</SelectItem>
            <SelectItem value="private">{t('liveSessionsAdmin.form.visibilityPrivate')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.visibility === 'private' && (
        <div className="space-y-2">
          <Label>{t('liveSessionsAdmin.form.explicitInvitees')}</Label>
          <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
            {users.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('liveSessionsAdmin.form.noUsersAvailable')}</p>
            )}
            {users.map((user: any) => {
              const id = user.id.toString()
              const checked = formData.inviteeIds.includes(id)
              return (
                <label key={user.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        inviteeIds: e.target.checked
                          ? [...formData.inviteeIds, id]
                          : formData.inviteeIds.filter((i) => i !== id),
                      })
                    }}
                  />
                  {user.display_name}
                </label>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-scheduled-at`}>{t('liveSessionsAdmin.form.dateTime')} {!isEditing && <span className="text-destructive">*</span>}</Label>
          <Input
            id={`${idPrefix}-scheduled-at`}
            type="datetime-local"
            value={formData.scheduledAt}
            onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-duration`}>{t('liveSessionsAdmin.form.duration')}</Label>
          <Input
            id={`${idPrefix}-duration`}
            type="number"
            min={15}
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-meeting-url`}>{t('liveSessionsAdmin.form.meetingUrl')}</Label>
          <Input
            id={`${idPrefix}-meeting-url`}
            value={formData.meetingUrl}
            onChange={(e) => setFormData({ ...formData, meetingUrl: e.target.value })}
            placeholder="https://meet.google.com/..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-max-participants`}>{t('liveSessionsAdmin.form.maxParticipants')}</Label>
          <Input
            id={`${idPrefix}-max-participants`}
            type="number"
            min={1}
            value={formData.maxParticipants}
            onChange={(e) => setFormData({ ...formData, maxParticipants: parseInt(e.target.value) })}
          />
        </div>
      </div>
    </div>
  )
}

export default function AdminLiveSessionsPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null)
  const [formData, setFormData] = useState<SessionFormData>({
    title: '',
    description: '',
    instructorId: '',
    scheduledAt: '',
    duration: 60,
    meetingUrl: '',
    maxParticipants: 100,
    courseId: 'none',
    visibility: 'public',
    inviteeIds: [],
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
      toast({ title: tCommon('status.success'), description: t('liveSessionsAdmin.toasts.createdDescription') })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: describeApiError(error, t('liveSessionsAdmin.toasts.createErrorFallback')), variant: 'destructive' })
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
      toast({ title: tCommon('status.success'), description: t('liveSessionsAdmin.toasts.updatedDescription') })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: describeApiError(error, t('liveSessionsAdmin.toasts.updateErrorFallback')), variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/live-sessions/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-live-sessions'] })
      toast({ title: tCommon('status.success'), description: t('liveSessionsAdmin.toasts.deletedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('liveSessionsAdmin.toasts.deleteErrorDescription'), variant: 'destructive' })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/live-sessions/${id}/cancel`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-live-sessions'] })
      toast({ title: tCommon('status.success'), description: t('liveSessionsAdmin.toasts.canceledDescription') })
    },
  })

  const startMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/live-sessions/${id}/start`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-live-sessions'] })
      toast({ title: tCommon('status.success'), description: t('liveSessionsAdmin.toasts.startedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('liveSessionsAdmin.toasts.startErrorDescription'), variant: 'destructive' })
    },
  })

  const endMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/live-sessions/${id}/end`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-live-sessions'] })
      toast({ title: tCommon('status.success'), description: t('liveSessionsAdmin.toasts.endedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('liveSessionsAdmin.toasts.endErrorDescription'), variant: 'destructive' })
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
      courseId: 'none',
      visibility: 'public',
      inviteeIds: [],
    })
  }

  const handleEdit = (session: LiveSession) => {
    setEditingSession(session)
    setFormData({
      title: session.title,
      description: session.description || '',
      instructorId: session.instructorId.toString(),
      scheduledAt: new Date(session.scheduledAt).toISOString().slice(0, 16),
      duration: session.duration || 60,
      meetingUrl: session.meetingUrl || '',
      maxParticipants: session.maxParticipants || 100,
      courseId: session.courseId?.toString() || 'none',
      visibility: session.visibility || 'public',
      inviteeIds: session.invitees?.map((i) => String(i.user_id)) || [],
    })
  }

  const handleSubmit = () => {
    if (!editingSession && !formData.scheduledAt) {
      toast({ title: tCommon('status.error'), description: t('liveSessionsAdmin.toasts.dateRequiredDescription'), variant: 'destructive' })
      return
    }
    const data = {
      ...formData,
      instructorId: parseInt(formData.instructorId),
      courseId: formData.courseId && formData.courseId !== 'none' ? parseInt(formData.courseId) : null,
      inviteeIds: formData.visibility === 'private' ? formData.inviteeIds.map((id) => parseInt(id)) : [],
    }
    if (editingSession) {
      updateMutation.mutate({ id: editingSession.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url)
    toast({ title: t('liveSessionsAdmin.toasts.linkCopiedTitle'), description: t('liveSessionsAdmin.toasts.linkCopiedDescription') })
  }

  const filteredSessions = sessions
    .filter((session) =>
      session.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.instructorName?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter((session) => statusFilter === 'all' || session.status === statusFilter)

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      scheduled: { variant: 'secondary', label: t('liveSessionsAdmin.statuses.scheduled') },
      live: { variant: 'default', label: t('liveSessionsAdmin.statuses.live') },
      ended: { variant: 'outline', label: t('liveSessionsAdmin.statuses.ended') },
      canceled: { variant: 'destructive', label: t('liveSessionsAdmin.statuses.canceled') },
    }
    const style = styles[status] || { variant: 'outline', label: status }
    return <Badge variant={style.variant}>{style.label}</Badge>
  }

  if (isLoading) {
    return <PageLoading />
  }

  const scheduledCount = sessions.filter((s) => s.status === 'scheduled').length
  const liveCount = sessions.filter((s) => s.status === 'live').length
  const completedCount = sessions.filter((s) => s.status === 'ended').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('liveSessionsAdmin.title')}</h1>
          <p className="text-muted-foreground">{t('liveSessionsAdmin.subtitle')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              {t('liveSessionsAdmin.newSession')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('liveSessionsAdmin.createDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('liveSessionsAdmin.createDialog.description')}
              </DialogDescription>
            </DialogHeader>
            <SessionForm formData={formData} setFormData={setFormData} users={users} courses={courses} isEditing={false} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                {t('liveSessionsAdmin.createDialog.cancel')}
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? t('liveSessionsAdmin.createDialog.creating') : t('liveSessionsAdmin.createDialog.create')}
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
                <p className="text-sm text-muted-foreground">{t('liveSessionsAdmin.stats.total')}</p>
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
                <p className="text-sm text-muted-foreground">{t('liveSessionsAdmin.stats.scheduled')}</p>
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
                <p className="text-sm text-muted-foreground">{t('liveSessionsAdmin.stats.live')}</p>
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
                <p className="text-sm text-muted-foreground">{t('liveSessionsAdmin.stats.completed')}</p>
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
            placeholder={t('liveSessionsAdmin.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('liveSessionsAdmin.allStatuses')}</SelectItem>
            <SelectItem value="scheduled">{t('liveSessionsAdmin.stats.scheduled')}</SelectItem>
            <SelectItem value="live">{t('liveSessionsAdmin.stats.live')}</SelectItem>
            <SelectItem value="ended">{t('liveSessionsAdmin.stats.completed')}</SelectItem>
            <SelectItem value="canceled">{t('liveSessionsAdmin.statuses.canceled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sessions list */}
      {filteredSessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('liveSessionsAdmin.empty.title')}</h3>
            <p className="text-muted-foreground">
              {t('liveSessionsAdmin.empty.description')}
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
                            {t('liveSessionsAdmin.liveNow')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {session.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {session.instructorName || t('liveSessionsAdmin.instructorFallback', { id: session.instructorId })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(session.scheduledAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {t('liveSessionsAdmin.durationMinutes', { count: session.duration })}
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
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => startMutation.mutate(session.id)}
                          disabled={startMutation.isPending}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          {t('liveSessionsAdmin.start')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelMutation.mutate(session.id)}
                        >
                          {t('liveSessionsAdmin.cancel')}
                        </Button>
                      </>
                    )}
                    {session.status === 'live' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => endMutation.mutate(session.id)}
                        disabled={endMutation.isPending}
                      >
                        {t('liveSessionsAdmin.end')}
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
            <DialogTitle>{t('liveSessionsAdmin.editDialog.title')}</DialogTitle>
          </DialogHeader>
          <SessionForm formData={formData} setFormData={setFormData} users={users} courses={courses} isEditing={true} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSession(null)}>
              {t('liveSessionsAdmin.editDialog.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('liveSessionsAdmin.editDialog.saving') : t('liveSessionsAdmin.editDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
