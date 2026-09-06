import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
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
      toast({ title: tCommon('status.success'), description: t('liveKitSettings.toasts.savedDescription') })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('liveKitSettings.toasts.saveErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const testMutation = useMutation({
    mutationFn: () => api.settings.testLiveKit(),
    onSuccess: () => {
      toast({ title: tCommon('status.success'), description: t('liveKitSettings.toasts.testSuccessDescription') })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('liveKitSettings.toasts.testErrorDescription'),
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
        <h1 className="text-3xl font-bold">{t('liveKitSettings.title')}</h1>
        <p className="text-muted-foreground">
          {t('liveKitSettings.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            {t('liveKitSettings.config.title')}
          </CardTitle>
          <CardDescription>
            {t('liveKitSettings.config.descriptionPrefix')}{' '}
            <a href="https://cloud.livekit.io" target="_blank" rel="noopener noreferrer" className="underline">
              cloud.livekit.io
            </a>
            {t('liveKitSettings.config.descriptionSuffix')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium text-sm">{t('liveKitSettings.config.useForTenant')}</p>
              <p className="text-xs text-muted-foreground">
                {t('liveKitSettings.config.useForTenantHint')}
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
            <Label htmlFor="livekit-project-url">{t('liveKitSettings.config.projectUrl')}</Label>
            <Input
              id="livekit-project-url"
              placeholder="wss://votre-projet-xxxxx.livekit.cloud"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="livekit-api-key">{t('liveKitSettings.config.apiKey')}</Label>
              <Input
                id="livekit-api-key"
                placeholder="APIxxxxxxxxxxxx"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="livekit-api-secret">{t('liveKitSettings.config.apiSecret')}</Label>
              <Input
                id="livekit-api-secret"
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
              {t('liveKitSettings.config.testConnection')}
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t('liveKitSettings.config.save')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
