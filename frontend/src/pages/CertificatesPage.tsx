import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import {
  Award,
  Download,
  Search,
  Calendar,
  CheckCircle,
  Share2,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'

interface Certificate {
  id: number
  courseId: number
  courseTitle: string
  serialNumber: string
  issuedAt: string
  expiresAt: string | null
  status: string
}

export default function CertificatesPage() {
  const { toast } = useToast()
  const [search, setSearch] = useState('')

  const { data: certificates = [], isLoading } = useQuery({
    queryKey: ['my-certificates'],
    queryFn: async () => {
      const response = await api.get('/certificates/my')
      return response.data.data || []
    },
  })

  const filteredCertificates = certificates.filter((cert: Certificate) =>
    cert.courseTitle?.toLowerCase().includes(search.toLowerCase()) ||
    cert.serialNumber?.toLowerCase().includes(search.toLowerCase())
  )

  const handleDownload = async (certificateId: number) => {
    try {
      const response = await api.get(`/certificates/${certificateId}/download`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `certificate-${certificateId}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de télécharger le certificat',
        variant: 'destructive',
      })
    }
  }

  const handleShare = async (cert: Certificate) => {
    const shareUrl = `${window.location.origin}/verify-certificate/${cert.serialNumber}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast({
        title: 'Lien copié',
        description: 'Le lien de vérification a été copié dans le presse-papiers',
      })
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de copier le lien',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Mes Certificats</h1>
        <p className="text-muted-foreground">
          Consultez et téléchargez vos certificats de formation
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Award className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{certificates.length}</p>
                <p className="text-sm text-muted-foreground">Certificats obtenus</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {certificates.filter((c: Certificate) => c.status === 'valid').length}
                </p>
                <p className="text-sm text-muted-foreground">Certificats valides</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {certificates.filter((c: Certificate) => 
                    c.expiresAt && new Date(c.expiresAt) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                  ).length}
                </p>
                <p className="text-sm text-muted-foreground">Expirent bientôt</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un certificat..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Certificates Grid */}
      {filteredCertificates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Aucun certificat</h3>
            <p className="text-muted-foreground">
              {search
                ? 'Aucun certificat ne correspond à votre recherche'
                : 'Terminez des formations pour obtenir des certificats'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCertificates.map((cert: Certificate) => (
            <Card key={cert.id} className="overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-primary to-blue-600" />
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Award className="h-6 w-6 text-primary" />
                  </div>
                  <Badge
                    variant={cert.status === 'valid' ? 'default' : 'secondary'}
                    className={cert.status === 'valid' ? 'bg-green-100 text-green-800' : ''}
                  >
                    {cert.status === 'valid' ? 'Valide' : 'Expiré'}
                  </Badge>
                </div>
                <CardTitle className="mt-4">{cert.courseTitle}</CardTitle>
                <CardDescription>
                  N° {cert.serialNumber}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Délivré le</span>
                    <span>{formatDate(cert.issuedAt)}</span>
                  </div>
                  {cert.expiresAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expire le</span>
                      <span>{formatDate(cert.expiresAt)}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleDownload(cert.id)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleShare(cert)}
                  >
                    <Share2 className="h-4 w-4 mr-1" />
                    Partager
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
