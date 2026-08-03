import { useRef, useState, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/loading'
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

  const { data: organization, isLoading } = useQuery<Organization>({
    queryKey: ['organization'],
    queryFn: async () => {
      const response = await api.get('/organizations/current')
      return response.data.data || {
        id: 1,
        name: 'Mon Organisation',
        slug: 'mon-org',
        description: 'Plateforme de formation en ligne',
        logo: null,
        primaryColor: '#3B82F6',
        secondaryColor: '#10B981',
        contactEmail: 'contact@example.com',
        contactPhone: '+33 1 23 45 67 89',
        address: '123 Rue Example, 75001 Paris',
        website: 'https://example.com',
        settings: {
          allowSelfRegistration: true,
          defaultLanguage: 'fr',
          timezone: 'Europe/Paris',
          enableNotifications: true,
          enableChat: true,
          enableLiveSessions: true,
          maxUsersPerGroup: 50,
          certificateValidity: 365,
        },
        stats: {
          totalUsers: 150,
          totalCourses: 25,
          totalEnrollments: 450,
          activeUsers: 85,
        },
        createdAt: '2024-01-01T00:00:00Z',
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await api.put('/organizations/current', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      setIsEditDialogOpen(false)
      toast({ title: 'Succès', description: 'Organisation mise à jour' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la mise à jour', variant: 'destructive' })
    },
  })

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: typeof settingsData) => {
      await api.put('/organizations/current/settings', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      setIsSettingsDialogOpen(false)
      toast({ title: 'Succès', description: 'Paramètres mis à jour' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la mise à jour', variant: 'destructive' })
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
      toast({ title: 'Erreur', description: 'Veuillez sélectionner une image', variant: 'destructive' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Erreur', description: "L'image ne doit pas dépasser 5 Mo", variant: 'destructive' })
      return
    }

    setIsUploadingLogo(true)
    try {
      const uploaded = await fileService.uploadFile(file, undefined, 'logos')
      setFormData((prev) => ({ ...prev, logo: `/uploads/${uploaded.path}` }))
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || "Impossible d'uploader le logo",
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

  if (isLoading || !organization) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuration de l'organisation</h1>
          <p className="text-muted-foreground">Gérez les paramètres de votre organisation</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSettingsClick}>
            <Settings className="h-4 w-4 mr-2" />
            Paramètres
          </Button>
          <Button onClick={handleEditClick}>
            <Edit className="h-4 w-4 mr-2" />
            Modifier
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
                <p className="text-sm text-muted-foreground">Utilisateurs</p>
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
                <p className="text-sm text-muted-foreground">Cours</p>
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
                <p className="text-sm text-muted-foreground">Actifs ce mois</p>
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
                <p className="text-sm text-muted-foreground">Inscriptions</p>
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
              Informations générales
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
                Créé le {formatDate(organization.createdAt)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Personnalisation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Couleur principale</Label>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg border"
                  style={{ backgroundColor: organization.primaryColor }}
                />
                <span className="font-mono text-sm">{organization.primaryColor}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Couleur secondaire</Label>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg border"
                  style={{ backgroundColor: organization.secondaryColor }}
                />
                <span className="font-mono text-sm">{organization.secondaryColor}</span>
              </div>
            </div>
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-3">Aperçu</h4>
              <div className="space-y-2">
                <Button style={{ backgroundColor: organization.primaryColor }}>
                  Bouton principal
                </Button>
                <Button variant="outline" style={{ borderColor: organization.secondaryColor, color: organization.secondaryColor }}>
                  Bouton secondaire
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Paramètres de la plateforme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Inscription libre</span>
                  <Badge variant={organization.settings?.allowSelfRegistration ? 'default' : 'secondary'}>
                    {organization.settings?.allowSelfRegistration ? 'Activé' : 'Désactivé'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Les utilisateurs peuvent créer un compte
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Notifications</span>
                  <Badge variant={organization.settings?.enableNotifications ? 'default' : 'secondary'}>
                    {organization.settings?.enableNotifications ? 'Activé' : 'Désactivé'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Notifications push et email
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Chat</span>
                  <Badge variant={organization.settings?.enableChat ? 'default' : 'secondary'}>
                    {organization.settings?.enableChat ? 'Activé' : 'Désactivé'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Messagerie entre utilisateurs
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Sessions live</span>
                  <Badge variant={organization.settings?.enableLiveSessions ? 'default' : 'secondary'}>
                    {organization.settings?.enableLiveSessions ? 'Activé' : 'Désactivé'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Webinaires et sessions en direct
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Langue</span>
                  <Badge variant="outline">{organization.settings?.defaultLanguage?.toUpperCase()}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Langue par défaut
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Fuseau horaire</span>
                  <Badge variant="outline">{organization.settings?.timezone}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pour les sessions planifiées
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
            <DialogTitle>Modifier l'organisation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Logo</Label>
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
                  {formData.logo ? 'Changer le logo' : 'Uploader un logo'}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email de contact</Label>
                <Input
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Adresse</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Site web</Label>
              <Input
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Couleur principale</Label>
                <div className="flex gap-2">
                  <Input
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
                <Label>Couleur secondaire</Label>
                <div className="flex gap-2">
                  <Input
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
              Annuler
            </Button>
            <Button onClick={() => updateMutation.mutate(formData)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paramètres de la plateforme</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Inscription libre</Label>
              <input
                type="checkbox"
                checked={settingsData.allowSelfRegistration}
                onChange={(e) => setSettingsData({ ...settingsData, allowSelfRegistration: e.target.checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Notifications</Label>
              <input
                type="checkbox"
                checked={settingsData.enableNotifications}
                onChange={(e) => setSettingsData({ ...settingsData, enableNotifications: e.target.checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Chat</Label>
              <input
                type="checkbox"
                checked={settingsData.enableChat}
                onChange={(e) => setSettingsData({ ...settingsData, enableChat: e.target.checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Sessions live</Label>
              <input
                type="checkbox"
                checked={settingsData.enableLiveSessions}
                onChange={(e) => setSettingsData({ ...settingsData, enableLiveSessions: e.target.checked })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max utilisateurs par groupe</Label>
              <Input
                type="number"
                value={settingsData.maxUsersPerGroup}
                onChange={(e) => setSettingsData({ ...settingsData, maxUsersPerGroup: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Validité certificats (jours)</Label>
              <Input
                type="number"
                value={settingsData.certificateValidity}
                onChange={(e) => setSettingsData({ ...settingsData, certificateValidity: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => updateSettingsMutation.mutate(settingsData)} disabled={updateSettingsMutation.isPending}>
              {updateSettingsMutation.isPending ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
