import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { Mail, MessageSquare, Smartphone, Monitor } from 'lucide-react'
import { api } from '@/services/api'

// Matches notification_preferences' real columns (email, sms, whatsapp, push_web,
// push_mobile) -- there is no "in-app" toggle because in-app notifications have no
// such column and can't be disabled, and no "digest frequency" because that column
// doesn't exist either.
interface Preferences {
  email: boolean
  sms: boolean
  whatsapp: boolean
  push_web: boolean
  push_mobile: boolean
}

const CHANNELS: { key: keyof Preferences; label: string; description: string; icon: any }[] = [
  { key: 'email', label: 'Email', description: 'Recevoir les notifications par email', icon: Mail },
  { key: 'sms', label: 'SMS', description: 'Recevoir les notifications par SMS', icon: MessageSquare },
  { key: 'whatsapp', label: 'WhatsApp', description: 'Recevoir les notifications par WhatsApp', icon: MessageSquare },
  { key: 'push_web', label: 'Notifications push (navigateur)', description: 'Recevoir des notifications push dans votre navigateur', icon: Monitor },
  { key: 'push_mobile', label: 'Notifications push (mobile)', description: 'Recevoir des notifications push sur l\'application mobile', icon: Smartphone },
]

export default function SettingsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [prefs, setPrefs] = useState<Preferences | null>(null)

  const { data, isLoading } = useQuery<Preferences>({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const response = await api.get('/notifications/preferences')
      return response.data.data
    },
  })

  useEffect(() => {
    if (data) setPrefs(data)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (next: Preferences) => {
      await api.put('/notifications/preferences', next)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
      toast({ title: 'Succès', description: 'Préférences enregistrées' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de l\'enregistrement', variant: 'destructive' })
    },
  })

  if (isLoading || !prefs) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">Gérez vos préférences de notifications</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Canaux de notification</CardTitle>
          <CardDescription>
            Choisissez les canaux par lesquels vous souhaitez recevoir les notifications. Les
            notifications dans l'application restent toujours visibles depuis la cloche en haut de
            l'écran, quel que soit votre choix ici.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {CHANNELS.map((channel) => (
            <div key={channel.key} className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
              <div className="flex items-center gap-3">
                <channel.icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <Label className="font-medium">{channel.label}</Label>
                  <p className="text-sm text-muted-foreground">{channel.description}</p>
                </div>
              </div>
              <Checkbox
                checked={prefs[channel.key]}
                onCheckedChange={(checked) => setPrefs({ ...prefs, [channel.key]: checked })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate(prefs)} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
      </Button>
    </div>
  )
}
