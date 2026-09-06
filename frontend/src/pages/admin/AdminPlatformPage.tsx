import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { Globe, Plus, Users, BookOpen, LogIn } from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'

interface Tenant {
  id: number
  name: string
  slug: string
  createdAt: string
  userCount: number
  courseCount: number
}

export default function AdminPlatformPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const { switchTenant, user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newTenantName, setNewTenantName] = useState('')
  const [switchingId, setSwitchingId] = useState<number | null>(null)

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['platform-tenants'],
    queryFn: async () => {
      const response = await api.get('/platform/tenants')
      return response.data.data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post('/platform/tenants', { name }),
    onSuccess: () => {
      toast({ title: t('platform.toasts.createdTitle'), description: t('platform.toasts.createdDescription') })
      queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })
      setIsCreateOpen(false)
      setNewTenantName('')
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('platform.toasts.createErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const handleSwitch = async (tenant: Tenant) => {
    setSwitchingId(tenant.id)
    try {
      await switchTenant(tenant.id)
      toast({ title: t('platform.toasts.switchedTitle'), description: t('platform.toasts.switchedDescription', { name: tenant.name }) })
      navigate('/admin/analytics')
    } catch {
      toast({ title: tCommon('status.error'), description: t('platform.toasts.switchErrorDescription'), variant: 'destructive' })
    } finally {
      setSwitchingId(null)
    }
  }

  if (isLoading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('platform.title')}</h1>
          <p className="text-muted-foreground">
            {t('platform.subtitle')}
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t('platform.newOrganization')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('platform.createDialog.title')}</DialogTitle>
              <DialogDescription>{t('platform.createDialog.description')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="tenantName">{t('platform.createDialog.nameLabel')}</Label>
              <Input
                id="tenantName"
                placeholder={t('platform.createDialog.namePlaceholder')}
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={createMutation.isPending}>
                {t('platform.createDialog.cancel')}
              </Button>
              <Button
                onClick={() => newTenantName.trim() && createMutation.mutate(newTenantName.trim())}
                disabled={!newTenantName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? t('platform.createDialog.creating') : t('platform.createDialog.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tenants.map((tenant) => {
          const isActive = tenant.id === user?.tenantId
          return (
            <Card key={tenant.id} className={isActive ? 'border-primary' : ''}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  {isActive && (
                    <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">
                      {t('platform.active')}
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-semibold">{tenant.name}</p>
                  <p className="text-sm text-muted-foreground">{tenant.slug}</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {tenant.userCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" /> {tenant.courseCount}
                  </span>
                  <span>{t('platform.createdOn', { date: formatDate(tenant.createdAt) })}</span>
                </div>
                <Button
                  variant={isActive ? 'outline' : 'default'}
                  size="sm"
                  className="w-full"
                  disabled={isActive || switchingId === tenant.id}
                  onClick={() => handleSwitch(tenant)}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  {isActive ? t('platform.activeOrganization') : switchingId === tenant.id ? t('platform.switching') : t('platform.switchTo')}
                </Button>
              </CardContent>
            </Card>
          )
        })}
        {tenants.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            {t('platform.empty')}
          </div>
        )}
      </div>
    </div>
  )
}
