import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/loading'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import { getInitials, formatRelativeTime, dateLocale } from '@/lib/utils'
import { downloadCsv } from '@/lib/csv'
import {
  Search,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Mail,
  Shield,
  Download,
  Upload,
  UserCheck,
  UserMinus,
  UserX,
  Tag,
  X,
  Check,
  Lock,
  Unlock,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { EmailConfirmDialog, PendingNotification } from '@/components/EmailConfirmDialog'

// Same permission level as 'agent' — externe/stagiaire can be assigned a direct
// supervisor just like an agent can.
const AGENT_LIKE_ROLES = ['agent', 'externe', 'stagiaire']

// admin/super_admin are deliberately excluded — see backend INACTIVITY_POLICY_ROLES.
const INACTIVITY_POLICY_ROLE_VALUES = ['director', 'manager', 'supervisor', 'agent', 'externe', 'stagiaire']

function InactivityPolicyCard() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [days, setDays] = useState<Record<string, string>>({})

  const { data: policies = [] } = useQuery({
    queryKey: ['inactivity-policies'],
    queryFn: () => api.settings.getInactivityPolicies(),
  })

  const policyByRole = Object.fromEntries(policies.map((p: any) => [p.role, p.maxInactiveDays]))

  const saveMutation = useMutation({
    mutationFn: ({ role, maxInactiveDays }: { role: string; maxInactiveDays: number | null }) =>
      api.settings.setInactivityPolicy(role, maxInactiveDays),
    onSuccess: () => {
      toast({ title: t('users.inactivityPolicy.updatedTitle') })
      queryClient.invalidateQueries({ queryKey: ['inactivity-policies'] })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('users.inactivityPolicy.updateErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('users.inactivityPolicy.title')}</CardTitle>
        <CardDescription>
          {t('users.inactivityPolicy.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {INACTIVITY_POLICY_ROLE_VALUES.map((value) => {
            const currentValue = days[value] !== undefined ? days[value] : (policyByRole[value] ?? '')
            return (
              <div key={value} className="flex items-center gap-2">
                <Label htmlFor={`inactivity-policy-${value}`} className="w-24 shrink-0 text-sm">{t(`users.roles.${value}`)}</Label>
                <Input
                  id={`inactivity-policy-${value}`}
                  type="number"
                  min={1}
                  placeholder={t('users.inactivityPolicy.disabledPlaceholder')}
                  className="w-24"
                  value={currentValue}
                  onChange={(e) => setDays({ ...days, [value]: e.target.value })}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    const raw = days[value]
                    const maxInactiveDays = raw === undefined || raw === '' ? null : parseInt(raw, 10)
                    saveMutation.mutate({ role: value, maxInactiveDays })
                  }}
                >
                  {t('users.inactivityPolicy.save')}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminUsersPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  // Debounce the search box before it enters the server-side query key -- without
  // this, every keystroke fired a new request and (combined with the isLoading
  // guard below) unmounted the whole page, kicking the input out of focus.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(timeout)
  }, [search])

  // Any filter change invalidates whatever page we were on.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, roleFilter, statusFilter])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [pendingNotification, setPendingNotification] = useState<PendingNotification | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [userPendingDelete, setUserPendingDelete] = useState<any>(null)
  const [jobTitlePendingDelete, setJobTitlePendingDelete] = useState<any>(null)
  const [isJobTitlesDialogOpen, setIsJobTitlesDialogOpen] = useState(false)
  const [newJobTitleLabel, setNewJobTitleLabel] = useState('')
  const [editingJobTitleId, setEditingJobTitleId] = useState<number | null>(null)
  const [editingJobTitleLabel, setEditingJobTitleLabel] = useState('')
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: '',
    jobTitle: '',
    enterpriseId: '',
    subsidiaryId: '',
    directionId: '',
    serviceId: '',
    supervisorId: '',
  })
  const [editUser, setEditUser] = useState({
    displayName: '',
    role: '',
    jobTitle: '',
    enterpriseId: '',
    subsidiaryId: '',
    directionId: '',
    serviceId: '',
    supervisorId: '',
    isActive: true,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-users', { search: debouncedSearch, role: roleFilter, status: statusFilter, page }],
    queryFn: () => api.users.list({
      search: debouncedSearch,
      role: roleFilter !== 'all' ? roleFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
    }),
    // Keep the previous page's data (and the mounted <input>) on screen while a
    // new search/filter/page loads, instead of the query key change flipping
    // isLoading back to true and unmounting the whole page.
    placeholderData: keepPreviousData,
  })

  const { data: pendingData } = useQuery({
    queryKey: ['admin-users-pending-count'],
    queryFn: () => api.users.list({ status: 'pending', limit: 1 }),
  })
  const pendingCount = pendingData?.meta?.total ?? 0

  // Fetch enterprises, directions, and services
  const { data: enterprises = [] } = useQuery({
    queryKey: ['enterprises'],
    queryFn: () => api.organizations.getEnterprises(),
  })

  const { data: subsidiaries = [] } = useQuery({
    queryKey: ['subsidiaries'],
    queryFn: () => api.organizations.getSubsidiaries(),
  })

  const { data: directions = [] } = useQuery({
    queryKey: ['directions'],
    queryFn: () => api.organizations.getDirections(),
  })

  // Directions offered for a placement: those of the enterprise, and of the
  // subsidiary when one is chosen (ids compared as numbers: pg may send strings).
  const directionsFor = (enterpriseId: string, subsidiaryId: string) =>
    directions.filter(
      (d: any) =>
        (!enterpriseId || Number(d.enterprise_id) === Number(enterpriseId)) &&
        (!subsidiaryId || Number(d.subsidiary_id) === Number(subsidiaryId))
    )
  const subsidiariesFor = (enterpriseId: string) =>
    subsidiaries.filter((sub: any) => !enterpriseId || Number(sub.enterprise_id) === Number(enterpriseId))

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.organizations.getServices(),
  })

  const { data: supervisorOptions = [] } = useQuery({
    queryKey: ['admin-users-supervisors'],
    queryFn: () => api.users.list({ role: 'supervisor', limit: 100 }).then((r: any) => r.data || []),
  })

  const { data: jobTitles = [] } = useQuery({
    queryKey: ['job-titles'],
    queryFn: () => api.jobTitles.list(),
  })

  const createJobTitleMutation = useMutation({
    mutationFn: (label: string) => api.jobTitles.create(label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-titles'] })
      setNewJobTitleLabel('')
      toast({ title: tCommon('status.success'), description: t('users.jobTitles.toasts.createdDescription') })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('users.jobTitles.toasts.createErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const updateJobTitleMutation = useMutation({
    mutationFn: ({ id, label }: { id: number; label: string }) => api.jobTitles.update(id, label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-titles'] })
      setEditingJobTitleId(null)
      toast({ title: tCommon('status.success'), description: t('users.jobTitles.toasts.updatedDescription') })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('users.jobTitles.toasts.updateErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const deleteJobTitleMutation = useMutation({
    mutationFn: (id: number) => api.jobTitles.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-titles'] })
      toast({ title: tCommon('status.success'), description: t('users.jobTitles.toasts.deletedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('users.jobTitles.toasts.deleteErrorDescription'), variant: 'destructive' })
    },
  })

  const createMutation = useMutation({
    mutationFn: (userData: any) => api.post('/users', userData),
    onSuccess: (response) => {
      toast({ title: t('users.toasts.createdTitle'), description: t('users.toasts.createdDescription') })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setIsAddDialogOpen(false)
      setNewUser({ firstName: '', lastName: '', email: '', password: '', role: '', jobTitle: '', enterpriseId: '', subsidiaryId: '', directionId: '', serviceId: '', supervisorId: '' })
      if (response.data.pendingNotification) {
        setPendingNotification(response.data.pendingNotification)
      }
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('users.toasts.createErrorDescription'),
        variant: 'destructive'
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => api.users.delete(userId),
    onSuccess: () => {
      toast({ title: t('users.toasts.deletedTitle'), description: t('users.toasts.deletedDescription') })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('users.toasts.deleteErrorDescription'), variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: any }) => api.users.update(userId, data),
    onSuccess: () => {
      toast({ title: t('users.toasts.updatedTitle'), description: t('users.toasts.updatedDescription') })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setIsEditDialogOpen(false)
      setSelectedUser(null)
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('users.toasts.updateErrorDescription'),
        variant: 'destructive'
      })
    },
  })

  const changeStatusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: number; status: string }) =>
      api.put(`/users/${userId}/status`, { status }),
    onSuccess: (response) => {
      toast({ title: t('users.toasts.statusUpdatedTitle') })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-users-pending-count'] })
      if (response.data.pendingNotification) {
        setPendingNotification(response.data.pendingNotification)
      }
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('users.toasts.statusUpdateErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  // Lifts a lockout after too many wrong passwords (Organisation > Accès & sécurité).
  const unlockMutation = useMutation({
    mutationFn: (userId: number) => api.post(`/users/${userId}/unlock`),
    onSuccess: () => {
      toast({ title: t('users.toasts.unlockedTitle') })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('users.toasts.statusUpdateErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/users/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data.data
    },
    onSuccess: (data) => {
      setImportResult(data)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast({ title: t('users.toasts.importCompleteTitle'), description: t('users.toasts.importCompleteDescription', { count: data.created }) })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('users.toasts.importErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const handleImportSubmit = () => {
    if (!importFile) return
    importMutation.mutate(importFile)
  }

  const closeImportDialog = () => {
    setIsImportDialogOpen(false)
    setImportFile(null)
    setImportResult(null)
  }

  const handleEditUser = (user: any) => {
    setSelectedUser(user)
    setEditUser({
      displayName: user.display_name || '',
      role: user.role || '',
      jobTitle: user.job_title || '',
      enterpriseId: user.enterprise_id ? String(user.enterprise_id) : '',
      subsidiaryId: user.subsidiary_id ? String(user.subsidiary_id) : '',
      directionId: user.direction_id ? String(user.direction_id) : '',
      serviceId: user.service_id ? String(user.service_id) : '',
      supervisorId: user.supervisor_id ? String(user.supervisor_id) : '',
      isActive: user.is_active !== false,
    })
    setIsEditDialogOpen(true)
  }

  const handleUpdateUser = () => {
    if (!selectedUser) return
    updateMutation.mutate({
      userId: selectedUser.id,
      data: {
        displayName: editUser.displayName,
        role: editUser.role,
        jobTitle: editUser.jobTitle || 'Défaut',
        enterpriseId: editUser.enterpriseId ? parseInt(editUser.enterpriseId) : null,
        // A chosen direction decides the subsidiary on the server.
        subsidiaryId: editUser.directionId ? undefined : editUser.subsidiaryId ? parseInt(editUser.subsidiaryId) : null,
        directionId: editUser.directionId ? parseInt(editUser.directionId) : null,
        serviceId: editUser.serviceId ? parseInt(editUser.serviceId) : null,
        supervisorId: editUser.supervisorId ? parseInt(editUser.supervisorId) : null,
        isActive: editUser.isActive,
      },
    })
  }

  const handleSendEmail = (user: any) => {
    window.location.href = `mailto:${user.email}`
  }

  const handleDeleteUser = (user: any) => {
    setUserPendingDelete(user)
  }

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.role || !newUser.firstName || !newUser.lastName) {
      toast({ title: tCommon('status.error'), description: t('users.toasts.fillRequiredFields'), variant: 'destructive' })
      return
    }
    
    createMutation.mutate({
      email: newUser.email,
      password: newUser.password,
      displayName: `${newUser.firstName} ${newUser.lastName}`,
      role: newUser.role,
      jobTitle: newUser.jobTitle.trim() || undefined,
      enterpriseId: newUser.enterpriseId ? parseInt(newUser.enterpriseId) : undefined,
      subsidiaryId: !newUser.directionId && newUser.subsidiaryId ? parseInt(newUser.subsidiaryId) : undefined,
      directionId: newUser.directionId ? parseInt(newUser.directionId) : undefined,
      serviceId: newUser.serviceId ? parseInt(newUser.serviceId) : undefined,
      supervisorId: newUser.supervisorId ? parseInt(newUser.supervisorId) : undefined,
    })
  }

  if (isLoading) {
    return <PageLoading />
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-6 text-center text-destructive">
        {t('users.loadError')}
      </div>
    )
  }

  const users = data?.data || []
  const meta = data?.meta as { page: number; limit: number; total: number; totalPages: number } | undefined

  const roleLabels: Record<string, string> = {
    super_admin: t('users.roles.superAdmin'),
    admin: t('users.roles.admin'),
    director: t('users.roles.director'),
    manager: t('users.roles.manager'),
    supervisor: t('users.roles.supervisor'),
    agent: t('users.roles.agent'),
    externe: t('users.roles.externe'),
    stagiaire: t('users.roles.stagiaire'),
  }

  const statusLabels: Record<string, string> = {
    pending: t('users.statuses.pending'),
    active: t('users.statuses.active'),
    suspended: t('users.statuses.suspended'),
    deactivated: t('users.statuses.deactivated'),
  }
  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-orange-100 text-orange-800',
    deactivated: 'bg-red-100 text-red-800',
  }

  // Exports exactly the currently filtered/loaded list (search/role/status), not a
  // separate full dump -- matches what's visible in the table.
  const handleExport = () => {
    downloadCsv(
      `utilisateurs-${Date.now()}.csv`,
      [
        { key: 'display_name', label: t('users.table.user') },
        { key: 'email', label: 'Email' },
        { key: 'job_title', label: t('users.editDialog.jobTitle') },
        { key: 'enterprise_name', label: t('users.editDialog.enterprise') },
        { key: 'subsidiary_name', label: t('users.addDialog.subsidiary') },
        { key: 'direction_name', label: t('users.editDialog.direction') },
        { key: 'service_name', label: t('users.editDialog.service') },
        { key: 'supervisor_name', label: t('users.editDialog.supervisor') },
        { key: 'role_label', label: t('users.table.role') },
        { key: 'status_label', label: t('users.table.status') },
      ],
      users.map((u: any) => ({
        ...u,
        role_label: roleLabels[u.role] || u.role,
        status_label: statusLabels[u.status] || u.status,
      }))
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('users.title')}</h1>
          <p className="text-muted-foreground">
            {t('users.totalUsers', { count: meta?.total ?? users.length })}
            {pendingCount > 0 && (
              <>
                {' '}·{' '}
                <button
                  type="button"
                  className="text-amber-700 underline underline-offset-2 hover:no-underline"
                  onClick={() => setStatusFilter('pending')}
                >
                  {t('users.pendingActivation', { count: pendingCount })}
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {t('users.import')}
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={users.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            {t('users.export')}
          </Button>
          <Button variant="outline" onClick={() => setIsJobTitlesDialogOpen(true)}>
            <Tag className="h-4 w-4 mr-2" />
            {t('users.jobTitles.manageButton')}
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t('users.add')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('users.addDialog.title')}</DialogTitle>
                <DialogDescription>
                  {t('users.addDialog.description')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t('users.addDialog.firstName')}</Label>
                    <Input
                      id="firstName"
                      placeholder="Jean"
                      value={newUser.firstName}
                      onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t('users.addDialog.lastName')}</Label>
                    <Input
                      id="lastName"
                      placeholder="Dupont"
                      value={newUser.lastName}
                      onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('users.addDialog.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="jean.dupont@company.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('users.addDialog.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('users.addDialog.passwordPlaceholder')}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">{t('users.addDialog.role')}</Label>
                  <Select value={newUser.role} onValueChange={(value: string) => setNewUser({ ...newUser, role: value })}>
                    <SelectTrigger id="role">
                      <SelectValue placeholder={t('users.addDialog.rolePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {currentUser?.role === 'super_admin' && (
                        <SelectItem value="super_admin">{t('users.roles.superAdmin')}</SelectItem>
                      )}
                      {/* Directors can't create admin/super_admin accounts (enforced backend-side
                          too) -- hiding the option avoids a guaranteed rejection on submit. */}
                      {currentUser?.role !== 'director' && (
                        <SelectItem value="admin">{t('users.roles.admin')}</SelectItem>
                      )}
                      <SelectItem value="director">{t('users.roles.director')}</SelectItem>
                      <SelectItem value="manager">{t('users.roles.manager')}</SelectItem>
                      <SelectItem value="supervisor">{t('users.roles.supervisor')}</SelectItem>
                      <SelectItem value="agent">{t('users.roles.agent')}</SelectItem>
                      <SelectItem value="externe">{t('users.roles.externe')}</SelectItem>
                      <SelectItem value="stagiaire">{t('users.roles.stagiaire')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobTitle">{t('users.addDialog.jobTitle')}</Label>
                  <Select
                    value={newUser.jobTitle}
                    onValueChange={(value: string) => setNewUser({ ...newUser, jobTitle: value })}
                  >
                    <SelectTrigger id="jobTitle">
                      <SelectValue placeholder={t('users.addDialog.jobTitlePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {jobTitles.map((jt: any) => (
                        <SelectItem key={jt.id} value={jt.label}>{jt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enterprise">{t('users.addDialog.enterprise')}</Label>
                  <Select
                    value={newUser.enterpriseId}
                    onValueChange={(value: string) => setNewUser({ ...newUser, enterpriseId: value, subsidiaryId: '', directionId: '', serviceId: '' })}
                  >
                    <SelectTrigger id="enterprise">
                      <SelectValue placeholder={t('users.addDialog.enterprisePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {enterprises.map((e: any) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {subsidiariesFor(newUser.enterpriseId).length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="subsidiary">{t('users.addDialog.subsidiary')}</Label>
                    <Select
                      value={newUser.subsidiaryId || '__none__'}
                      onValueChange={(value: string) => setNewUser({ ...newUser, subsidiaryId: value === '__none__' ? '' : value, directionId: '', serviceId: '' })}
                      disabled={!newUser.enterpriseId}
                    >
                      <SelectTrigger id="subsidiary">
                        <SelectValue placeholder={t('users.addDialog.subsidiaryPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t('users.addDialog.noSubsidiary')}</SelectItem>
                        {subsidiariesFor(newUser.enterpriseId).map((sub: any) => (
                          <SelectItem key={sub.id} value={String(sub.id)}>{sub.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="direction">{t('users.addDialog.direction')}</Label>
                  <Select
                    value={newUser.directionId}
                    onValueChange={(value: string) => setNewUser({ ...newUser, directionId: value, serviceId: '' })}
                    disabled={!newUser.enterpriseId}
                  >
                    <SelectTrigger id="direction">
                      <SelectValue placeholder={t('users.addDialog.directionPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {directionsFor(newUser.enterpriseId, newUser.subsidiaryId)
                        .map((d: any) => (
                          <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service">{t('users.addDialog.service')}</Label>
                  <Select
                    value={newUser.serviceId}
                    onValueChange={(value: string) => setNewUser({ ...newUser, serviceId: value })}
                    disabled={!newUser.directionId}
                  >
                    <SelectTrigger id="service">
                      <SelectValue placeholder={t('users.addDialog.servicePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {services
                        .filter((s: any) => !newUser.directionId || Number(s.direction_id) === Number(newUser.directionId))
                        .map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {AGENT_LIKE_ROLES.includes(newUser.role) && (
                  <div className="space-y-2">
                    <Label htmlFor="supervisor">{t('users.addDialog.supervisor')}</Label>
                    <Select
                      value={newUser.supervisorId || '__none__'}
                      onValueChange={(value: string) => setNewUser({ ...newUser, supervisorId: value === '__none__' ? '' : value })}
                    >
                      <SelectTrigger id="supervisor">
                        <SelectValue placeholder={t('users.addDialog.none')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t('users.addDialog.none')}</SelectItem>
                        {supervisorOptions.map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.display_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={createMutation.isPending}>
                  {t('users.addDialog.cancel')}
                </Button>
                <Button onClick={handleCreateUser} disabled={createMutation.isPending}>
                  {createMutation.isPending ? t('users.addDialog.creating') : t('users.addDialog.create')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && <InactivityPolicyCard />}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('users.filters.searchPlaceholder')}
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('users.filters.allRoles')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('users.filters.allRoles')}</SelectItem>
            {currentUser?.role === 'super_admin' && (
              <SelectItem value="super_admin">{t('users.roles.superAdmin')}</SelectItem>
            )}
            <SelectItem value="admin">{t('users.roles.admin')}</SelectItem>
            <SelectItem value="director">{t('users.roles.director')}</SelectItem>
            <SelectItem value="manager">{t('users.roles.manager')}</SelectItem>
            <SelectItem value="supervisor">{t('users.roles.supervisor')}</SelectItem>
            <SelectItem value="agent">{t('users.roles.agent')}</SelectItem>
            <SelectItem value="externe">{t('users.roles.externe')}</SelectItem>
            <SelectItem value="stagiaire">{t('users.roles.stagiaire')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={t('users.filters.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('users.filters.allStatuses')}</SelectItem>
            <SelectItem value="pending">{t('users.statuses.pending')}</SelectItem>
            <SelectItem value="active">{t('users.statuses.active')}</SelectItem>
            <SelectItem value="suspended">{t('users.statuses.suspended')}</SelectItem>
            <SelectItem value="deactivated">{t('users.statuses.deactivated')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-4 font-medium">{t('users.table.user')}</th>
                  <th className="text-left p-4 font-medium">{t('users.table.enterprise')}</th>
                  <th className="text-left p-4 font-medium">{t('users.table.direction')}</th>
                  <th className="text-left p-4 font-medium">{t('users.table.service')}</th>
                  <th className="text-left p-4 font-medium">{t('users.table.supervisor')}</th>
                  <th className="text-left p-4 font-medium">{t('users.table.role')}</th>
                  <th className="text-left p-4 font-medium">{t('users.table.status')}</th>
                  <th className="text-left p-4 font-medium">{t('users.table.lastLogin')}</th>
                  <th className="text-right p-4 font-medium">{t('users.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: any) => (
                  <tr key={user.id} className="border-b hover:bg-muted/50">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback>
                            {getInitials(user.display_name || `${user.firstName || ''} ${user.lastName || ''}`)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {user.display_name || `${user.firstName} ${user.lastName}`}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.job_title || t('users.table.defaultJobTitle')}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-sm">{user.enterprise_name || '-'}</span>
                      {user.subsidiary_name && <span className="block text-xs text-muted-foreground">{user.subsidiary_name}</span>}
                    </td>
                    <td className="p-4">
                      <span className="text-sm">{user.direction_name || '-'}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-sm">{user.service_name || '-'}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-sm">{user.supervisor_name || '-'}</span>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline">
                        <Shield className="h-3 w-3 mr-1" />
                        {roleLabels[user.role] || user.role}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge className={statusColors[user.status] || 'bg-gray-100 text-gray-800'}>
                        {statusLabels[user.status] || user.status || (user.is_active ? t('users.statuses.active') : t('users.statuses.inactive'))}
                      </Badge>
                      {user.locked_until && (
                        <Badge
                          variant="outline"
                          className="ml-1 border-red-300 text-red-700"
                          title={t('users.lockedUntil', { time: new Date(user.locked_until).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }) })}
                        >
                          <Lock className="h-3 w-3 mr-1" />
                          {t('users.locked')}
                        </Badge>
                      )}
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {user.last_login_at ? formatRelativeTime(user.last_login_at) : user.created_at ? formatRelativeTime(user.created_at) : '-'}
                    </td>
                    <td className="p-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditUser(user)}>
                            <Edit className="h-4 w-4 mr-2" />
                            {t('users.rowActions.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSendEmail(user)}>
                            <Mail className="h-4 w-4 mr-2" />
                            {t('users.rowActions.sendEmail')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {user.locked_until && (
                            <DropdownMenuItem onClick={() => unlockMutation.mutate(user.id)}>
                              <Unlock className="h-4 w-4 mr-2" />
                              {t('users.rowActions.unlock')}
                            </DropdownMenuItem>
                          )}
                          {user.status !== 'active' && (
                            <DropdownMenuItem onClick={() => changeStatusMutation.mutate({ userId: user.id, status: 'active' })}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              {user.status === 'pending' ? t('users.rowActions.activate') : t('users.rowActions.reactivate')}
                            </DropdownMenuItem>
                          )}
                          {user.status === 'active' && (
                            <DropdownMenuItem onClick={() => changeStatusMutation.mutate({ userId: user.id, status: 'suspended' })}>
                              <UserMinus className="h-4 w-4 mr-2" />
                              {t('users.rowActions.suspend')}
                            </DropdownMenuItem>
                          )}
                          {user.status !== 'deactivated' && (
                            <DropdownMenuItem onClick={() => changeStatusMutation.mutate({ userId: user.id, status: 'deactivated' })}>
                              <UserX className="h-4 w-4 mr-2" />
                              {t('users.rowActions.deactivate')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteUser(user)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('users.rowActions.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      {t('users.table.noResults')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('users.pagination.pageOf', { page: meta.page, totalPages: meta.totalPages, total: meta.total })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('users.pagination.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            >
              {t('users.pagination.next')}
            </Button>
          </div>
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.editDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('users.editDialog.description', { name: selectedUser?.display_name || selectedUser?.email })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editDisplayName">{t('users.editDialog.fullName')}</Label>
              <Input
                id="editDisplayName"
                value={editUser.displayName}
                onChange={(e) => setEditUser({ ...editUser, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editRole">{t('users.editDialog.role')}</Label>
              {/* Only admins/super_admins can actually change a role (the backend silently
                  drops the field otherwise) -- disable rather than let a director submit a
                  change that quietly does nothing. */}
              <Select
                value={editUser.role}
                onValueChange={(value: string) => setEditUser({ ...editUser, role: value })}
                disabled={currentUser?.role !== 'admin' && currentUser?.role !== 'super_admin'}
              >
                <SelectTrigger id="editRole">
                  <SelectValue placeholder={t('users.addDialog.rolePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {currentUser?.role === 'super_admin' && (
                    <SelectItem value="super_admin">{t('users.roles.superAdmin')}</SelectItem>
                  )}
                  <SelectItem value="admin">{t('users.roles.admin')}</SelectItem>
                  <SelectItem value="director">{t('users.roles.director')}</SelectItem>
                  <SelectItem value="manager">{t('users.roles.manager')}</SelectItem>
                  <SelectItem value="supervisor">{t('users.roles.supervisor')}</SelectItem>
                  <SelectItem value="externe">{t('users.roles.externe')}</SelectItem>
                  <SelectItem value="stagiaire">{t('users.roles.stagiaire')}</SelectItem>
                  <SelectItem value="agent">{t('users.roles.agent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editJobTitle">{t('users.editDialog.jobTitle')}</Label>
              <Select
                value={editUser.jobTitle}
                onValueChange={(value: string) => setEditUser({ ...editUser, jobTitle: value })}
              >
                <SelectTrigger id="editJobTitle">
                  <SelectValue placeholder={t('users.addDialog.jobTitlePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {jobTitles.map((jt: any) => (
                    <SelectItem key={jt.id} value={jt.label}>{jt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEnterprise">{t('users.editDialog.enterprise')}</Label>
              <Select
                value={editUser.enterpriseId || '__none__'}
                onValueChange={(value: string) => setEditUser({ ...editUser, enterpriseId: value === '__none__' ? '' : value, subsidiaryId: '', directionId: '', serviceId: '' })}
              >
                <SelectTrigger id="editEnterprise">
                  <SelectValue placeholder={t('users.addDialog.enterprisePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('users.editDialog.none')}</SelectItem>
                  {enterprises.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {subsidiariesFor(editUser.enterpriseId).length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="editSubsidiary">{t('users.addDialog.subsidiary')}</Label>
                <Select
                  value={editUser.subsidiaryId || '__none__'}
                  onValueChange={(value: string) => setEditUser({ ...editUser, subsidiaryId: value === '__none__' ? '' : value, directionId: '', serviceId: '' })}
                  disabled={!editUser.enterpriseId}
                >
                  <SelectTrigger id="editSubsidiary">
                    <SelectValue placeholder={t('users.addDialog.subsidiaryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('users.addDialog.noSubsidiary')}</SelectItem>
                    {subsidiariesFor(editUser.enterpriseId).map((sub: any) => (
                      <SelectItem key={sub.id} value={String(sub.id)}>{sub.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="editDirection">{t('users.editDialog.direction')}</Label>
              <Select
                value={editUser.directionId || '__none__'}
                onValueChange={(value: string) => setEditUser({ ...editUser, directionId: value === '__none__' ? '' : value, serviceId: '' })}
                disabled={!editUser.enterpriseId}
              >
                <SelectTrigger id="editDirection">
                  <SelectValue placeholder={t('users.addDialog.directionPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('users.editDialog.none')}</SelectItem>
                  {directionsFor(editUser.enterpriseId, editUser.subsidiaryId)
                    .map((d: any) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editService">{t('users.editDialog.service')}</Label>
              <Select
                value={editUser.serviceId || '__none__'}
                onValueChange={(value: string) => setEditUser({ ...editUser, serviceId: value === '__none__' ? '' : value })}
                disabled={!editUser.directionId}
              >
                <SelectTrigger id="editService">
                  <SelectValue placeholder={t('users.addDialog.servicePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('users.addDialog.none')}</SelectItem>
                  {services
                    .filter((s: any) => !editUser.directionId || Number(s.direction_id) === Number(editUser.directionId))
                    .map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {AGENT_LIKE_ROLES.includes(editUser.role) && (
              <div className="space-y-2">
                <Label htmlFor="editSupervisor">{t('users.editDialog.supervisor')}</Label>
                <Select
                  value={editUser.supervisorId || '__none__'}
                  onValueChange={(value: string) => setEditUser({ ...editUser, supervisorId: value === '__none__' ? '' : value })}
                >
                  <SelectTrigger id="editSupervisor">
                    <SelectValue placeholder={t('users.addDialog.none')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('users.addDialog.none')}</SelectItem>
                    {supervisorOptions.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="editIsActive"
                checked={editUser.isActive}
                onChange={(e) => setEditUser({ ...editUser, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="editIsActive">{t('users.editDialog.activeAccount')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={updateMutation.isPending}>
              {t('users.editDialog.cancel')}
            </Button>
            <Button onClick={handleUpdateUser} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('users.editDialog.saving') : t('users.editDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => (open ? setIsImportDialogOpen(true) : closeImportDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.importDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('users.importDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="importFile">{t('users.importDialog.fileLabel')}</Label>
              <Input
                id="importFile"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null)
                  setImportResult(null)
                }}
              />
            </div>

            {importResult && (
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3 text-sm">
                <p className="font-medium">
                  {t('users.importDialog.resultSummary', {
                    created: importResult.created,
                    skipped: importResult.skipped,
                    errors: importResult.errors,
                    total: importResult.totalRows,
                  })}
                </p>
                {importResult.results
                  .filter((r: any) => r.status !== 'created')
                  .map((r: any, i: number) => (
                    <div key={i} className="flex justify-between gap-2">
                      <span>{t('users.importDialog.lineLabel', { line: r.line, email: r.email || t('users.importDialog.missingEmail') })}</span>
                      <span className={r.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                        {r.status === 'error' ? r.message : t('users.importDialog.alreadyExists')}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeImportDialog} disabled={importMutation.isPending}>
              {t('users.importDialog.close')}
            </Button>
            <Button onClick={handleImportSubmit} disabled={!importFile || importMutation.isPending}>
              {importMutation.isPending ? t('users.importDialog.importing') : t('users.importDialog.importButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailConfirmDialog
        pendingNotification={pendingNotification}
        onOpenChange={(open) => !open && setPendingNotification(null)}
      />

      {/* Manage Job Titles Dialog */}
      <Dialog
        open={isJobTitlesDialogOpen}
        onOpenChange={(open) => {
          setIsJobTitlesDialogOpen(open)
          if (!open) {
            setEditingJobTitleId(null)
            setNewJobTitleLabel('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.jobTitles.manageDialog.title')}</DialogTitle>
            <DialogDescription>{t('users.jobTitles.manageDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {jobTitles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('users.jobTitles.manageDialog.none')}</p>
            ) : (
              jobTitles.map((jt: any) => (
                <div key={jt.id} className="flex items-center gap-2 p-2 rounded-md border">
                  {editingJobTitleId === jt.id ? (
                    <>
                      <Input
                        value={editingJobTitleLabel}
                        onChange={(e) => setEditingJobTitleLabel(e.target.value)}
                        className="h-8"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        disabled={!editingJobTitleLabel.trim() || updateJobTitleMutation.isPending}
                        onClick={() => updateJobTitleMutation.mutate({ id: jt.id, label: editingJobTitleLabel.trim() })}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setEditingJobTitleId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{jt.label}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          setEditingJobTitleId(jt.id)
                          setEditingJobTitleLabel(jt.label)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setJobTitlePendingDelete(jt)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Input
              value={newJobTitleLabel}
              onChange={(e) => setNewJobTitleLabel(e.target.value)}
              placeholder={t('users.jobTitles.manageDialog.addPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newJobTitleLabel.trim()) {
                  createJobTitleMutation.mutate(newJobTitleLabel.trim())
                }
              }}
            />
            <Button
              disabled={!newJobTitleLabel.trim() || createJobTitleMutation.isPending}
              onClick={() => createJobTitleMutation.mutate(newJobTitleLabel.trim())}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsJobTitlesDialogOpen(false)}>
              {t('users.jobTitles.manageDialog.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!userPendingDelete}
        onOpenChange={(open) => !open && setUserPendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('users.confirmDelete', { name: userPendingDelete?.display_name || userPendingDelete?.email })}
        onConfirm={() => {
          if (userPendingDelete) {
            deleteMutation.mutate(userPendingDelete.id)
          }
          setUserPendingDelete(null)
        }}
      />

      <ConfirmDialog
        open={!!jobTitlePendingDelete}
        onOpenChange={(open) => !open && setJobTitlePendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('users.jobTitles.manageDialog.confirmDelete', { label: jobTitlePendingDelete?.label })}
        onConfirm={() => {
          if (jobTitlePendingDelete) {
            deleteJobTitleMutation.mutate(jobTitlePendingDelete.id)
          }
          setJobTitlePendingDelete(null)
        }}
      />
    </div>
  )
}
