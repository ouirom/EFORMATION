import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { getInitials, formatDate, formatRelativeTime } from '@/lib/utils'
import { EmailConfirmDialog, PendingNotification } from '@/components/EmailConfirmDialog'
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

interface Certificate {
  id: number
  courseId: number
  courseTitle: string
  serialNumber: string
  issuedAt: string
  expiresAt: string | null
  status: string
}

// Mirrors BadgesPage.tsx's own badge_type -> icon mapping, kept in sync manually
// since it's a small, presentation-only lookup rather than shared logic.
function badgeTypeIcon(type: string): string {
  switch (type) {
    case 'trophy': return '🏆'
    case 'perfect_score': return '⭐'
    case 'quiz_completion': return '✅'
    case 'course_start': return '🚀'
    case 'course_completion': return '🎓'
    default: return '🎖️'
  }
}

export default function ProfilePage() {
  const { t } = useTranslation('profile')
  const { t: tCommon } = useTranslation('common')
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [pendingNotification, setPendingNotification] = useState<PendingNotification | null>(null)
  const [editForm, setEditForm] = useState({
    displayName: '',
    email: '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  // job_title isn't part of the JWT/session payload (AuthContext's `user`),
  // so it's fetched separately -- same pattern as the stats/badges/certificates
  // queries below, all of which supplement the session-derived profile data.
  const { data: fullProfile } = useQuery({
    queryKey: ['profile-full', user?.id],
    queryFn: async () => {
      const response = await api.get('/users/me')
      return response.data.data
    },
    enabled: !!user?.id,
  })

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['profile-stats'],
    queryFn: () => api.analytics.getDashboard(),
    enabled: !!user?.id,
  })

  const { data: badgesData } = useQuery({
    queryKey: ['profile-badges'],
    queryFn: async () => {
      const response = await api.get('/badges/my-badges')
      return response.data.data
    },
  })

  const { data: certificates = [] } = useQuery({
    queryKey: ['profile-certificates'],
    queryFn: async () => {
      const response = await api.get('/certificates/my')
      return response.data.data || []
    },
  })

  // Mutation pour mettre à jour le profil
  const updateProfileMutation = useMutation({
    mutationFn: (data: { displayName: string; email: string }) => 
      api.users.update(user!.id, data),
    onSuccess: (updatedUser) => {
      updateUser({ displayName: updatedUser.display_name, email: updatedUser.email })
      toast({ title: tCommon('status.success'), description: t('toasts.profileUpdatedDescription') })
      setIsEditDialogOpen(false)
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('toasts.profileUpdateErrorDescription'),
        variant: 'destructive'
      })
    },
  })

  // Mutation pour changer le mot de passe
  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', data),
    onSuccess: (response) => {
      toast({ title: tCommon('status.success'), description: t('toasts.passwordChangedDescription') })
      setIsPasswordDialogOpen(false)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      if (response.data.pendingNotification) {
        setPendingNotification(response.data.pendingNotification)
      }
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('toasts.passwordChangeErrorDescription'),
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
      toast({ title: tCommon('status.error'), description: t('toasts.selectImageDescription'), variant: 'destructive' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: tCommon('status.error'), description: t('toasts.imageTooLargeDescription'), variant: 'destructive' })
      return
    }

    setIsUploadingAvatar(true)
    try {
      const uploaded = await fileService.uploadFile(file, undefined, 'avatars')
      const avatarUrl = `/uploads/${uploaded.path}`
      const updatedUser = await api.users.update(user.id, { avatarUrl })
      updateUser({ avatarUrl: updatedUser.avatar_url ?? avatarUrl })
      toast({ title: tCommon('status.success'), description: t('toasts.avatarUpdatedDescription') })
    } catch (error: any) {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('toasts.avatarUpdateErrorDescription'),
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
      toast({ title: tCommon('status.error'), description: t('toasts.fillAllFieldsDescription'), variant: 'destructive' })
      return
    }
    updateProfileMutation.mutate(editForm)
  }

  const handleChangePassword = () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast({ title: tCommon('status.error'), description: t('toasts.fillAllFieldsDescription'), variant: 'destructive' })
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: tCommon('status.error'), description: t('toasts.passwordMismatchDescription'), variant: 'destructive' })
      return
    }
    if (passwordForm.newPassword.length < 8) {
      toast({ title: tCommon('status.error'), description: t('toasts.passwordTooShortDescription'), variant: 'destructive' })
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

  const xp = stats?.xp || 0
  const userStats = {
    coursesCompleted: stats?.coursesCompleted || 0,
    totalHours: stats?.totalHours || 0,
    badgesEarned: badgesData?.stats?.total ?? stats?.badges ?? 0,
    certificatesEarned: certificates.length,
    currentStreak: stats?.streak || 0,
    longestStreak: stats?.longestStreak || 0,
    xp,
    level: Math.floor(xp / 250),
  }

  const recentBadges = (badgesData?.badges || []).slice(0, 5).map((b: any) => ({
    id: b.id,
    name: b.name,
    icon: badgeTypeIcon(b.badge_type),
    awardedAt: b.awarded_at,
  }))

  const recentCertificates = certificates.slice(0, 3)

  // "Activity" is built from the two real event sources already on this page
  // (badges awarded, certificates issued) rather than a dedicated activity-feed
  // endpoint, which doesn't exist -- sorted newest first.
  const recentActivity = [
    ...recentBadges.map((b: any) => ({ key: `badge-${b.id}`, action: t('activityTab.actions.badgeEarned'), item: b.name, at: b.awardedAt })),
    ...recentCertificates.map((c: Certificate) => ({ key: `cert-${c.id}`, action: t('activityTab.actions.certificateIssued'), item: c.courseTitle, at: c.issuedAt })),
  ]
    .filter((e) => !!e.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8)

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
                    {user?.displayName || t('defaultUserName')}
                  </h1>
                  <p className="text-muted-foreground">{user?.email}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <Badge variant="secondary">{user?.role || t('defaultRole')}</Badge>
                    <Badge variant="outline">{fullProfile?.job_title || t('defaultJobTitle')}</Badge>
                    <div className="flex items-center gap-1 text-sm">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium">{t('level', { level: userStats.level })}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-primary">
                      <TrendingUp className="h-4 w-4" />
                      <span className="font-medium">{t('xp', { xp: userStats.xp })}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleOpenEditDialog}>
                    <Edit className="h-4 w-4 mr-2" />
                    {t('edit')}
                  </Button>
                  <Button variant="outline" onClick={() => setIsPasswordDialogOpen(true)}>
                    <Key className="h-4 w-4 mr-2" />
                    {t('changePasswordButton')}
                  </Button>
                  <Button variant="destructive" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    {t('logout')}
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
                  <span>{t('enterpriseNumber', { id: user?.enterpriseId || '-' })}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{t('directionNumber', { id: user?.directionId || '-' })}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{t('roleLabel', { role: user?.role || '-' })}</span>
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
          label={t('stats.coursesCompleted')}
          value={userStats.coursesCompleted}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          icon={Clock}
          label={t('stats.learningHours')}
          value={`${userStats.totalHours}h`}
          color="text-green-500"
          bgColor="bg-green-500/10"
        />
        <StatCard
          icon={Award}
          label={t('stats.badgesEarned')}
          value={userStats.badgesEarned}
          color="text-yellow-500"
          bgColor="bg-yellow-500/10"
        />
        <StatCard
          icon={Calendar}
          label={t('stats.consecutiveDays')}
          value={userStats.currentStreak}
          subtext={t('stats.record', { value: userStats.longestStreak })}
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
              <span className="font-semibold">{t('level', { level: userStats.level })}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {t('xpProgress', { xp: userStats.xp, max: (userStats.level + 1) * 250 })}
            </span>
          </div>
          <Progress value={(userStats.xp % 250) / 2.5} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            {t('xpRemaining', { remaining: (userStats.level + 1) * 250 - userStats.xp, nextLevel: userStats.level + 1 })}
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="badges">
        <TabsList>
          <TabsTrigger value="badges">{t('tabs.badges')}</TabsTrigger>
          <TabsTrigger value="certificates">{t('tabs.certificates')}</TabsTrigger>
          <TabsTrigger value="activity">{t('tabs.activity')}</TabsTrigger>
        </TabsList>

        <TabsContent value="badges" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('recentBadges.title')}</CardTitle>
              <CardDescription>{t('recentBadges.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {recentBadges.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('recentBadges.empty')}</p>
              ) : (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certificates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('certificatesTab.title')}</CardTitle>
              <CardDescription>{t('certificatesTab.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentCertificates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('certificatesTab.empty')}</p>
                ) : recentCertificates.map((cert: Certificate) => (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Award className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{cert.courseTitle}</p>
                        <p className="text-sm text-muted-foreground">
                          {t('serialNumberShort', { number: cert.serialNumber })} · {formatDate(cert.issuedAt)}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate('/certificates')}>
                      {t('certificatesTab.view')}
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
              <CardTitle>{t('activityTab.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('activityTab.empty')}</p>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div key={activity.key} className="flex items-center gap-4">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-medium">{activity.action}</span> - {activity.item}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(new Date(activity.at))}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('editDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">{t('editDialog.fullName')}</Label>
              <Input
                id="displayName"
                value={editForm.displayName}
                onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                placeholder={t('editDialog.fullNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('editDialog.email')}</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder={t('editDialog.emailPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={updateProfileMutation.isPending}>
              {t('editDialog.cancel')}
            </Button>
            <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
              {updateProfileMutation.isPending ? (
                <>{t('editDialog.saving')}</>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {t('editDialog.save')}
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
            <DialogTitle>{t('passwordDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('passwordDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t('passwordDialog.currentPassword')}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('passwordDialog.newPassword')}</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder={t('passwordDialog.newPasswordPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('passwordDialog.confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder={t('passwordDialog.confirmPasswordPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)} disabled={changePasswordMutation.isPending}>
              {t('passwordDialog.cancel')}
            </Button>
            <Button onClick={handleChangePassword} disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? t('passwordDialog.changing') : t('passwordDialog.change')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailConfirmDialog
        pendingNotification={pendingNotification}
        onOpenChange={(open) => !open && setPendingNotification(null)}
      />
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
