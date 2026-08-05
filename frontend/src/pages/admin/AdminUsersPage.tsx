import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
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
import { useToast } from '@/components/ui/use-toast'
import { getInitials, formatRelativeTime } from '@/lib/utils'
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
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/services/api'

export default function AdminUsersPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: '',
    enterpriseId: '',
    directionId: '',
    serviceId: '',
  })
  const [editUser, setEditUser] = useState({
    displayName: '',
    role: '',
    enterpriseId: '',
    directionId: '',
    serviceId: '',
    isActive: true,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', { search, role: roleFilter, status: statusFilter }],
    queryFn: () => api.users.list({ search, role: roleFilter !== 'all' ? roleFilter : undefined }),
  })

  // Fetch enterprises, directions, and services
  const { data: enterprises = [] } = useQuery({
    queryKey: ['enterprises'],
    queryFn: () => api.organizations.getEnterprises(),
  })

  const { data: directions = [] } = useQuery({
    queryKey: ['directions'],
    queryFn: () => api.organizations.getDirections(),
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.organizations.getServices(),
  })

  const createMutation = useMutation({
    mutationFn: (userData: any) => api.users.create(userData),
    onSuccess: () => {
      toast({ title: 'Utilisateur créé', description: 'Le compte a été créé avec succès' })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setIsAddDialogOpen(false)
      setNewUser({ firstName: '', lastName: '', email: '', password: '', role: '', enterpriseId: '', directionId: '', serviceId: '' })
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.error?.message || 'Impossible de créer l\'utilisateur', 
        variant: 'destructive' 
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => api.users.delete(userId),
    onSuccess: () => {
      toast({ title: 'Utilisateur supprimé', description: 'L\'utilisateur a été supprimé avec succès' })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Impossible de supprimer', variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: any }) => api.users.update(userId, data),
    onSuccess: () => {
      toast({ title: 'Utilisateur modifié', description: 'Les modifications ont été enregistrées' })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setIsEditDialogOpen(false)
      setSelectedUser(null)
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.error?.message || 'Impossible de modifier l\'utilisateur', 
        variant: 'destructive' 
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
      toast({ title: 'Import terminé', description: `${data.created} utilisateur(s) créé(s)` })
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || "Impossible d'importer le fichier",
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
      enterpriseId: user.enterprise_id ? String(user.enterprise_id) : '',
      directionId: user.direction_id ? String(user.direction_id) : '',
      serviceId: user.service_id ? String(user.service_id) : '',
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
        enterpriseId: editUser.enterpriseId ? parseInt(editUser.enterpriseId) : null,
        directionId: editUser.directionId ? parseInt(editUser.directionId) : null,
        serviceId: editUser.serviceId ? parseInt(editUser.serviceId) : null,
        isActive: editUser.isActive,
      },
    })
  }

  const handleSendEmail = (user: any) => {
    window.location.href = `mailto:${user.email}`
  }

  const handleDeleteUser = (user: any) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer ${user.display_name || user.email} ?`)) {
      deleteMutation.mutate(user.id)
    }
  }

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.role || !newUser.firstName || !newUser.lastName) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs obligatoires', variant: 'destructive' })
      return
    }
    
    createMutation.mutate({
      email: newUser.email,
      password: newUser.password,
      displayName: `${newUser.firstName} ${newUser.lastName}`,
      role: newUser.role,
      enterpriseId: newUser.enterpriseId ? parseInt(newUser.enterpriseId) : undefined,
      directionId: newUser.directionId ? parseInt(newUser.directionId) : undefined,
      serviceId: newUser.serviceId ? parseInt(newUser.serviceId) : undefined,
    })
  }

  if (isLoading) {
    return <PageLoading />
  }

  const users = data?.data || [
    {
      id: '1',
      firstName: 'Marie',
      lastName: 'Uokak',
      email: 'marie.dupont@company.com',
      role: 'admin',
      status: 'active',
      organization: 'Direction IT',
      avatar: '/avatars/1.jpg',
      lastLogin: new Date(),
      createdAt: new Date(Date.now() - 90 * 86400000),
    },
    {
      id: '2',
      firstName: 'Thomas',
      lastName: 'Martin',
      email: 'thomas.martin@company.com',
      role: 'manager',
      status: 'active',
      organization: 'Direction RH',
      avatar: '/avatars/2.jpg',
      lastLogin: new Date(Date.now() - 2 * 86400000),
      createdAt: new Date(Date.now() - 60 * 86400000),
    },
    {
      id: '3',
      firstName: 'Sophie',
      lastName: 'Laurent',
      email: 'sophie.laurent@company.com',
      role: 'agent',
      status: 'inactive',
      organization: 'Direction Marketing',
      avatar: '/avatars/3.jpg',
      lastLogin: new Date(Date.now() - 30 * 86400000),
      createdAt: new Date(Date.now() - 120 * 86400000),
    },
  ]

  const roleLabels: Record<string, string> = {
    admin: 'Administrateur',
    director: 'Directeur',
    manager: 'Manager',
    supervisor: 'Superviseur',
    agent: 'Agent',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestion des utilisateurs</h1>
          <p className="text-muted-foreground">
            {users.length} utilisateurs au total
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importer
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouvel utilisateur</DialogTitle>
                <DialogDescription>
                  Créez un nouveau compte utilisateur
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Prénom *</Label>
                    <Input 
                      id="firstName" 
                      placeholder="Jean" 
                      value={newUser.firstName}
                      onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Nom *</Label>
                    <Input 
                      id="lastName" 
                      placeholder="Dupont"
                      value={newUser.lastName}
                      onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="jean.dupont@company.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe *</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="Minimum 8 caractères"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Rôle *</Label>
                  <Select value={newUser.role} onValueChange={(value: string) => setNewUser({ ...newUser, role: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrateur</SelectItem>
                      <SelectItem value="director">Directeur</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="supervisor">Superviseur</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enterprise">Entreprise</Label>
                  <Select 
                    value={newUser.enterpriseId} 
                    onValueChange={(value: string) => setNewUser({ ...newUser, enterpriseId: value, directionId: '', serviceId: '' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une entreprise" />
                    </SelectTrigger>
                    <SelectContent>
                      {enterprises.map((e: any) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="direction">Direction</Label>
                  <Select 
                    value={newUser.directionId} 
                    onValueChange={(value: string) => setNewUser({ ...newUser, directionId: value, serviceId: '' })}
                    disabled={!newUser.enterpriseId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une direction" />
                    </SelectTrigger>
                    <SelectContent>
                      {directions
                        .filter((d: any) => !newUser.enterpriseId || d.enterprise_id === parseInt(newUser.enterpriseId))
                        .map((d: any) => (
                          <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service">Service</Label>
                  <Select 
                    value={newUser.serviceId} 
                    onValueChange={(value: string) => setNewUser({ ...newUser, serviceId: value })}
                    disabled={!newUser.directionId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un service" />
                    </SelectTrigger>
                    <SelectContent>
                      {services
                        .filter((s: any) => !newUser.directionId || s.direction_id === parseInt(newUser.directionId))
                        .map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={createMutation.isPending}>
                  Annuler
                </Button>
                <Button onClick={handleCreateUser} disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Création...' : 'Créer'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou email..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tous les rôles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rôles</SelectItem>
            <SelectItem value="admin">Administrateur</SelectItem>
            <SelectItem value="director">Directeur</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="supervisor">Superviseur</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="inactive">Inactif</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
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
                  <th className="text-left p-4 font-medium">Utilisateur</th>
                  <th className="text-left p-4 font-medium">Entreprise</th>
                  <th className="text-left p-4 font-medium">Direction</th>
                  <th className="text-left p-4 font-medium">Service</th>
                  <th className="text-left p-4 font-medium">Rôle</th>
                  <th className="text-left p-4 font-medium">Statut</th>
                  <th className="text-left p-4 font-medium">Dernière connexion</th>
                  <th className="text-right p-4 font-medium">Actions</th>
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
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-sm">{user.enterprise_name || '-'}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-sm">{user.direction_name || '-'}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-sm">{user.service_name || '-'}</span>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline">
                        <Shield className="h-3 w-3 mr-1" />
                        {roleLabels[user.role] || user.role}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge className={user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {user.is_active ? 'Actif' : 'Inactif'}
                      </Badge>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {user.lastLogin ? formatRelativeTime(user.lastLogin) : user.created_at ? formatRelativeTime(user.created_at) : '-'}
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
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSendEmail(user)}>
                            <Mail className="h-4 w-4 mr-2" />
                            Envoyer un email
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteUser(user)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'utilisateur</DialogTitle>
            <DialogDescription>
              Modifier les informations de {selectedUser?.display_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editDisplayName">Nom complet</Label>
              <Input 
                id="editDisplayName" 
                value={editUser.displayName}
                onChange={(e) => setEditUser({ ...editUser, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editRole">Rôle</Label>
              <Select value={editUser.role} onValueChange={(value: string) => setEditUser({ ...editUser, role: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un rôle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrateur</SelectItem>
                  <SelectItem value="director">Directeur</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="supervisor">Superviseur</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEnterprise">Entreprise</Label>
              <Select 
                value={editUser.enterpriseId || '__none__'} 
                onValueChange={(value: string) => setEditUser({ ...editUser, enterpriseId: value === '__none__' ? '' : value, directionId: '', serviceId: '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une entreprise" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucune</SelectItem>
                  {enterprises.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editDirection">Direction</Label>
              <Select 
                value={editUser.directionId || '__none__'} 
                onValueChange={(value: string) => setEditUser({ ...editUser, directionId: value === '__none__' ? '' : value, serviceId: '' })}
                disabled={!editUser.enterpriseId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucune</SelectItem>
                  {directions
                    .filter((d: any) => !editUser.enterpriseId || d.enterprise_id === parseInt(editUser.enterpriseId))
                    .map((d: any) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editService">Service</Label>
              <Select 
                value={editUser.serviceId || '__none__'} 
                onValueChange={(value: string) => setEditUser({ ...editUser, serviceId: value === '__none__' ? '' : value })}
                disabled={!editUser.directionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun</SelectItem>
                  {services
                    .filter((s: any) => !editUser.directionId || s.direction_id === parseInt(editUser.directionId))
                    .map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="editIsActive"
                checked={editUser.isActive}
                onChange={(e) => setEditUser({ ...editUser, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="editIsActive">Compte actif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={updateMutation.isPending}>
              Annuler
            </Button>
            <Button onClick={handleUpdateUser} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => (open ? setIsImportDialogOpen(true) : closeImportDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importer des utilisateurs (CSV)</DialogTitle>
            <DialogDescription>
              Colonnes attendues : email, displayName, role, enterpriseCode, directionCode, serviceCode
              (les colonnes *Code sont facultatives). Un mot de passe temporaire est généré et envoyé par email.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="importFile">Fichier CSV</Label>
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
                  {importResult.created} créé(s), {importResult.skipped} ignoré(s), {importResult.errors} erreur(s)
                  {' '}sur {importResult.totalRows} ligne(s)
                </p>
                {importResult.results
                  .filter((r: any) => r.status !== 'created')
                  .map((r: any, i: number) => (
                    <div key={i} className="flex justify-between gap-2">
                      <span>Ligne {r.line} — {r.email || '(email manquant)'}</span>
                      <span className={r.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                        {r.status === 'error' ? r.message : 'déjà existant'}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeImportDialog} disabled={importMutation.isPending}>
              Fermer
            </Button>
            <Button onClick={handleImportSubmit} disabled={!importFile || importMutation.isPending}>
              {importMutation.isPending ? 'Import en cours...' : 'Importer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
