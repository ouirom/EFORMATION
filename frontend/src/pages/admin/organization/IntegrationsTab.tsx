import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Mail, KeyRound, PlugZap, Disc, UploadCloud, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const INTEGRATIONS = [
  { key: 'email', path: '/admin/email-settings', icon: Mail },
  { key: 'sso', path: '/admin/sso-settings', icon: KeyRound },
  { key: 'video', path: '/admin/livekit-settings', icon: PlugZap },
  { key: 'recording', path: '/admin/recording-settings', icon: Disc },
  { key: 'import', path: '/admin/import', icon: UploadCloud },
] as const

/** Administration > Organisation > Intégrations: the connected services, each with its own page. */
export function IntegrationsTab() {
  const { t } = useTranslation('admin')
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {INTEGRATIONS.map(({ key, path, icon: Icon }) => (
        <Link key={key} to={path} className="group">
          <Card className="h-full transition-colors group-hover:border-primary/60">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{t(`organization.integrations.${key}.title`)}</p>
                <p className="text-sm text-muted-foreground mt-1">{t(`organization.integrations.${key}.description`)}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary shrink-0" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
