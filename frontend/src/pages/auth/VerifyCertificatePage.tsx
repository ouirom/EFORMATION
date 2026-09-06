import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLoading } from '@/components/ui/loading'
import { Award, XCircle } from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'

/** Public, unauthenticated page a certificate's serial number links to (see
 * CertificatesPage's "Share" button) -- lets anyone holding the link confirm
 * a certificate is genuine without needing an E-Formation account. */
export default function VerifyCertificatePage() {
  const { t } = useTranslation('certificates')
  const { serial } = useParams<{ serial: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['verify-certificate', serial],
    queryFn: async () => {
      const response = await api.get(`/certificates/verify/${serial}`)
      return response.data.data
    },
    enabled: !!serial,
  })

  if (isLoading) {
    return <PageLoading />
  }

  if (!data?.valid) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h1 className="text-xl font-semibold mb-2">{t('verify.notFoundTitle')}</h1>
          <p className="text-muted-foreground">{t('verify.notFoundHint')}</p>
        </CardContent>
      </Card>
    )
  }

  const cert = data.certificate

  return (
    <Card>
      <div className="h-2 bg-gradient-to-r from-primary to-blue-600 rounded-t-lg" />
      <CardHeader className="text-center">
        <Award className="h-12 w-12 mx-auto text-primary mb-2" />
        <CardTitle>{t('verify.validTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('verify.holder')}</span>
          <span className="font-medium">{cert.user_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('verify.course')}</span>
          <span className="font-medium">{cert.course_title}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('issuedOn')}</span>
          <span>{formatDate(cert.issued_at)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('verify.issuer')}</span>
          <span>{cert.tenant_name}</span>
        </div>
        <p className="text-center text-xs text-muted-foreground pt-2 border-t">
          {t('serialNumber', { number: cert.serial })}
        </p>
      </CardContent>
    </Card>
  )
}
