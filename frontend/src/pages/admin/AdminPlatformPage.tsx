import { useState } from 'react'
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
      toast({ title: 'Organisation créée', description: 'La nouvelle organisation est prête.' })
      queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })
      setIsCreateOpen(false)
      setNewTenantName('')
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || "Impossible de créer l'organisation",
        variant: 'destructive',
      })
    },
  })

  const handleSwitch = async (tenant: Tenant) => {
    setSwitchingId(tenant.id)
    try {
      await switchTenant(tenant.id)
      toast({ title: 'Organisation active', description: `Vous agissez maintenant dans « ${tenant.name} »` })
      navigate('/admin/analytics')
    } catch {
      toast({ title: 'Erreur', description: "Impossible de basculer vers cette organisation", variant: 'destructive' })
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
          <h1 className="text-3xl font-bold">Plateforme</h1>
          <p className="text-muted-foreground">
            Toutes les organisations gérées sur cette instance — réservé au super administrateur
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle organisation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer une organisation</DialogTitle>
              <DialogDescription>Un nouveau tenant isolé, avec son propre catalogue et ses propres utilisateurs.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="tenantName">Nom de l'organisation</Label>
              <Input
                id="tenantName"
                placeholder="Ex: Acme Corp"
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={createMutation.isPending}>
                Annuler
              </Button>
              <Button
                onClick={() => newTenantName.trim() && createMutation.mutate(newTenantName.trim())}
                disabled={!newTenantName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? 'Création...' : 'Créer'}
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
                      Active
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
                  <span>Créée le {formatDate(tenant.createdAt)}</span>
                </div>
                <Button
                  variant={isActive ? 'outline' : 'default'}
                  size="sm"
                  className="w-full"
                  disabled={isActive || switchingId === tenant.id}
                  onClick={() => handleSwitch(tenant)}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  {isActive ? 'Organisation active' : switchingId === tenant.id ? 'Bascule...' : 'Basculer vers'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
        {tenants.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Aucune organisation pour l'instant.
          </div>
        )}
      </div>
    </div>
  )
}
