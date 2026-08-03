import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { Mail, Send, Save, Loader2 } from 'lucide-react'
import { api } from '@/services/api'

interface EmailSettings {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  fromEmail: string
  fromName: string
}

const EMPTY_SETTINGS: EmailSettings = {
  enabled: false,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  fromEmail: '',
  fromName: '',
}

export default function AdminEmailSettingsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<EmailSettings>(EMPTY_SETTINGS)
  const [testEmail, setTestEmail] = useState('')

  const { data: settings, isLoading } = useQuery<EmailSettings>({
    queryKey: ['email-settings'],
    queryFn: () => api.settings.getEmail(),
  })

  useEffect(() => {
    if (settings) setFormData(settings)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (data: EmailSettings) => api.settings.updateEmail(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-settings'] })
      toast({ title: 'Succès', description: 'Paramètres email enregistrés' })
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || 'Impossible d\'enregistrer les paramètres',
        variant: 'destructive',
      })
    },
  })

  const testMutation = useMutation({
    mutationFn: (to: string) => api.settings.testEmail(to),
    onSuccess: () => {
      toast({ title: 'Succès', description: `Email de test envoyé à ${testEmail}` })
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || "Impossible d'envoyer l'email de test",
        variant: 'destructive',
      })
    },
  })

  const handleSave = () => {
    saveMutation.mutate(formData)
  }

  const handleSendTest = () => {
    if (!testEmail) {
      toast({ title: 'Erreur', description: 'Veuillez entrer une adresse email', variant: 'destructive' })
      return
    }
    testMutation.mutate(testEmail)
  }

  if (isLoading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Notifications par email</h1>
        <p className="text-muted-foreground">Configurez le serveur SMTP utilisé pour envoyer les notifications</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Configuration SMTP
          </CardTitle>
          <CardDescription>
            Les emails (notifications, mots de passe oubliés, alertes) seront envoyés via ce serveur
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium text-sm">Activer l'envoi d'emails</p>
              <p className="text-xs text-muted-foreground">Si désactivé, aucune notification email ne sera envoyée</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Serveur SMTP</Label>
              <Input
                placeholder="smtp.gmail.com"
                value={formData.smtpHost}
                onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input
                type="number"
                value={formData.smtpPort}
                onChange={(e) => setFormData({ ...formData, smtpPort: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <Label className="cursor-pointer">Connexion sécurisée (TLS/SSL)</Label>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={formData.smtpSecure}
              onChange={(e) => setFormData({ ...formData, smtpSecure: e.target.checked })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nom d'utilisateur SMTP</Label>
              <Input
                placeholder="notifications@entreprise.com"
                value={formData.smtpUser}
                onChange={(e) => setFormData({ ...formData, smtpUser: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Mot de passe SMTP</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={formData.smtpPassword}
                onChange={(e) => setFormData({ ...formData, smtpPassword: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email d'expédition</Label>
              <Input
                type="email"
                placeholder="noreply@entreprise.com"
                value={formData.fromEmail}
                onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nom d'expéditeur</Label>
              <Input
                placeholder="E-Formation"
                value={formData.fromName}
                onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Tester la configuration
          </CardTitle>
          <CardDescription>Envoyez un email de test pour vérifier que la configuration fonctionne</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="votre@email.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <Button variant="outline" onClick={handleSendTest} disabled={testMutation.isPending}>
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Envoyer un test
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
