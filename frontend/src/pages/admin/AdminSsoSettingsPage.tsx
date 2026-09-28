import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { Copy, KeyRound, Loader2, Network, Plug, Save } from 'lucide-react'
import { api } from '@/services/api'

/**
 * Identity providers of the organization (Azure AD, Google, LDAP). Each
 * organization brings its own; secrets come back masked and are only replaced
 * when the admin types a new value.
 */
interface SsoSettings {
  azureEnabled: boolean
  azureDirectoryId: string
  azureClientId: string
  azureClientSecret: string
  googleEnabled: boolean
  googleClientId: string
  googleClientSecret: string
  ldapEnabled: boolean
  ldapUrl: string
  ldapBindDn: string
  ldapBindPassword: string
  ldapSearchBase: string
  ldapSearchFilter: string
  ldapEmailAttribute: string
  ldapNameAttribute: string
}

interface SsoSettingsResponse extends SsoSettings {
  redirectUris: { azure: string; google: string }
  active: Record<'azure' | 'google' | 'ldap', 'tenant' | 'platform' | null>
}

const EMPTY: SsoSettings = {
  azureEnabled: false,
  azureDirectoryId: '',
  azureClientId: '',
  azureClientSecret: '',
  googleEnabled: false,
  googleClientId: '',
  googleClientSecret: '',
  ldapEnabled: false,
  ldapUrl: '',
  ldapBindDn: '',
  ldapBindPassword: '',
  ldapSearchBase: '',
  ldapSearchFilter: '',
  ldapEmailAttribute: 'mail',
  ldapNameAttribute: 'displayName',
}

type TextField = Exclude<keyof SsoSettings, 'azureEnabled' | 'googleEnabled' | 'ldapEnabled'>

export default function AdminSsoSettingsPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<SsoSettings>(EMPTY)

  const { data, isLoading } = useQuery<SsoSettingsResponse>({
    queryKey: ['sso-settings'],
    queryFn: async () => (await api.get('/settings/sso')).data.data,
  })

  useEffect(() => {
    if (data) {
      // Only the editable fields (not redirectUris/active), with defaults for any missing one.
      const keys = Object.keys(EMPTY) as (keyof SsoSettings)[]
      setForm(Object.fromEntries(keys.map((key) => [key, data[key] ?? EMPTY[key]])) as unknown as SsoSettings)
    }
  }, [data])

  const errorMessage = (error: any, fallback: string) => {
    const apiError = error?.response?.data?.error
    if (apiError?.code === 'SSO_INCOMPLETE' && Array.isArray(apiError?.details?.missing)) {
      return t('ssoSettings.toasts.incomplete', { providers: apiError.details.missing.join(', ') })
    }
    return apiError?.message || fallback
  }

  const saveMutation = useMutation({
    mutationFn: (settings: SsoSettings) => api.put('/settings/sso', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sso-settings'] })
      queryClient.invalidateQueries({ queryKey: ['sso-providers'] })
      toast({ title: tCommon('status.success'), description: t('ssoSettings.toasts.saved') })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: errorMessage(error, t('ssoSettings.toasts.saveError')), variant: 'destructive' })
    },
  })

  const ldapTestMutation = useMutation({
    mutationFn: () => api.post('/settings/sso/ldap/test', form),
    onSuccess: () => toast({ title: tCommon('status.success'), description: t('ssoSettings.toasts.ldapOk') }),
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: errorMessage(error, t('ssoSettings.toasts.ldapError')), variant: 'destructive' })
    },
  })

  if (isLoading) return <PageLoading />

  const field = (key: TextField, id: string, options: { type?: string; placeholder?: string } = {}) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{t(`ssoSettings.fields.${key}`)}</Label>
      <Input
        id={id}
        type={options.type ?? 'text'}
        placeholder={options.placeholder}
        autoComplete={options.type === 'password' ? 'new-password' : 'off'}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  )

  const statusBadge = (provider: 'azure' | 'google' | 'ldap') => {
    const source = data?.active?.[provider]
    if (source === 'tenant') return <Badge>{t('ssoSettings.status.active')}</Badge>
    if (source === 'platform') return <Badge variant="secondary">{t('ssoSettings.status.platform')}</Badge>
    return <Badge variant="outline">{t('ssoSettings.status.inactive')}</Badge>
  }

  const redirectUri = (uri?: string) =>
    uri ? (
      <div className="space-y-1">
        <Label>{t('ssoSettings.redirectUri')}</Label>
        <div className="flex gap-2">
          <Input readOnly value={uri} className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('ssoSettings.copy')}
            onClick={() => {
              navigator.clipboard?.writeText(uri).then(
                () => toast({ description: t('ssoSettings.toasts.copied') }),
                () => {}
              )
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('ssoSettings.redirectUriHint')}</p>
      </div>
    ) : null

  const providerCard = (
    provider: 'azure' | 'google' | 'ldap',
    icon: ReactNode,
    enabledKey: 'azureEnabled' | 'googleEnabled' | 'ldapEnabled',
    body: ReactNode
  ) => (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              {icon}
              {t(`ssoSettings.${provider}.title`)}
            </CardTitle>
            <CardDescription>{t(`ssoSettings.${provider}.description`)}</CardDescription>
          </div>
          {statusBadge(provider)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <Label htmlFor={`sso-${provider}-enabled`} className="cursor-pointer">
            {t(`ssoSettings.${provider}.enable`)}
          </Label>
          <input
            id={`sso-${provider}-enabled`}
            type="checkbox"
            className="h-5 w-5"
            checked={form[enabledKey]}
            onChange={(e) => setForm({ ...form, [enabledKey]: e.target.checked })}
          />
        </div>
        {body}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">{t('ssoSettings.title')}</h1>
        <p className="text-muted-foreground">{t('ssoSettings.subtitle')}</p>
      </div>

      {providerCard(
        'azure',
        <KeyRound className="h-5 w-5" />,
        'azureEnabled',
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('azureDirectoryId', 'sso-azure-directory', { placeholder: 'contoso.onmicrosoft.com' })}
            {field('azureClientId', 'sso-azure-client')}
          </div>
          {field('azureClientSecret', 'sso-azure-secret', { type: 'password', placeholder: '••••••••' })}
          {redirectUri(data?.redirectUris?.azure)}
        </>
      )}

      {providerCard(
        'google',
        <KeyRound className="h-5 w-5" />,
        'googleEnabled',
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('googleClientId', 'sso-google-client')}
            {field('googleClientSecret', 'sso-google-secret', { type: 'password', placeholder: '••••••••' })}
          </div>
          {redirectUri(data?.redirectUris?.google)}
        </>
      )}

      {providerCard(
        'ldap',
        <Network className="h-5 w-5" />,
        'ldapEnabled',
        <>
          {field('ldapUrl', 'sso-ldap-url', { placeholder: 'ldaps://dc.entreprise.local:636' })}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('ldapBindDn', 'sso-ldap-bind-dn', { placeholder: 'CN=svc-eformation,OU=Services,DC=entreprise,DC=local' })}
            {field('ldapBindPassword', 'sso-ldap-bind-password', { type: 'password', placeholder: '••••••••' })}
          </div>
          {field('ldapSearchBase', 'sso-ldap-search-base', { placeholder: 'DC=entreprise,DC=local' })}
          {field('ldapSearchFilter', 'sso-ldap-search-filter')}
          <p className="text-xs text-muted-foreground -mt-2">{t('ssoSettings.ldap.filterHint')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('ldapEmailAttribute', 'sso-ldap-email-attribute')}
            {field('ldapNameAttribute', 'sso-ldap-name-attribute')}
          </div>
          <Button type="button" variant="outline" onClick={() => ldapTestMutation.mutate()} disabled={ldapTestMutation.isPending}>
            {ldapTestMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
            {t('ssoSettings.ldap.test')}
          </Button>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t('ssoSettings.provisioningHint')}</p>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {t('ssoSettings.save')}
        </Button>
      </div>
    </div>
  )
}
