import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Loader2, Mail, Scale } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLegalInfo } from '@/lib/legal'

/** Public page /legal: legal notice, privacy policy and data protection contact. */
export default function LegalPage() {
  const { t } = useTranslation('shared')
  const { data, isLoading } = useLegalInfo()

  return (
    <Card className="shadow-lg">
      <CardHeader className="space-y-1 items-center text-center">
        <Scale className="h-10 w-10 text-primary mb-2" />
        <CardTitle className="text-2xl">{t('legal.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {data?.legalNotice ? (
              <div className="text-sm whitespace-pre-line leading-relaxed">{data.legalNotice}</div>
            ) : (
              <p className="text-sm text-muted-foreground text-center">{t('legal.none')}</p>
            )}
            {(data?.privacyPolicyUrl || data?.privacyContactEmail) && (
              <div className="border-t pt-4 space-y-2 text-sm">
                {data?.privacyPolicyUrl && (
                  <a href={data.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                    <ExternalLink className="h-4 w-4" />
                    {t('legal.privacyPolicy')}
                  </a>
                )}
                {data?.privacyContactEmail && (
                  <a href={`mailto:${data.privacyContactEmail}`} className="flex items-center gap-2 text-primary hover:underline">
                    <Mail className="h-4 w-4" />
                    {t('legal.contact', { email: data.privacyContactEmail })}
                  </a>
                )}
              </div>
            )}
          </>
        )}
        <Button variant="outline" asChild className="w-full">
          <Link to="/login">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('legal.back')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
