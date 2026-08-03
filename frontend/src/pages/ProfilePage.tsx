import React, { useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getInitials, formatDate } from '@/lib/utils'
import {
  User,
  Mail,
  Building2,
  Calendar,
  BookOpen,
  Award,
  Clock,
  Edit,
  Camera,
  Star,
  TrendingUp,
  LogOut,
  Key,
  Save,
  Loader2,
} from 'lucide-react'
import { api } from '@/services/api'
import { fileService } from '@/services/file.service'
import { useNavigate } from 'react-router-dom'

export default function ProfilePage() {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    displayName: '',
    email: '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['profile-stats'],
    queryFn: async () => {
      try {
        const response = await api.get(`/users/${user?.id}/stats`);
        return response.data.data;
      } catch {
        return null;
      }
    },
    enabled: !!user?.id,
  })

  const { data: badges } = useQuery({
    queryKey: ['profile-badges'],
    queryFn: async () => {
      try {
        const response = await api.get('/badges/mine');
        return response.data.data;
      } catch {
        return { earned: [] };
      }
    },
  })

  const { data: certificates } = useQuery({
    queryKey: ['profile-certificates'],
    queryFn: async () => {
      try {
        const response = await api.get('/certificates/mine');
        return response.data.data;
      } catch {
        return [];
      }
    },
  })

  // Mutation pour mettre à jour le profil
  const updateProfileMutation = useMutation({
    mutationFn: (data: { displayName: string; email: string }) => 
      api.users.update(user!.id, data),
    onSuccess: (updatedUser) => {
      updateUser({ displayName: updatedUser.display_name, email: updatedUser.email })
      toast({ title: 'Succès', description: 'Profil mis à jour avec succès' })
      setIsEditDialogOpen(false)
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.error?.message || 'Impossible de mettre à jour le profil', 
        variant: 'destructive' 
      })
    },
  })

  // Mutation pour changer le mot de passe
  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => 
      api.post('/auth/change-password', data),
    onSuccess: () => {
      toast({ title: 'Succès', description: 'Mot de passe modifié avec succès' })
      setIsPasswordDialogOpen(false)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.error?.message || 'Impossible de modifier le mot de passe', 
        variant: 'destructive' 
      })
    },
  })

  const handleAvatarClick = () => {
    avatarInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner une image', variant: 'destructive' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Erreur', description: 'L\'image ne doit pas dépasser 5 Mo', variant: 'destructive' })
      return
    }

    setIsUploadingAvatar(true)
    try {
      const uploaded = await fileService.uploadFile(file, undefined, 'avatars')
      const avatarUrl = `/uploads/${uploaded.path}`
      const updatedUser = await api.users.update(user.id, { avatarUrl })
      updateUser({ avatarUrl: updatedUser.avatar_url ?? avatarUrl })
      toast({ title: 'Succès', description: 'Photo de profil mise à jour' })
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || 'Impossible de mettre à jour la photo',
        variant: 'destructive',
      })
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleOpenEditDialog = () => {
    setEditForm({
      displayName: user?.displayName || '',
      email: user?.email || '',
    })
    setIsEditDialogOpen(true)
  }

  const handleSaveProfile = () => {
    if (!editForm.displayName || !editForm.email) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' })
      return
    }
    updateProfileMutation.mutate(editForm)
  }

  const handleChangePassword = () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' })
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas', variant: 'destructive' })
      return
    }
    if (passwordForm.newPassword.length < 8) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 8 caractères', variant: 'destructive' })
      return
    }
    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (loadingStats) {
    return <PageLoading />
  }

  const userStats = stats || {
    coursesCompleted: 12,
    totalHours: 45,
    badgesEarned: 15,
    certificatesEarned: 5,
    currentStreak: 7,
    longestStreak: 14,
    xp: 2450,
    level: 12,
  }

  const recentBadges = badges?.earned?.slice(0, 5) || [
    { id: '1', name: 'Premier pas', icon: '🎯' },
    { id: '2', name: 'Flamme 7 jours', icon: '🔥' },
    { id: '3', name: 'Quiz parfait', icon: '⭐' },
  ]

  const recentCertificates = certificates?.slice(0, 3) || [
    {
      id: '1',
      title: 'Machine Learning Fundamentals',
      issuedAt: new Date(),
      courseTitle: 'Introduction au Machine Learning',
    },
    {
      id: '2',
      title: 'React Advanced Patterns',
      issuedAt: new Date(Date.now() - 7 * 86400000),
      courseTitle: 'React Avancé',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <div className="relative">
              <Avatar className="h-32 w-32">
                <AvatarImage src={user?.avatarUrl || undefined} />
                <AvatarFallback className="text-4xl">
                  {getInitials(user?.displayName || 'User')}
                </AvatarFallback>
              </Avatar>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                size="icon"
                variant="secondary"
                className="absolute bottom-0 right-0 rounded-full"
                onClick={handleAvatarClick}
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold">
                    {user?.displayName || 'Utilisateur'}
                  </h1>
                  <p className="text-muted-foreground">{user?.email}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <Badge variant="secondary">{user?.role || 'Apprenant'}</Badge>
                    <div className="flex items-center gap-1 text-sm">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium">Niveau {userStats.level}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-primary">
                      <TrendingUp className="h-4 w-4" />
                      <span className="font-medium">{userStats.xp} XP</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleOpenEditDialog}>
                    <Edit className="h-4 w-4 mr-2" />
                    Modifier
                  </Button>
                  <Button variant="outline" onClick={() => setIsPasswordDialogOpen(true)}>
                    <Key className="h-4 w-4 mr-2" />
                    Mot de passe
                  </Button>
                  <Button variant="destructive" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Déconnexion
                  </Button>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{user?.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>Entreprise #{user?.enterpriseId || '-'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>Direction #{user?.directionId || '-'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Rôle: {user?.role || '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={BookOpen}
          label="Cours terminés"
          value={userStats.coursesCompleted}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          icon={Clock}
          label="Heures d'apprentissage"
          value={`${userStats.totalHours}h`}
          color="text-green-500"
          bgColor="bg-green-500/10"
        />
        <StatCard
          icon={Award}
          label="Badges obtenus"
          value={userStats.badgesEarned}
          color="text-yellow-500"
          bgColor="bg-yellow-500/10"
        />
        <StatCard
          icon={Calendar}
          label="Jours consécutifs"
          value={userStats.currentStreak}
          subtext={`Record: ${userStats.longestStreak}`}
          color="text-orange-500"
          bgColor="bg-orange-500/10"
        />
      </div>

      {/* Level Progress */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              <span className="font-semibold">Niveau {userStats.level}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {userStats.xp} / {(userStats.level + 1) * 250} XP
            </span>
          </div>
          <Progress value={(userStats.xp % 250) / 2.5} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            Plus que {(userStats.level + 1) * 250 - userStats.xp} XP pour le niveau {userStats.level + 1}
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="badges">
        <TabsList>
          <TabsTrigger value="badges">Badges</TabsTrigger>
          <TabsTrigger value="certificates">Certificats</TabsTrigger>
          <TabsTrigger value="activity">Activité</TabsTrigger>
        </TabsList>

        <TabsContent value="badges" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Badges récents</CardTitle>
              <CardDescription>Vos dernières récompenses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {recentBadges.map((badge: any) => (
                  <div
                    key={badge.id}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg bg-muted/50"
                  >
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-3xl">
                      {badge.icon}
                    </div>
                    <span className="text-sm font-medium">{badge.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certificates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Certificats</CardTitle>
              <CardDescription>Vos certifications obtenues</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentCertificates.map((cert: any) => (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Award className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{cert.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {cert.courseTitle} · {formatDate(cert.issuedAt)}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Voir
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Activité récente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { action: 'Cours terminé', item: 'Introduction au ML', time: '2h' },
                  { action: 'Badge obtenu', item: 'Quiz parfait', time: '3h' },
                  { action: 'Quiz réussi', item: 'Machine Learning - Quiz 3', time: '5h' },
                  { action: 'Leçon complétée', item: 'Réseaux de neurones', time: '1j' },
                ].map((activity, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{activity.action}</span> - {activity.item}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">il y a {activity.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le profil</DialogTitle>
            <DialogDescription>
              Mettez à jour vos informations personnelles
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Nom complet</Label>
              <Input
                id="displayName"
                value={editForm.displayName}
                onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                placeholder="Votre nom complet"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="votre@email.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={updateProfileMutation.isPending}>
              Annuler
            </Button>
            <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
              {updateProfileMutation.isPending ? (
                <>Enregistrement...</>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Enregistrer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le mot de passe</DialogTitle>
            <DialogDescription>
              Entrez votre mot de passe actuel et le nouveau mot de passe
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Mot de passe actuel</Label>
              <Input
                id="currentPassword"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Minimum 8 caractères"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="Confirmez le nouveau mot de passe"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)} disabled={changePasswordMutation.isPending}>
              Annuler
            </Button>
            <Button onClick={handleChangePassword} disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? 'Modification...' : 'Modifier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
  bgColor,
}: {
  icon: React.ComponentType<any>
  label: string
  value: string | number
  subtext?: string
  color: string
  bgColor: string
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`h-12 w-12 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
          {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
