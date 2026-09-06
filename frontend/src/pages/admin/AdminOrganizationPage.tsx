import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/loading'
import { QueryError } from '@/components/ui/query-error'
import { useToast } from '@/components/ui/use-toast'
import {
  Building2,
  Users,
  BookOpen,
  Settings,
  Globe,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Edit,
  Palette,
  Server,
  Upload,
  Loader2,
} from 'lucide-react'
import { api } from '@/services/api'
import { fileService } from '@/services/file.service'
import { formatDate } from '@/lib/utils'

interface Organization {
  id: number
  name: string
  slug: string
  description: string
  logo: string | null
  primaryColor: string
  secondaryColor: string
  contactEmail: string
  contactPhone: string
  address: string
  website: string
  settings: {
    allowSelfRegistration: boolean
    defaultLanguage: string
    timezone: string
    enableNotifications: boolean
    enableChat: boolean
    enableLiveSessions: boolean
    maxUsersPerGroup: number
    certificateValidity: number
  }
  stats: {
    totalUsers: number
    totalCourses: number
    totalEnrollments: number
    activeUsers: number
  }
  createdAt: string
}

export default function AdminOrganizationPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    logo: '',
    primaryColor: '#3B82F6',
    secondaryColor: '#10B981',
    contactEmail: '',
    contactPhone: '',
    address: '',
    website: '',
  })
  const [settingsData, setSettingsData] = useState({
    allowSelfRegistration: true,
    defaultLanguage: 'fr',
    timezone: 'Europe/Paris',
    enableNotifications: true,
    enableChat: true,
    enableLiveSessions: true,
    maxUsersPerGroup: 50,
    certificateValidity: 365,
  })

  const { data: organization, isLoading, error, refetch } = useQuery<Organization>({
    queryKey: ['organization'],
    queryFn: async () => {
      const response = await api.get('/organizations/current')
      return response.data.data
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await api.put('/organizations/current', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      setIsEditDialogOpen(false)
      toast({ title: tCommon('status.success'), description: t('organization.toasts.updatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('organization.toasts.updateErrorDescription'), variant: 'destructive' })
    },
  })

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: typeof settingsData) => {
      await api.put('/organizations/current/settings', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      setIsSettingsDialogOpen(false)
      toast({ title: tCommon('status.success'), description: t('organization.toasts.settingsUpdatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('organization.toasts.settingsUpdateErrorDescription'), variant: 'destructive' })
    },
  })

  const handleLogoClick = () => {
    logoInputRef.current?.click()
  }

  const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({ title: tCommon('status.error'), description: t('organization.toasts.selectImageDescription'), variant: 'destructive' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: tCommon('status.error'), description: t('organization.toasts.imageTooLargeDescription'), variant: 'destructive' })
      return
    }

    setIsUploadingLogo(true)
    try {
      const uploaded = await fileService.uploadFile(file, undefined, 'logos')
      setFormData((prev) => ({ ...prev, logo: `/uploads/${uploaded.path}` }))
    } catch (error: any) {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('organization.toasts.logoUploadErrorDescription'),
        variant: 'destructive',
      })
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleEditClick = () => {
    if (organization) {
      setFormData({
        name: organization.name,
        description: organization.description,
        logo: organization.logo || '',
        primaryColor: organization.primaryColor,
        secondaryColor: organization.secondaryColor,
        contactEmail: organization.contactEmail,
        contactPhone: organization.contactPhone,
        address: organization.address,
        website: organization.website,
      })
    }
    setIsEditDialogOpen(true)
  }

  const handleSettingsClick = () => {
    if (organization?.settings) {
      setSettingsData(organization.settings)
    }
    setIsSettingsDialogOpen(true)
  }

  if (isLoading) {
    return <PageLoading />
  }

  if (error || !organization) {
    return <QueryError onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('organization.title')}</h1>
          <p className="text-muted-foreground">{t('organization.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSettingsClick}>
            <Settings className="h-4 w-4 mr-2" />
            {t('organization.settingsButton')}
          </Button>
          <Button onClick={handleEditClick}>
            <Edit className="h-4 w-4 mr-2" />
            {t('organization.edit')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{organization.stats?.totalUsers || 0}</p>
                <p className="text-sm text-muted-foreground">{t('organization.stats.users')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{organization.stats?.totalCourses || 0}</p>
                <p className="text-sm text-muted-foreground">{t('organization.stats.courses')}</p>
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
                <p className="text-2xl font-bold">{organization.stats?.activeUsers || 0}</p>
                <p className="text-sm text-muted-foreground">{t('organization.stats.activeThisMonth')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{organization.stats?.totalEnrollments || 0}</p>
                <p className="text-sm text-muted-foreground">{t('organization.stats.enrollments')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organization Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t('organization.generalInfo.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center">
                {organization.logo ? (
                  <img src={organization.logo} alt={organization.name} className="h-16 w-16 object-contain" />
                ) : (
                  <Building2 className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div>
                <h3 className="text-xl font-semibold">{organization.name}</h3>
                <p className="text-sm text-muted-foreground">{organization.slug}</p>
              </div>
            </div>
            <p className="text-muted-foreground">{organization.description}</p>
            <div className="pt-4 border-t space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {organization.contactEmail}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {organization.contactPhone}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {organization.address}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <a href={organization.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {organization.website}
                </a>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {t('organization.generalInfo.createdOn', { date: formatDate(organization.createdAt) })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {t('organization.customization.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('organization.customization.primaryColor')}</Label>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg border"
                  style={{ backgroundColor: organization.primaryColor }}
                />
                <span className="font-mono text-sm">{organization.primaryColor}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('organization.customization.secondaryColor')}</Label>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg border"
                  style={{ backgroundColor: organization.secondaryColor }}
                />
                <span className="font-mono text-sm">{organization.secondaryColor}</span>
              </div>
            </div>
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-3">{t('organization.customization.preview')}</h4>
              <div className="space-y-2">
                <Button style={{ backgroundColor: organization.primaryColor }}>
                  {t('organization.customization.primaryButton')}
                </Button>
                <Button variant="outline" style={{ borderColor: organization.secondaryColor, color: organization.secondaryColor }}>
                  {t('organization.customization.secondaryButton')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              {t('organization.platformSettings.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('organization.platformSettings.selfRegistration.title')}</span>
                  <Badge variant={organization.settings?.allowSelfRegistration ? 'default' : 'secondary'}>
                    {organization.settings?.allowSelfRegistration ? t('organization.platformSettings.enabled') : t('organization.platformSettings.disabled')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('organization.platformSettings.selfRegistration.description')}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('organization.platformSettings.notifications.title')}</span>
                  <Badge variant={organization.settings?.enableNotifications ? 'default' : 'secondary'}>
                    {organization.settings?.enableNotifications ? t('organization.platformSettings.enabled') : t('organization.platformSettings.disabled')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('organization.platformSettings.notifications.description')}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('organization.platformSettings.chat.title')}</span>
                  <Badge variant={organization.settings?.enableChat ? 'default' : 'secondary'}>
                    {organization.settings?.enableChat ? t('organization.platformSettings.enabled') : t('organization.platformSettings.disabled')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('organization.platformSettings.chat.description')}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('organization.platformSettings.liveSessions.title')}</span>
                  <Badge variant={organization.settings?.enableLiveSessions ? 'default' : 'secondary'}>
                    {organization.settings?.enableLiveSessions ? t('organization.platformSettings.enabled') : t('organization.platformSettings.disabled')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('organization.platformSettings.liveSessions.description')}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('organization.platformSettings.language.title')}</span>
                  <Badge variant="outline">{organization.settings?.defaultLanguage?.toUpperCase()}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('organization.platformSettings.language.description')}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('organization.platformSettings.timezone.title')}</span>
                  <Badge variant="outline">{organization.settings?.timezone}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('organization.platformSettings.timezone.description')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('organization.editDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>{t('organization.editDialog.logo')}</Label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-lg border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {formData.logo ? (
                    <img src={formData.logo} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <Button type="button" variant="outline" onClick={handleLogoClick} disabled={isUploadingLogo}>
                  {isUploadingLogo ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {formData.logo ? t('organization.editDialog.changeLogo') : t('organization.editDialog.uploadLogo')}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-name">{t('organization.editDialog.name')}</Label>
              <Input
                id="org-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-description">{t('organization.editDialog.description')}</Label>
              <Textarea
                id="org-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="org-contact-email">{t('organization.editDialog.contactEmail')}</Label>
                <Input
                  id="org-contact-email"
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-phone">{t('organization.editDialog.phone')}</Label>
                <Input
                  id="org-phone"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-address">{t('organization.editDialog.address')}</Label>
              <Input
                id="org-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-website">{t('organization.editDialog.website')}</Label>
              <Input
                id="org-website"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="org-primary-color">{t('organization.editDialog.primaryColor')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="org-primary-color"
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                    className="w-20 h-10 p-1"
                  />
                  <Input
                    value={formData.primaryColor}
                    onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-secondary-color">{t('organization.editDialog.secondaryColor')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="org-secondary-color"
                    type="color"
                    value={formData.secondaryColor}
                    onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                    className="w-20 h-10 p-1"
                  />
                  <Input
                    value={formData.secondaryColor}
                    onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t('organization.editDialog.cancel')}
            </Button>
            <Button onClick={() => updateMutation.mutate(formData)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('organization.editDialog.saving') : t('organization.editDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('organization.settingsDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="org-self-registration">{t('organization.settingsDialog.selfRegistration')}</Label>
              <input
                id="org-self-registration"
                type="checkbox"
                checked={settingsData.allowSelfRegistration}
                onChange={(e) => setSettingsData({ ...settingsData, allowSelfRegistration: e.target.checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="org-enable-notifications">{t('organization.settingsDialog.notifications')}</Label>
              <input
                id="org-enable-notifications"
                type="checkbox"
                checked={settingsData.enableNotifications}
                onChange={(e) => setSettingsData({ ...settingsData, enableNotifications: e.target.checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="org-enable-chat">{t('organization.settingsDialog.chat')}</Label>
              <input
                id="org-enable-chat"
                type="checkbox"
                checked={settingsData.enableChat}
                onChange={(e) => setSettingsData({ ...settingsData, enableChat: e.target.checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="org-enable-live-sessions">{t('organization.settingsDialog.liveSessions')}</Label>
              <input
                id="org-enable-live-sessions"
                type="checkbox"
                checked={settingsData.enableLiveSessions}
                onChange={(e) => setSettingsData({ ...settingsData, enableLiveSessions: e.target.checked })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-max-users-per-group">{t('organization.settingsDialog.maxUsersPerGroup')}</Label>
              <Input
                id="org-max-users-per-group"
                type="number"
                value={settingsData.maxUsersPerGroup}
                onChange={(e) => setSettingsData({ ...settingsData, maxUsersPerGroup: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-certificate-validity">{t('organization.settingsDialog.certificateValidity')}</Label>
              <Input
                id="org-certificate-validity"
                type="number"
                value={settingsData.certificateValidity}
                onChange={(e) => setSettingsData({ ...settingsData, certificateValidity: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsDialogOpen(false)}>
              {t('organization.settingsDialog.cancel')}
            </Button>
            <Button onClick={() => updateSettingsMutation.mutate(settingsData)} disabled={updateSettingsMutation.isPending}>
              {updateSettingsMutation.isPending ? t('organization.settingsDialog.saving') : t('organization.settingsDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
