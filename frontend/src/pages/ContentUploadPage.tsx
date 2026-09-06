import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileUpload, FileWithPreview } from '@/components/ui/file-upload'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import {
  Download,
  Trash2,
  File as FileIcon,
  Upload as UploadIcon,
} from 'lucide-react'
import { api } from '@/services/api'
import { fileService } from '@/services/file.service'

interface LessonFile {
  id: number
  lesson_id: number
  file_id: number
  filename: string
  original_filename: string
  file_type: string
  mime_type: string
  size: number
  uploaded_by: string
  uploaded_at: string
}

export default function ContentUploadPage() {
  const { t } = useTranslation('courses')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const [selectedFiles, setSelectedFiles] = useState<FileWithPreview[]>([])
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map())
  const [lessonId, setLessonId] = useState<string>('')
  const [contentTitle, setContentTitle] = useState<string>('')
  const [contentBody, setContentBody] = useState<string>('')
  const [contentType, setContentType] = useState<string>('pdf')

  // Fetch lessons list
  const { data: lessons, isLoading: loadingLessons } = useQuery({
    queryKey: ['lessons-list'],
    queryFn: async () => {
      const response = await api.get('/lessons')
      return response.data?.data || []
    },
  })

  // Fetch uploaded files for selected lesson
  const { data: lessonFiles, refetch: refetchFiles } = useQuery({
    queryKey: ['lesson-files', lessonId],
    queryFn: async () => {
      if (!lessonId) return []
      const response = await api.get(`/lessons/${lessonId}/files`)
      return response.data?.data || []
    },
    enabled: !!lessonId,
  })

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: number) => fileService.deleteFile(fileId),
    onSuccess: () => {
      toast({
        title: tCommon('status.success'),
        description: t('contentUpload.deleteSuccessDescription'),
        variant: 'default',
      })
      refetchFiles()
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.message || t('contentUpload.deleteErrorDescription'),
        variant: 'destructive',
      })
    },
  })

  const handleFilesSelected = async (files: File[]) => {
    if (!lessonId) {
      toast({
        title: tCommon('status.error'),
        description: t('contentUpload.selectLessonError'),
        variant: 'destructive',
      })
      return
    }

    try {
      for (const file of files) {
        const fileKey = `${file.name}-${file.size}`
        setUploadingFiles((prev) => new Map(prev).set(fileKey, 0))

        const uploadedFile = await fileService.uploadFile(
          file,
          (progress) => {
            setUploadingFiles((prev) => new Map(prev).set(fileKey, progress))
          },
          'lessons'
        )

        // Create content entry with the uploaded file
        await api.post('/contents', {
          lessonId: parseInt(lessonId),
          type: contentType,
          title: contentTitle || file.name,
          body: contentBody,
          fileId: uploadedFile.id,
        })

        setUploadingFiles((prev) => {
          const newMap = new Map(prev)
          newMap.delete(fileKey)
          return newMap
        })
      }

      toast({
        title: tCommon('status.success'),
        description: t('contentUpload.uploadSuccessDescription', { count: files.length }),
        variant: 'default',
      })

      setSelectedFiles([])
      setContentTitle('')
      setContentBody('')
      refetchFiles()
    } catch (error: any) {
      toast({
        title: tCommon('status.error'),
        description: error.message || t('contentUpload.uploadErrorDescription'),
        variant: 'destructive',
      })
    }
  }

  const handleDownloadFile = async (fileId: number, filename: string) => {
    try {
      await fileService.downloadFile(fileId, filename)
    } catch (error: any) {
      toast({
        title: tCommon('status.error'),
        description: t('contentUpload.downloadErrorDescription'),
        variant: 'destructive',
      })
    }
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return '📄'
    if (mimeType.includes('word') || mimeType.includes('document'))
      return '📝'
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation'))
      return '🎯'
    if (mimeType.includes('sheet') || mimeType.includes('excel'))
      return '📊'
    if (mimeType.includes('image')) return '🖼️'
    return '📎'
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  if (loadingLessons) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('contentUpload.title')}</h1>
        <p className="text-muted-foreground">
          {t('contentUpload.subtitle')}
        </p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('contentUpload.addFilesTitle')}</CardTitle>
          <CardDescription>
            {t('contentUpload.addFilesSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Lesson Selection */}
          <div>
            <Label htmlFor="lesson-select">{t('contentUpload.lessonLabel')}</Label>
            <select
              id="lesson-select"
              value={lessonId}
              onChange={(e) => {
                setLessonId(e.target.value)
                setSelectedFiles([])
              }}
              className="w-full mt-2 p-2 border border-input rounded-md bg-background"
            >
              <option value="">{t('contentUpload.selectLessonPlaceholder')}</option>
              {lessons?.map((lesson: any) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title} ({lesson.module_title})
                </option>
              ))}
            </select>
          </div>

          {lessonId && (
            <>
              {/* Content Details */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="content-type">{t('contentUpload.contentTypeLabel')}</Label>
                  <select
                    id="content-type"
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value)}
                    className="w-full mt-2 p-2 border border-input rounded-md bg-background"
                  >
                    <option value="pdf">{t('contentUpload.contentTypes.pdf')}</option>
                    <option value="docx">{t('contentUpload.contentTypes.docx')}</option>
                    <option value="image">{t('contentUpload.contentTypes.image')}</option>
                    <option value="video_mp4">{t('contentUpload.contentTypes.video')}</option>
                    <option value="text">{t('contentUpload.contentTypes.text')}</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="content-title">{t('contentUpload.contentTitleLabel')}</Label>
                  <Input
                    id="content-title"
                    placeholder={t('contentUpload.contentTitlePlaceholder')}
                    value={contentTitle}
                    onChange={(e) => setContentTitle(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="content-body">{t('contentUpload.descriptionLabel')}</Label>
                <Textarea
                  id="content-body"
                  placeholder={t('contentUpload.descriptionPlaceholder')}
                  value={contentBody}
                  onChange={(e) => setContentBody(e.target.value)}
                  className="mt-2"
                  rows={3}
                />
              </div>

              {/* File Upload */}
              <div>
                <Label>{t('contentUpload.filesToUploadLabel')}</Label>
                <div className="mt-2">
                  <FileUpload
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.mp4"
                    multiple={true}
                    maxFiles={10}
                    maxSize={100 * 1024 * 1024}
                    onFilesChange={setSelectedFiles}
                    onFilesSelected={handleFilesSelected}
                  />
                </div>
              </div>

              {/* Upload Button */}
              {selectedFiles.length > 0 && (
                <div className="flex flex-col items-end gap-2">
                  {uploadingFiles.size > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t('contentUpload.uploadingCount', { count: uploadingFiles.size })}
                    </p>
                  )}
                  <Button
                    onClick={() => {
                      handleFilesSelected(
                        selectedFiles.map((f) => f.file)
                      )
                    }}
                    disabled={selectedFiles.some((f) => f.status === 'uploading') || uploadingFiles.size > 0}
                  >
                    <UploadIcon className="h-4 w-4 mr-2" />
                    {t('contentUpload.uploadButton', { count: selectedFiles.length })}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Files List */}
      {lessonId && lessonFiles && lessonFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('contentUpload.lessonFilesTitle')}</CardTitle>
            <CardDescription>
              {t('contentUpload.uploadedCount', { count: lessonFiles.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lessonFiles.map((file: LessonFile) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-2xl flex-shrink-0">
                      {getFileIcon(file.mime_type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {file.original_filename}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                        <span className="text-xs text-muted-foreground">·</span>
                        <p className="text-xs text-muted-foreground">
                          {t('contentUpload.uploadedBy', { name: file.uploaded_by })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline">{file.file_type}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        handleDownloadFile(file.file_id, file.original_filename)
                      }
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteFileMutation.mutate(file.id)}
                      disabled={deleteFileMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {lessonId && (!lessonFiles || lessonFiles.length === 0) && (
        <Card>
          <CardContent className="pt-8">
            <div className="text-center py-8">
              <FileIcon className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground font-medium">
                {t('contentUpload.noFiles')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('contentUpload.noFilesHint')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
