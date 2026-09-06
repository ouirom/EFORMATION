import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  Image as ImageIcon,
  Upload,
} from 'lucide-react'
import { api } from '@/services/api'
import { fileService } from '@/services/file.service'
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

interface TemplateFormValues {
  name: string
  description: string
  templateHtml: string
  isDefault: boolean
}

interface CertificateWatermark {
  id: number
  name: string | null
  isDefault: boolean
  storageKey: string
  mimeType: string
}

// Defined at module scope (not inside AdminCertificatesPage) so its identity
// stays stable across parent re-renders -- a component defined inside another
// component's render body gets recreated as a new type on every render,
// which makes React unmount and remount its inputs on every keystroke,
// resetting cursor position each time.
function TemplateForm({
  t,
  formData,
  onChange,
  isEditing,
}: {
  t: (key: string) => string
  formData: TemplateFormValues
  onChange: (data: TemplateFormValues) => void
  isEditing: boolean
}) {
  const idPrefix = isEditing ? 'edit-template' : 'add-template'
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>{t('certificatesAdmin.form.name')}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={formData.name}
          onChange={(e) => onChange({ ...formData, name: e.target.value })}
          placeholder={t('certificatesAdmin.form.namePlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>{t('certificatesAdmin.form.description')}</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={formData.description}
          onChange={(e) => onChange({ ...formData, description: e.target.value })}
          placeholder={t('certificatesAdmin.form.descriptionPlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-html`}>{t('certificatesAdmin.form.html')}</Label>
        <Textarea
          id={`${idPrefix}-html`}
          value={formData.templateHtml}
          onChange={(e) => onChange({ ...formData, templateHtml: e.target.value })}
          placeholder="<div>...</div>"
          className="font-mono h-40"
        />
        <p className="text-xs text-muted-foreground">
          {t('certificatesAdmin.form.availableVariables')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('certificatesAdmin.form.dimensionsHint')}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`${idPrefix}-is-default`}
          checked={formData.isDefault}
          onChange={(e) => onChange({ ...formData, isDefault: e.target.checked })}
        />
        <Label htmlFor={`${idPrefix}-is-default`}>{t('certificatesAdmin.form.isDefault')}</Label>
      </div>
    </div>
  )
}

export default function AdminCertificatesPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'certificates' | 'templates' | 'watermarks'>('certificates')
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<CertificateTemplate | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<CertificateTemplate | null>(null)
  const [previewCertificateUrl, setPreviewCertificateUrl] = useState<string | null>(null)
  const [templateFormData, setTemplateFormData] = useState({
    name: '',
    description: '',
    templateHtml: '',
    isDefault: false,
  })
  const [isWatermarkDialogOpen, setIsWatermarkDialogOpen] = useState(false)
  const [watermarkName, setWatermarkName] = useState('')
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null)
  const [isUploadingWatermark, setIsUploadingWatermark] = useState(false)

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

  const { data: watermarks = [], isLoading: watermarksLoading } = useQuery<CertificateWatermark[]>({
    queryKey: ['certificate-watermarks'],
    queryFn: async () => {
      const response = await api.get('/certificates/watermarks')
      return response.data.data || []
    },
  })

  const createWatermarkMutation = useMutation({
    mutationFn: async (data: { fileId: number; name: string }) => {
      await api.post('/certificates/watermarks', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-watermarks'] })
      setIsWatermarkDialogOpen(false)
      setWatermarkName('')
      setWatermarkFile(null)
      toast({ title: tCommon('status.success'), description: t('certificatesAdmin.toasts.watermarkCreatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.watermarkCreateErrorDescription'), variant: 'destructive' })
    },
  })

  const setDefaultWatermarkMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.put(`/certificates/watermarks/${id}`, { isDefault: true })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-watermarks'] })
      toast({ title: tCommon('status.success'), description: t('certificatesAdmin.toasts.watermarkUpdatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.watermarkUpdateErrorDescription'), variant: 'destructive' })
    },
  })

  const deleteWatermarkMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/certificates/watermarks/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-watermarks'] })
      toast({ title: tCommon('status.success'), description: t('certificatesAdmin.toasts.watermarkDeletedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.watermarkDeleteErrorDescription'), variant: 'destructive' })
    },
  })

  const handleUploadWatermark = async () => {
    if (!watermarkFile) return
    setIsUploadingWatermark(true)
    try {
      const uploaded = await fileService.uploadFile(watermarkFile, undefined, 'watermarks')
      createWatermarkMutation.mutate({ fileId: uploaded.id, name: watermarkName || watermarkFile.name })
    } catch (error) {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.watermarkCreateErrorDescription'), variant: 'destructive' })
    } finally {
      setIsUploadingWatermark(false)
    }
  }

  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateFormData) => {
      await api.post('/certificates/templates', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-templates'] })
      setIsTemplateDialogOpen(false)
      resetTemplateForm()
      toast({ title: tCommon('status.success'), description: t('certificatesAdmin.toasts.templateCreatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.templateCreateErrorDescription'), variant: 'destructive' })
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
      toast({ title: tCommon('status.success'), description: t('certificatesAdmin.toasts.templateUpdatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.templateUpdateErrorDescription'), variant: 'destructive' })
    },
  })

  const setDefaultTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.put(`/certificates/templates/${id}`, { isDefault: true })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-templates'] })
      toast({ title: tCommon('status.success'), description: t('certificatesAdmin.toasts.templateUpdatedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.templateUpdateErrorDescription'), variant: 'destructive' })
    },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/certificates/templates/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-templates'] })
      toast({ title: tCommon('status.success'), description: t('certificatesAdmin.toasts.templateDeletedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.templateDeleteErrorDescription'), variant: 'destructive' })
    },
  })

  const revokeCertificateMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.put(`/certificates/${id}/revoke`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-certificates'] })
      toast({ title: tCommon('status.success'), description: t('certificatesAdmin.toasts.revokedDescription') })
    },
    onError: () => {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.revokeErrorDescription'), variant: 'destructive' })
    },
  })

  const handleViewCertificate = async (certificateId: number) => {
    try {
      const response = await api.get(`/certificates/${certificateId}/download`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
      setPreviewCertificateUrl(url)
    } catch (error) {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.viewErrorDescription'), variant: 'destructive' })
    }
  }

  const closeCertificatePreview = () => {
    if (previewCertificateUrl) window.URL.revokeObjectURL(previewCertificateUrl)
    setPreviewCertificateUrl(null)
  }

  const handleDownloadCertificate = async (certificateId: number, certificateNumber: string) => {
    try {
      const response = await api.get(`/certificates/${certificateId}/download`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `certificate-${certificateNumber}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      toast({ title: tCommon('status.error'), description: t('certificatesAdmin.toasts.downloadErrorDescription'), variant: 'destructive' })
    }
  }

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
      courseName: t('certificatesAdmin.previewSampleCourseName'),
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

  if (certificatesLoading || templatesLoading || watermarksLoading) {
    return <PageLoading />
  }

  const issuedCount = certificates.filter((c) => c.status === 'issued').length
  const revokedCount = certificates.filter((c) => c.status === 'revoked').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('certificatesAdmin.title')}</h1>
          <p className="text-muted-foreground">{t('certificatesAdmin.subtitle')}</p>
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
                <p className="text-sm text-muted-foreground">{t('certificatesAdmin.stats.total')}</p>
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
                <p className="text-sm text-muted-foreground">{t('certificatesAdmin.stats.valid')}</p>
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
                <p className="text-sm text-muted-foreground">{t('certificatesAdmin.stats.revoked')}</p>
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
                <p className="text-sm text-muted-foreground">{t('certificatesAdmin.stats.templates')}</p>
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
          {t('certificatesAdmin.tabs.certificates', { count: certificates.length })}
        </Button>
        <Button
          variant={activeTab === 'templates' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('templates')}
        >
          {t('certificatesAdmin.tabs.templates', { count: templates.length })}
        </Button>
        <Button
          variant={activeTab === 'watermarks' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('watermarks')}
        >
          {t('certificatesAdmin.tabs.watermarks', { count: watermarks.length })}
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
              placeholder={t('certificatesAdmin.searchPlaceholder')}
              className="pl-9"
            />
          </div>

          {/* Certificates table */}
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">{t('certificatesAdmin.table.certificateNumber')}</th>
                    <th className="text-left p-4 font-medium">{t('certificatesAdmin.table.user')}</th>
                    <th className="text-left p-4 font-medium">{t('certificatesAdmin.table.course')}</th>
                    <th className="text-left p-4 font-medium">{t('certificatesAdmin.table.issuedOn')}</th>
                    <th className="text-left p-4 font-medium">{t('certificatesAdmin.table.expires')}</th>
                    <th className="text-left p-4 font-medium">{t('certificatesAdmin.table.status')}</th>
                    <th className="text-left p-4 font-medium">{t('certificatesAdmin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCertificates.map((cert) => (
                    <tr key={cert.id} className="hover:bg-muted/50">
                      <td className="p-4 font-mono text-sm">{cert.certificateNumber}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {cert.userName || t('certificatesAdmin.table.userFallback', { id: cert.userId })}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-muted-foreground" />
                          {cert.courseName || t('certificatesAdmin.table.courseFallback', { id: cert.courseId })}
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
                          {cert.status === 'issued' ? t('certificatesAdmin.table.valid') : t('certificatesAdmin.table.revoked')}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleViewCertificate(cert.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDownloadCertificate(cert.id, cert.certificateNumber)}>
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
                        {t('certificatesAdmin.table.noResults')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Certificate PDF Preview Dialog */}
          <Dialog open={!!previewCertificateUrl} onOpenChange={(open) => !open && closeCertificatePreview()}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t('certificatesAdmin.pdfPreviewDialog.title')}</DialogTitle>
              </DialogHeader>
              {previewCertificateUrl && (
                <iframe
                  title={t('certificatesAdmin.pdfPreviewDialog.iframeTitle')}
                  src={previewCertificateUrl}
                  className="w-full h-[70vh] border rounded-md"
                />
              )}
              <DialogFooter>
                <Button variant="outline" onClick={closeCertificatePreview}>
                  {t('certificatesAdmin.pdfPreviewDialog.close')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {activeTab === 'templates' && (
        <>
          <div className="flex justify-end">
            <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetTemplateForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('certificatesAdmin.newTemplate')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t('certificatesAdmin.createDialog.title')}</DialogTitle>
                  <DialogDescription>
                    {t('certificatesAdmin.createDialog.description')}
                  </DialogDescription>
                </DialogHeader>
                <TemplateForm t={t} formData={templateFormData} onChange={setTemplateFormData} isEditing={false} />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>
                    {t('certificatesAdmin.createDialog.cancel')}
                  </Button>
                  <Button onClick={handleSubmitTemplate} disabled={createTemplateMutation.isPending}>
                    {createTemplateMutation.isPending ? t('certificatesAdmin.createDialog.creating') : t('certificatesAdmin.createDialog.create')}
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
                      <Badge>{t('certificatesAdmin.templateCard.default')}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditTemplate(template)}>
                      <Edit className="h-4 w-4 mr-1" />
                      {t('certificatesAdmin.templateCard.edit')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(template)}>
                      <Eye className="h-4 w-4 mr-1" />
                      {t('certificatesAdmin.templateCard.preview')}
                    </Button>
                    {!template.isDefault && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDefaultTemplateMutation.mutate(template.id)}
                          disabled={setDefaultTemplateMutation.isPending}
                        >
                          {t('certificatesAdmin.templateCard.setDefault')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteTemplateMutation.mutate(template.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </>
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
                <DialogTitle>{t('certificatesAdmin.editDialog.title')}</DialogTitle>
              </DialogHeader>
              <TemplateForm t={t} formData={templateFormData} onChange={setTemplateFormData} isEditing={true} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                  {t('certificatesAdmin.editDialog.cancel')}
                </Button>
                <Button onClick={handleSubmitTemplate} disabled={updateTemplateMutation.isPending}>
                  {updateTemplateMutation.isPending ? t('certificatesAdmin.editDialog.saving') : t('certificatesAdmin.editDialog.save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Preview Template Dialog */}
          <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t('certificatesAdmin.previewDialog.title', { name: previewTemplate?.name })}</DialogTitle>
                <DialogDescription>
                  {t('certificatesAdmin.previewDialog.description')}
                </DialogDescription>
              </DialogHeader>
              {previewTemplate?.templateHtml ? (
                <iframe
                  title={t('certificatesAdmin.previewDialog.iframeTitle')}
                  className="w-full h-96 border rounded-md bg-white"
                  sandbox=""
                  srcDoc={renderTemplatePreview(previewTemplate.templateHtml)}
                />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {t('certificatesAdmin.previewDialog.noContent')}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
                  {t('certificatesAdmin.previewDialog.close')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {activeTab === 'watermarks' && (
        <>
          <div className="flex justify-end">
            <Dialog
              open={isWatermarkDialogOpen}
              onOpenChange={(open) => {
                setIsWatermarkDialogOpen(open)
                if (!open) {
                  setWatermarkName('')
                  setWatermarkFile(null)
                }
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('certificatesAdmin.watermarks.add')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('certificatesAdmin.watermarks.addDialog.title')}</DialogTitle>
                  <DialogDescription>{t('certificatesAdmin.watermarks.addDialog.description')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="watermark-name">{t('certificatesAdmin.watermarks.form.name')}</Label>
                    <Input
                      id="watermark-name"
                      value={watermarkName}
                      onChange={(e) => setWatermarkName(e.target.value)}
                      placeholder={t('certificatesAdmin.watermarks.form.namePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="watermark-image">{t('certificatesAdmin.watermarks.form.image')}</Label>
                    <input
                      id="watermark-image"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setWatermarkFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('certificatesAdmin.watermarks.form.dimensionsHint')}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsWatermarkDialogOpen(false)}>
                    {t('certificatesAdmin.createDialog.cancel')}
                  </Button>
                  <Button
                    onClick={handleUploadWatermark}
                    disabled={!watermarkFile || isUploadingWatermark || createWatermarkMutation.isPending}
                  >
                    {isUploadingWatermark || createWatermarkMutation.isPending ? (
                      <>
                        <Upload className="h-4 w-4 mr-2 animate-pulse" />
                        {t('certificatesAdmin.watermarks.addDialog.uploading')}
                      </>
                    ) : (
                      t('certificatesAdmin.createDialog.create')
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {watermarks.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('certificatesAdmin.watermarks.none')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {watermarks.map((watermark) => (
                <Card key={watermark.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{watermark.name}</CardTitle>
                      {watermark.isDefault && (
                        <Badge>{t('certificatesAdmin.templateCard.default')}</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-center h-32 rounded-md border bg-muted/30 overflow-hidden">
                      <img
                        src={`/uploads/${watermark.storageKey}`}
                        alt={watermark.name || ''}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {!watermark.isDefault && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDefaultWatermarkMutation.mutate(watermark.id)}
                            disabled={setDefaultWatermarkMutation.isPending}
                          >
                            {t('certificatesAdmin.templateCard.setDefault')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteWatermarkMutation.mutate(watermark.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
