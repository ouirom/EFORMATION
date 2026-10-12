import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/loading'
import { QueryError } from '@/components/ui/query-error'
import { useToast } from '@/components/ui/use-toast'
import {
  Building2,
  Users,
  BookOpen,
  Globe,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Edit,
  Palette,
  Upload,
  Loader2,
} from 'lucide-react'
import { api } from '@/services/api'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsTab } from './organization/SettingsTab'
import { StructureTab } from './organization/StructureTab'
import { IntegrationsTab } from './organization/IntegrationsTab'
import { HistoryTab } from './organization/HistoryTab'
import { ExternalThemeContrastWarnings, ExternalThemeFields, ExternalThemePreview } from './organization/ExternalThemeFields'
import { SidebarColorFields, SidebarColorPreview, SidebarContrastWarnings } from './organization/SidebarColorFields'
import { COMPLIANCE_GROUPS, LEARNING_GROUPS, PLATFORM_GROUPS, SECURITY_GROUPS } from './organization/settingsFields'

// Tabs of the organization settings page; the active one is kept in ?tab= so it
// survives a reload and can be linked to (e.g. ?tab=structure).
const TABS = ['general', 'platform', 'security', 'learning', 'structure', 'integrations', 'compliance', 'history'] as const
type TabKey = (typeof TABS)[number]
import { fileService } from '@/services/file.service'
import { formatDate } from '@/lib/utils'
import { DEFAULT_EXTERNAL_ACCENT_COLOR, DEFAULT_EXTERNAL_SURFACE_COLOR, isHexColor } from '@/lib/externalTheme'

interface Organization {
  id: number
  name: string
  slug: string
  description: string
  logo: string | null
  primaryColor: string
  secondaryColor: string
  /** Partner theme of external participants (defaults applied by the server). */
  externalAccentColor: string
  externalSurfaceColor: string
  /** Staff side menu color; null = default look (follows light/dark mode). */
  sidebarColor: string | null
  contactEmail: string
  contactPhone: string
  address: string
  website: string
  /** Every platform setting (see settingsFields.ts); edited tab by tab. */
  settings: Record<string, any>
  settingsDefaults?: Record<string, any>
  stats: {
    totalUsers: number
    totalCourses: number
    totalEnrollments: number
    activeUsers: number
  }
  createdAt: string
}

export default function AdminOrganizationPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') as TabKey | null
  const tab: TabKey = requestedTab && (TABS as readonly string[]).includes(requestedTab) ? requestedTab : 'general'
  const changeTab = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'general') next.delete('tab')
    else next.set('tab', value)
    setSearchParams(next, { replace: true })
  }
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    logo: '',
    primaryColor: '#3B82F6',
    secondaryColor: '#10B981',
    externalAccentColor: DEFAULT_EXTERNAL_ACCENT_COLOR,
    externalSurfaceColor: DEFAULT_EXTERNAL_SURFACE_COLOR,
    // '' = default look (stored as null).
    sidebarColor: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    website: '',
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
      // The default partner colors are stored as "unset" (null), so they follow
      // any future change of the defaults.
      const asStored = (value: string, fallback: string) => (value.toUpperCase() === fallback ? null : value.toUpperCase())
      await api.put('/organizations/current', {
        ...data,
        externalAccentColor: asStored(data.externalAccentColor, DEFAULT_EXTERNAL_ACCENT_COLOR),
        externalSurfaceColor: asStored(data.externalSurfaceColor, DEFAULT_EXTERNAL_SURFACE_COLOR),
        sidebarColor: data.sidebarColor ? data.sidebarColor.toUpperCase() : null,
      })
    },
    onSuccess: () => {
      // Also repaints the real side menu (MainLayout reads the same query).
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      // The public branding carries the partner theme of /external/login.
      queryClient.invalidateQueries({ queryKey: ['branding'] })
      setIsEditDialogOpen(false)
      toast({ title: tCommon('status.success'), description: t('organization.toasts.updatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('organization.toasts.updateErrorDescription'), variant: 'destructive' })
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
        externalAccentColor: organization.externalAccentColor || DEFAULT_EXTERNAL_ACCENT_COLOR,
        externalSurfaceColor: organization.externalSurfaceColor || DEFAULT_EXTERNAL_SURFACE_COLOR,
        sidebarColor: organization.sidebarColor || '',
        contactEmail: organization.contactEmail,
        contactPhone: organization.contactPhone,
        address: organization.address,
        website: organization.website,
      })
    }
    setIsEditDialogOpen(true)
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
          <Button onClick={handleEditClick}>
            <Edit className="h-4 w-4 mr-2" />
            {t('organization.edit')}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="w-max">
            {TABS.map((key) => (
              <TabsTrigger key={key} value={key}>{t(`organization.tabs.${key}`)}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="general" className="space-y-6 mt-6">
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
            <div className="pt-4 border-t space-y-3" data-testid="sidebar-color-summary">
              <h4 className="font-medium">{t('organization.customization.sidebar.title')}</h4>
              <div className="flex items-center gap-3">
                {organization.sidebarColor ? (
                  <>
                    <div className="h-10 w-10 rounded-lg border" style={{ backgroundColor: organization.sidebarColor }} />
                    <span className="font-mono text-sm">{organization.sidebarColor}</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">{t('organization.customization.sidebar.modeDefault')}</span>
                )}
              </div>
              <SidebarContrastWarnings sidebar={organization.sidebarColor} primary={organization.primaryColor} />
              <SidebarColorPreview sidebar={organization.sidebarColor} primary={organization.primaryColor} />
            </div>
            <div className="pt-4 border-t space-y-3" data-testid="external-theme-summary">
              <h4 className="font-medium">{t('organization.customization.externalTheme.title')}</h4>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['accentColor', organization.externalAccentColor || DEFAULT_EXTERNAL_ACCENT_COLOR],
                    ['surfaceColor', organization.externalSurfaceColor || DEFAULT_EXTERNAL_SURFACE_COLOR],
                  ] as const
                ).map(([key, color]) => (
                  <div key={key} className="space-y-2">
                    <Label>{t(`organization.customization.externalTheme.${key}`)}</Label>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg border" style={{ backgroundColor: color }} />
                      <span className="font-mono text-sm">{color}</span>
                    </div>
                  </div>
                ))}
              </div>
              <ExternalThemeContrastWarnings
                accent={organization.externalAccentColor || DEFAULT_EXTERNAL_ACCENT_COLOR}
                surface={organization.externalSurfaceColor || DEFAULT_EXTERNAL_SURFACE_COLOR}
              />
              <ExternalThemePreview
                accent={organization.externalAccentColor || DEFAULT_EXTERNAL_ACCENT_COLOR}
                surface={organization.externalSurfaceColor || DEFAULT_EXTERNAL_SURFACE_COLOR}
              />
            </div>
          </CardContent>
        </Card>

      </div>
        </TabsContent>

        <TabsContent value="platform" className="mt-6">
          <SettingsTab groups={PLATFORM_GROUPS} settings={organization.settings} defaults={organization.settingsDefaults} />
        </TabsContent>
        <TabsContent value="security" className="mt-6">
          <SettingsTab groups={SECURITY_GROUPS} settings={organization.settings} defaults={organization.settingsDefaults} />
        </TabsContent>
        <TabsContent value="learning" className="mt-6">
          <SettingsTab groups={LEARNING_GROUPS} settings={organization.settings} defaults={organization.settingsDefaults} />
        </TabsContent>
        <TabsContent value="structure" className="mt-6">
          <StructureTab />
        </TabsContent>
        <TabsContent value="integrations" className="mt-6">
          <IntegrationsTab />
        </TabsContent>
        <TabsContent value="compliance" className="mt-6">
          <SettingsTab groups={COMPLIANCE_GROUPS} settings={organization.settings} defaults={organization.settingsDefaults} />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <HistoryTab />
        </TabsContent>
      </Tabs>

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
            <SidebarColorFields
              value={formData.sidebarColor}
              primary={formData.primaryColor}
              secondary={formData.secondaryColor}
              onChange={(sidebarColor) => setFormData((prev) => ({ ...prev, sidebarColor }))}
            />
            <ExternalThemeFields
              accent={formData.externalAccentColor}
              surface={formData.externalSurfaceColor}
              onChange={(colors) => setFormData((prev) => ({ ...prev, ...colors }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t('organization.editDialog.cancel')}
            </Button>
            <Button
              onClick={() => updateMutation.mutate(formData)}
              disabled={
                updateMutation.isPending ||
                !isHexColor(formData.externalAccentColor) ||
                !isHexColor(formData.externalSurfaceColor) ||
                (formData.sidebarColor !== '' && !isHexColor(formData.sidebarColor))
              }
            >
              {updateMutation.isPending ? t('organization.editDialog.saving') : t('organization.editDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
