import React, { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Upload, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from './button'
import { Progress } from './progress'

export interface FileUploadProps {
  accept?: string
  multiple?: boolean
  maxSize?: number // in bytes
  maxFiles?: number
  disabled?: boolean
  className?: string
  onFilesSelected?: (files: File[]) => void
  onFilesChange?: (files: FileWithPreview[]) => void
}

export interface FileWithPreview {
  file: File
  preview?: string
  progress?: number
  error?: string
  status?: 'pending' | 'uploading' | 'success' | 'error'
}

const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  (
    {
      accept = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif',
      multiple = true,
      maxSize = 100 * 1024 * 1024, // 100MB default
      maxFiles = 10,
      disabled = false,
      className,
      onFilesSelected,
      onFilesChange,
    },
    ref
  ) => {
    const [files, setFiles] = useState<FileWithPreview[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
    }

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const validateFiles = (filesToValidate: FileList | File[]) => {
      const fileArray = Array.from(filesToValidate)
      const errors: string[] = []
      const validFiles: FileWithPreview[] = []

      if (!multiple && fileArray.length > 1) {
        errors.push('Un seul fichier est autorisé')
        return validFiles
      }

      if (fileArray.length + files.length > maxFiles) {
        errors.push(`Maximum ${maxFiles} fichier(s) autorisé(s)`)
        return validFiles
      }

      fileArray.forEach((file) => {
        if (file.size > maxSize) {
          errors.push(`${file.name} dépasse la taille maximale de ${formatFileSize(maxSize)}`)
          return
        }

        validFiles.push({
          file,
          status: 'pending',
          progress: 0,
        })
      })

      if (errors.length > 0) {
        console.warn('File validation errors:', errors)
      }

      return validFiles
    }

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (disabled) return

      const droppedFiles = e.dataTransfer.files
      const validFiles = validateFiles(droppedFiles)
      addFiles(validFiles)
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const validFiles = validateFiles(e.target.files)
        addFiles(validFiles)
      }
      // Reset input
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }

    const addFiles = (newFiles: FileWithPreview[]) => {
      const updatedFiles = [...files, ...newFiles]
      setFiles(updatedFiles)
      onFilesSelected?.(newFiles.map((f) => f.file))
      onFilesChange?.(updatedFiles)
    }

    const removeFile = (index: number) => {
      const updatedFiles = files.filter((_, i) => i !== index)
      setFiles(updatedFiles)
      onFilesChange?.(updatedFiles)
    }

    const getFileIcon = (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase()

      if (['pdf'].includes(ext || '')) return '📄'
      if (['doc', 'docx'].includes(ext || '')) return '📝'
      if (['ppt', 'pptx'].includes(ext || '')) return '🎯'
      if (['xls', 'xlsx'].includes(ext || '')) return '📊'
      if (['png', 'jpg', 'jpeg', 'gif'].includes(ext || '')) return '🖼️'
      if (['txt'].includes(ext || '')) return '📋'

      return '📎'
    }

    const getStatusColor = (status?: string) => {
      switch (status) {
        case 'success':
          return 'text-green-600 dark:text-green-400'
        case 'error':
          return 'text-red-600 dark:text-red-400'
        case 'uploading':
          return 'text-blue-600 dark:text-blue-400'
        default:
          return 'text-muted-foreground'
      }
    }

    return (
      <div ref={ref} className={cn('w-full', className)}>
        {/* Drop Zone */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn(
            'relative rounded-lg border-2 border-dashed transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 bg-muted/25 hover:border-muted-foreground/50 hover:bg-muted/50',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            onChange={handleInputChange}
            className="hidden"
            aria-label="Upload files"
          />

          <div
            onClick={() => !disabled && inputRef.current?.click()}
            className={cn(
              'p-8 text-center cursor-pointer',
              disabled && 'cursor-not-allowed'
            )}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">
              Déposer les fichiers ici ou cliquer pour parcourir
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Formats: PDF, Word, PowerPoint, Excel, Images, Texte
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Taille max: {formatFileSize(maxSize)}
              {maxFiles && ` · Max ${maxFiles} fichier(s)`}
            </p>
          </div>
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <div className="mt-6 space-y-2">
            <h4 className="text-sm font-semibold">
              Fichier{files.length > 1 ? 's' : ''} sélectionné{files.length > 1 ? 's' : ''} ({files.length}/{maxFiles})
            </h4>
            <div className="space-y-2">
              {files.map((fileItem, index) => (
                <div
                  key={`${fileItem.file.name}-${index}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <span className="text-xl">{getFileIcon(fileItem.file)}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {fileItem.file.name}
                      </p>
                      {fileItem.status === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                      )}
                      {fileItem.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <p className={cn('text-xs', getStatusColor(fileItem.status))}>
                        {fileItem.status === 'uploading' && `Téléchargement: ${fileItem.progress}%`}
                        {fileItem.status === 'success' && 'Téléchargé'}
                        {fileItem.status === 'error' && fileItem.error}
                        {fileItem.status === 'pending' && formatFileSize(fileItem.file.size)}
                      </p>
                    </div>

                    {fileItem.status === 'uploading' && (
                      <Progress
                        value={fileItem.progress || 0}
                        className="h-1 mt-2"
                      />
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeFile(index)}
                    disabled={fileItem.status === 'uploading' || disabled}
                    className="flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
)

FileUpload.displayName = 'FileUpload'

export { FileUpload }

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}
