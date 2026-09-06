import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { Disc, Save, Loader2 } from 'lucide-react'
import { api } from '@/services/api'

interface RecordingStorageSettings {
  enabled: boolean
  bucket: string
  region: string
  endpoint: string
  accessKey: string
  secretKey: string
}

const EMPTY_SETTINGS: RecordingStorageSettings = {
  enabled: false,
  bucket: '',
  region: '',
  endpoint: '',
  accessKey: '',
  secretKey: '',
}

export default function AdminRecordingSettingsPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<RecordingStorageSettings>(EMPTY_SETTINGS)

  const { data: settings, isLoading } = useQuery<RecordingStorageSettings>({
    queryKey: ['recording-storage-settings'],
    queryFn: () => api.settings.getRecordingStorage(),
  })

  useEffect(() => {
    if (settings) setFormData(settings)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (data: RecordingStorageSettings) => api.settings.updateRecordingStorage(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recording-storage-settings'] })
      toast({ title: tCommon('status.success'), description: t('recordingSettings.toasts.savedDescription') })
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('recordingSettings.toasts.saveErrorDescription'),
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
        <h1 className="text-3xl font-bold">{t('recordingSettings.title')}</h1>
        <p className="text-muted-foreground">
          {t('recordingSettings.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Disc className="h-5 w-5" />
            {t('recordingSettings.storage.title')}
          </CardTitle>
          <CardDescription>
            {t('recordingSettings.storage.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium text-sm">{t('recordingSettings.storage.enableForTenant')}</p>
              <p className="text-xs text-muted-foreground">
                {t('recordingSettings.storage.enableForTenantHint')}
              </p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recording-bucket">{t('recordingSettings.storage.bucket')}</Label>
              <Input
                id="recording-bucket"
                placeholder="mon-bucket-enregistrements"
                value={formData.bucket}
                onChange={(e) => setFormData({ ...formData, bucket: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recording-region">{t('recordingSettings.storage.region')}</Label>
              <Input
                id="recording-region"
                placeholder="eu-west-1"
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recording-endpoint">{t('recordingSettings.storage.endpoint')}</Label>
            <Input
              id="recording-endpoint"
              placeholder="https://xxxxx.r2.cloudflarestorage.com"
              value={formData.endpoint}
              onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recording-access-key">{t('recordingSettings.storage.accessKey')}</Label>
              <Input
                id="recording-access-key"
                placeholder="AKIAxxxxxxxxxxxx"
                value={formData.accessKey}
                onChange={(e) => setFormData({ ...formData, accessKey: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recording-secret-key">{t('recordingSettings.storage.secretKey')}</Label>
              <Input
                id="recording-secret-key"
                type="password"
                placeholder="••••••••"
                value={formData.secretKey}
                onChange={(e) => setFormData({ ...formData, secretKey: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t('recordingSettings.storage.save')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
