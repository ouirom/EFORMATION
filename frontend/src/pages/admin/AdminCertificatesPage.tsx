import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import {
  Award,
  Plus,
  Search,
  Edit,
  Trash2,
  Download,
  Eye,
  User,
  BookOpen,
  FileText,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'

interface Certificate {
  id: number
  userId: number
  courseId: number
  templateId: number
  certificateNumber: string
  issuedAt: string
  expiresAt: string | null
  verificationUrl: string
  status: string
  userName?: string
  courseName?: string
}

interface CertificateTemplate {
  id: number
  name: string
  description: string
  templateHtml: string
  isDefault: boolean
}

export default function AdminCertificatesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'certificates' | 'templates'>('certificates')
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<CertificateTemplate | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<CertificateTemplate | null>(null)
  const [templateFormData, setTemplateFormData] = useState({
    name: '',
    description: '',
    templateHtml: '',
    isDefault: false,
  })

  const { data: certificates = [], isLoading: certificatesLoading } = useQuery<Certificate[]>({
    queryKey: ['admin-certificates'],
    queryFn: async () => {
      const response = await api.get('/certificates')
      return response.data.data || []
    },
  })

  const { data: templates = [], isLoading: templatesLoading } = useQuery<CertificateTemplate[]>({
    queryKey: ['certificate-templates'],
    queryFn: async () => {
      const response = await api.get('/certificates/templates')
      return response.data.data || []
    },
  })

  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateFormData) => {
      await api.post('/certificates/templates', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-templates'] })
      setIsTemplateDialogOpen(false)
      resetTemplateForm()
      toast({ title: 'Succès', description: 'Template créé avec succès' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la création', variant: 'destructive' })
    },
  })

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof templateFormData }) => {
      await api.put(`/certificates/templates/${id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-templates'] })
      setEditingTemplate(null)
      resetTemplateForm()
      toast({ title: 'Succès', description: 'Template mis à jour' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la mise à jour', variant: 'destructive' })
    },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/certificates/templates/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-templates'] })
      toast({ title: 'Succès', description: 'Template supprimé' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la suppression', variant: 'destructive' })
    },
  })

  const revokeCertificateMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.put(`/certificates/${id}/revoke`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-certificates'] })
      toast({ title: 'Succès', description: 'Certificat révoqué' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la révocation', variant: 'destructive' })
    },
  })

  const resetTemplateForm = () => {
    setTemplateFormData({
      name: '',
      description: '',
      templateHtml: '',
      isDefault: false,
    })
  }

  const handleEditTemplate = (template: CertificateTemplate) => {
    setEditingTemplate(template)
    setTemplateFormData({
      name: template.name,
      description: template.description,
      templateHtml: template.templateHtml,
      isDefault: template.isDefault,
    })
  }

  const handleSubmitTemplate = () => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: templateFormData })
    } else {
      createTemplateMutation.mutate(templateFormData)
    }
  }

  const renderTemplatePreview = (templateHtml: string) => {
    const sampleValues: Record<string, string> = {
      userName: 'Jean Dupont',
      courseName: 'Nom du cours',
      date: formatDate(new Date().toISOString()),
      certificateNumber: 'CERT-EXEMPLE-0001',
    }
    return Object.entries(sampleValues).reduce(
      (html, [key, value]) => html.split(`{${key}}`).join(value),
      templateHtml
    )
  }

  const filteredCertificates = certificates.filter((cert) =>
    cert.certificateNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cert.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cert.courseName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (certificatesLoading || templatesLoading) {
    return <PageLoading />
  }

  const issuedCount = certificates.filter((c) => c.status === 'issued').length
  const revokedCount = certificates.filter((c) => c.status === 'revoked').length

  const TemplateForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Nom du template</Label>
        <Input
          value={templateFormData.name}
          onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
          placeholder="Ex: Certificat Standard"
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={templateFormData.description}
          onChange={(e) => setTemplateFormData({ ...templateFormData, description: e.target.value })}
          placeholder="Description du template..."
        />
      </div>

      <div className="space-y-2">
        <Label>Template HTML</Label>
        <Textarea
          value={templateFormData.templateHtml}
          onChange={(e) => setTemplateFormData({ ...templateFormData, templateHtml: e.target.value })}
          placeholder="<div>...</div>"
          className="font-mono h-40"
        />
        <p className="text-xs text-muted-foreground">
          Variables disponibles: {'{'}userName{'}'}, {'{'}courseName{'}'}, {'{'}date{'}'}, {'{'}certificateNumber{'}'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isDefault"
          checked={templateFormData.isDefault}
          onChange={(e) => setTemplateFormData({ ...templateFormData, isDefault: e.target.checked })}
        />
        <Label htmlFor="isDefault">Template par défaut</Label>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestion des certificats</h1>
          <p className="text-muted-foreground">Gérez les certificats et les templates</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Award className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{certificates.length}</p>
                <p className="text-sm text-muted-foreground">Total certificats</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Award className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{issuedCount}</p>
                <p className="text-sm text-muted-foreground">Valides</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Award className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{revokedCount}</p>
                <p className="text-sm text-muted-foreground">Révoqués</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{templates.length}</p>
                <p className="text-sm text-muted-foreground">Templates</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeTab === 'certificates' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('certificates')}
        >
          Certificats ({certificates.length})
        </Button>
        <Button
          variant={activeTab === 'templates' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('templates')}
        >
          Templates ({templates.length})
        </Button>
      </div>

      {activeTab === 'certificates' && (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher un certificat..."
              className="pl-9"
            />
          </div>

          {/* Certificates table */}
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">N° Certificat</th>
                    <th className="text-left p-4 font-medium">Utilisateur</th>
                    <th className="text-left p-4 font-medium">Cours</th>
                    <th className="text-left p-4 font-medium">Émis le</th>
                    <th className="text-left p-4 font-medium">Expire</th>
                    <th className="text-left p-4 font-medium">Statut</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCertificates.map((cert) => (
                    <tr key={cert.id} className="hover:bg-muted/50">
                      <td className="p-4 font-mono text-sm">{cert.certificateNumber}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {cert.userName || `User #${cert.userId}`}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-muted-foreground" />
                          {cert.courseName || `Course #${cert.courseId}`}
                        </div>
                      </td>
                      <td className="p-4 text-sm">{formatDate(cert.issuedAt)}</td>
                      <td className="p-4 text-sm">
                        {cert.expiresAt ? formatDate(cert.expiresAt) : '-'}
                      </td>
                      <td className="p-4">
                        <Badge
                          variant={cert.status === 'issued' ? 'default' : 'destructive'}
                          className={cert.status === 'issued' ? 'bg-green-600' : ''}
                        >
                          {cert.status === 'issued' ? 'Valide' : 'Révoqué'}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Download className="h-4 w-4" />
                          </Button>
                          {cert.status === 'issued' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => revokeCertificateMutation.mutate(cert.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCertificates.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        Aucun certificat trouvé
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'templates' && (
        <>
          <div className="flex justify-end">
            <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetTemplateForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nouveau template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Créer un template</DialogTitle>
                  <DialogDescription>
                    Définissez le design et le contenu du certificat
                  </DialogDescription>
                </DialogHeader>
                <TemplateForm />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleSubmitTemplate} disabled={createTemplateMutation.isPending}>
                    {createTemplateMutation.isPending ? 'Création...' : 'Créer'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription>{template.description}</CardDescription>
                    </div>
                    {template.isDefault && (
                      <Badge>Par défaut</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditTemplate(template)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Modifier
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(template)}>
                      <Eye className="h-4 w-4 mr-1" />
                      Aperçu
                    </Button>
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTemplateMutation.mutate(template.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Edit Template Dialog */}
          <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Modifier le template</DialogTitle>
              </DialogHeader>
              <TemplateForm />
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                  Annuler
                </Button>
                <Button onClick={handleSubmitTemplate} disabled={updateTemplateMutation.isPending}>
                  {updateTemplateMutation.isPending ? 'Mise à jour...' : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Preview Template Dialog */}
          <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Aperçu — {previewTemplate?.name}</DialogTitle>
                <DialogDescription>
                  Rendu avec des données d'exemple. Ceci ne reflète pas encore la mise en page du PDF généré.
                </DialogDescription>
              </DialogHeader>
              {previewTemplate?.templateHtml ? (
                <iframe
                  title="Aperçu du template"
                  className="w-full h-96 border rounded-md bg-white"
                  sandbox=""
                  srcDoc={renderTemplatePreview(previewTemplate.templateHtml)}
                />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Ce template n'a pas encore de contenu HTML.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
                  Fermer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
