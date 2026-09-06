import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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

const CHANNEL_ICONS: Record<keyof Preferences, any> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageSquare,
  push_web: Monitor,
  push_mobile: Smartphone,
}

const CHANNEL_TRANSLATION_KEYS: Record<keyof Preferences, string> = {
  email: 'email',
  sms: 'sms',
  whatsapp: 'whatsapp',
  push_web: 'pushWeb',
  push_mobile: 'pushMobile',
}

export default function SettingsPage() {
  const { t } = useTranslation('profile')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [prefs, setPrefs] = useState<Preferences | null>(null)

  const CHANNELS = (Object.keys(CHANNEL_TRANSLATION_KEYS) as (keyof Preferences)[]).map((key) => ({
    key,
    label: t(`settings.channels.${CHANNEL_TRANSLATION_KEYS[key]}.label`),
    description: t(`settings.channels.${CHANNEL_TRANSLATION_KEYS[key]}.description`),
    icon: CHANNEL_ICONS[key],
  }))

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
      toast({ title: tCommon('status.success'), description: t('settings.savedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('settings.saveErrorDescription'), variant: 'destructive' })
    },
  })

  if (isLoading || !prefs) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.channels.title')}</CardTitle>
          <CardDescription>
            {t('settings.channels.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {CHANNELS.map((channel) => (
            <div key={channel.key} className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
              <div className="flex items-center gap-3">
                <channel.icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <Label htmlFor={`channel-${channel.key}`} className="font-medium">{channel.label}</Label>
                  <p className="text-sm text-muted-foreground">{channel.description}</p>
                </div>
              </div>
              <Checkbox
                id={`channel-${channel.key}`}
                checked={prefs[channel.key]}
                onCheckedChange={(checked) => setPrefs({ ...prefs, [channel.key]: checked })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate(prefs)} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? t('settings.saving') : t('settings.save')}
      </Button>
    </div>
  )
}
