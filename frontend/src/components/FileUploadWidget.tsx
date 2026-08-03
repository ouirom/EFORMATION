import React, { useState } from 'react'
import { FileUpload, FileWithPreview } from '@/components/ui/file-upload'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Download, Trash2 } from 'lucide-react'
import { fileService } from '@/services/file.service'
import { api } from '@/services/api'

interface FileWidgetProps {
  lessonId?: number
  moduleId?: number
  onFilesUploaded?: (fileIds: number[]) => void
}

interface LessonFileInfo {
  id: number
  filename: string
  original_filename: string
  mime_type: string
  size: number
  created_at: string
}

export const FileUploadWidget: React.FC<FileWidgetProps> = ({
  lessonId,
  moduleId,
  onFilesUploaded,
}) => {
  const { toast } = useToast()
  const [, setSelectedFiles] = useState<FileWithPreview[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const handleFilesSelected = async (files: File[]) => {
    if (!lessonId && !moduleId) {
      toast({
        title: 'Erreur',
        description: 'Aucune leçon ou module sélectionné',
        variant: 'destructive',
      })
      return
    }

    setIsUploading(true)
    const uploadedFileIds: number[] = []

    try {
      for (const file of files) {
        const uploadedFile = await fileService.uploadFile(
          file,
          undefined,
          lessonId ? 'lessons' : 'modules'
        )

        uploadedFileIds.push(uploadedFile.id)

        // Create content entry
        if (lessonId) {
          await api.post('/contents', {
            lessonId,
            type: getContentType(file.type),
            title: file.name,
            fileId: uploadedFile.id,
          })
        }
      }

      toast({
        title: 'Succès',
        description: `${files.length} fichier(s) uploadé(s)`,
        variant: 'default',
      })

      setSelectedFiles([])
      onFilesUploaded?.(uploadedFileIds)
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message || 'Erreur lors de l\'upload',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const getContentType = (mimeType: string) => {
    if (mimeType.includes('pdf')) return 'pdf'
    if (mimeType.includes('word') || mimeType.includes('document'))
      return 'docx'
    if (mimeType.includes('image')) return 'image'
    if (mimeType.includes('video')) return 'video_mp4'
    return 'text'
  }

  return (
    <div className="space-y-4">
      <FileUpload
        accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.mp4"
        multiple={true}
        maxFiles={10}
        maxSize={100 * 1024 * 1024}
        onFilesChange={setSelectedFiles}
        onFilesSelected={handleFilesSelected}
        disabled={isUploading}
      />
    </div>
  )
}

interface FileListWidgetProps {
  lessonId?: number
  files?: LessonFileInfo[]
  onFileDeleted?: () => void
}

export const FileListWidget: React.FC<FileListWidgetProps> = ({
  files = [],
  onFileDeleted,
}) => {
  const { toast } = useToast()
  const [deleting, setDeleting] = useState<number | null>(null)

  const handleDeleteFile = async (fileId: number) => {
    try {
      setDeleting(fileId)
      await fileService.deleteFile(fileId)

      toast({
        title: 'Succès',
        description: 'Fichier supprimé',
        variant: 'default',
      })

      onFileDeleted?.()
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression',
        variant: 'destructive',
      })
    } finally {
      setDeleting(null)
    }
  }

  const handleDownloadFile = async (fileId: number, filename: string) => {
    try {
      await fileService.downloadFile(fileId, filename)
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: 'Erreur lors du téléchargement',
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
    if (mimeType.includes('video')) return '🎬'
    return '📎'
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  if (files.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Fichiers</CardTitle>
        <CardDescription>{files.length} fichier(s)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {files.map((file) => (
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
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    handleDownloadFile(file.id, file.original_filename)
                  }
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deleting === file.id}
                  onClick={() => handleDeleteFile(file.id)}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
