import React, { useState } from 'react'
import { FileUpload } from '@/components/ui/file-upload'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Upload as UploadIcon, CheckCircle2 } from 'lucide-react'
import { fileService } from '@/services/file.service'

interface SimpleFileUploadProps {
  onFilesUploaded?: (files: any[]) => void
  folder?: string
  maxFiles?: number
  accept?: string
  multiple?: boolean
}

export const SimpleFileUpload: React.FC<SimpleFileUploadProps> = ({
  onFilesUploaded,
  folder = 'documents',
  maxFiles = 5,
  accept = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg',
  multiple = true,
}) => {
  const { toast } = useToast()
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])

  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)
    try {
      const results = await fileService.uploadFiles(files, undefined, folder)
      setUploadedFiles(results)
      setFiles([])

      toast({
        title: 'Succès',
        description: `${results.length} fichier(s) uploadé(s)`,
      })

      onFilesUploaded?.(results)
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message || 'Erreur lors de l\'upload',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <FileUpload
        accept={accept}
        multiple={multiple}
        maxFiles={maxFiles}
        onFilesSelected={(selectedFiles) => setFiles(selectedFiles)}
        disabled={uploading}
      />

      {files.length > 0 && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setFiles([])}
            disabled={uploading}
          >
            Annuler
          </Button>
          <Button onClick={handleUpload} disabled={uploading || files.length === 0}>
            <UploadIcon className="h-4 w-4 mr-2" />
            {uploading ? 'Téléchargement...' : `Uploader (${files.length})`}
          </Button>
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Fichiers uploadés:</p>
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900"
            >
              <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span className="text-sm text-green-800 dark:text-green-300 flex-1 truncate">
                {file.original_filename}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
