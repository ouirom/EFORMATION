import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Ban } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TenantFeature, useTenantFeatures } from '@/lib/tenantSettings'

/**
 * Renders its page only while the organization has the module enabled
 * (Administration > Organisation). A bookmarked or shared URL of a disabled
 * module shows an explanation instead of a page whose API calls all fail.
 */
export function FeatureGate({ feature, children }: { feature: TenantFeature; children: ReactNode }) {
  const { t } = useTranslation('shared')
  const modules = useTenantFeatures()

  if (modules[feature]) return <>{children}</>

  return (
    <Card className="max-w-lg mx-auto mt-12">
      <CardContent className="p-8 text-center space-y-3">
        <Ban className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t(`moduleDisabled.title.${feature}`)}</h1>
        <p className="text-sm text-muted-foreground">{t('moduleDisabled.description')}</p>
        <Link to="/dashboard">
          <Button variant="outline" size="sm">{t('moduleDisabled.back')}</Button>
        </Link>
      </CardContent>
    </Card>
  )
}
