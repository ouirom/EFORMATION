import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { Video, PlugZap, Save, Loader2 } from 'lucide-react'
import { api } from '@/services/api'

interface LiveKitSettings {
  enabled: boolean
  url: string
  apiKey: string
  apiSecret: string
}

const EMPTY_SETTINGS: LiveKitSettings = {
  enabled: false,
  url: '',
  apiKey: '',
  apiSecret: '',
}

export default function AdminLiveKitSettingsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<LiveKitSettings>(EMPTY_SETTINGS)

  const { data: settings, isLoading } = useQuery<LiveKitSettings>({
    queryKey: ['livekit-settings'],
    queryFn: () => api.settings.getLiveKit(),
  })

  useEffect(() => {
    if (settings) setFormData(settings)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (data: LiveKitSettings) => api.settings.updateLiveKit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['livekit-settings'] })
      toast({ title: 'Succès', description: 'Paramètres LiveKit enregistrés' })
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || "Impossible d'enregistrer les paramètres",
        variant: 'destructive',
      })
    },
  })

  const testMutation = useMutation({
    mutationFn: () => api.settings.testLiveKit(),
    onSuccess: () => {
      toast({ title: 'Succès', description: 'Connexion LiveKit réussie' })
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || 'Impossible de se connecter à LiveKit',
        variant: 'destructive',
      })
    },
  })

  const handleSave = () => {
    saveMutation.mutate(formData)
  }

  if (isLoading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Visioconférence (LiveKit)</h1>
        <p className="text-muted-foreground">
          Configurez les identifiants LiveKit utilisés pour la visioconférence intégrée des sessions live.
          Laissez désactivé pour utiliser la configuration globale du serveur (si définie).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Configuration LiveKit
          </CardTitle>
          <CardDescription>
            Un compte gratuit peut être créé sur{' '}
            <a href="https://cloud.livekit.io" target="_blank" rel="noopener noreferrer" className="underline">
              cloud.livekit.io
            </a>
            . Ces identifiants remplacent, pour ce tenant uniquement, la configuration par défaut du serveur.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium text-sm">Utiliser ces identifiants pour ce tenant</p>
              <p className="text-xs text-muted-foreground">
                Si désactivé, la configuration globale du serveur (variables d'environnement) est utilisée à la place.
              </p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
          </div>

          <div className="space-y-2">
            <Label>URL du projet (WebSocket)</Label>
            <Input
              placeholder="wss://votre-projet-xxxxx.livekit.cloud"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                placeholder="APIxxxxxxxxxxxx"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>API Secret</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={formData.apiSecret}
                onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || saveMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlugZap className="h-4 w-4 mr-2" />
              )}
              Tester la connexion
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
