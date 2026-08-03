# Exemples d'Intégration - Système de Gestion de Fichiers

## 🎯 Exemples Pratiques

### Exemple 1: Upload Basique dans une Leçon

```typescript
// Dans une page de leçon
import { useState } from 'react'
import { SimpleFileUpload } from '@/components/SimpleFileUpload'

export function LessonPage() {
  const [uploadedFileIds, setUploadedFileIds] = useState<number[]>([])

  return (
    <div className="space-y-6">
      <h1>Ma Leçon</h1>
      
      <SimpleFileUpload
        folder="lessons"
        maxFiles={5}
        onFilesUploaded={(files) => {
          setUploadedFileIds(files.map(f => f.id))
          // Rafraîchir la liste des contenus
        }}
      />

      {uploadedFileIds.length > 0 && (
        <p>✅ {uploadedFileIds.length} fichier(s) uploadé(s)</p>
      )}
    </div>
  )
}
```

---

### Exemple 2: Gestion Complète avec Métadonnées

```typescript
// Pour les admins qui veulent ajouter des détails
import { useState } from 'react'
import ContentUploadPage from '@/pages/ContentUploadPage'

// Accédez directement via: http://localhost:3000/content-upload
// Ou intégrez-le dans un composant:

export function AdminContentManagement() {
  return <ContentUploadPage />
}
```

---

### Exemple 3: Upload avec Progression Personnalisée

```typescript
import { useState } from 'react'
import { FileUpload } from '@/components/ui/file-upload'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { fileService } from '@/services/file.service'
import { useToast } from '@/components/ui/use-toast'

export function CustomUploadProgress() {
  const { toast } = useToast()
  const [files, setFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)

  const handleUpload = async () => {
    setIsUploading(true)
    try {
      // Upload avec progression
      await fileService.uploadFiles(
        files,
        (fileIndex, progress) => {
          const totalProgress = 
            Math.round(((fileIndex + progress / 100) / files.length) * 100)
          setUploadProgress(totalProgress)
        },
        'documents'
      )

      toast({
        title: 'Succès!',
        description: `${files.length} fichier(s) uploadé(s)`,
      })
      setFiles([])
      setUploadProgress(0)
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Échec de l\'upload',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <FileUpload
        multiple={true}
        onFilesSelected={setFiles}
        disabled={isUploading}
      />

      {files.length > 0 && (
        <div className="space-y-3">
          <Button 
            onClick={handleUpload} 
            disabled={isUploading}
            className="w-full"
          >
            {isUploading ? `Upload... ${uploadProgress}%` : 'Uploader'}
          </Button>
          
          {isUploading && (
            <Progress value={uploadProgress} className="h-2" />
          )}
        </div>
      )}
    </div>
  )
}
```

---

### Exemple 4: Intégration dans un Modal

```typescript
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/ui/file-upload'
import { Plus } from 'lucide-react'

export function UploadModalExample() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Ajouter un Fichier
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload de Fichier</DialogTitle>
          </DialogHeader>

          <FileUpload
            multiple={true}
            accept=".pdf,.doc,.docx"
            onFilesSelected={(files) => {
              console.log('Fichiers sélectionnés:', files)
              setIsOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
```

---

### Exemple 5: Affichage et Téléchargement

```typescript
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Trash2 } from 'lucide-react'
import { api } from '@/services/api'
import { fileService } from '@/services/file.service'

export function FileListExample() {
  const { data: files, refetch } = useQuery({
    queryKey: ['my-files'],
    queryFn: () => api.files.list({ folder: 'lessons', limit: 20 }),
  })

  const handleDownload = async (fileId: number, filename: string) => {
    await fileService.downloadFile(fileId, filename)
  }

  const handleDelete = async (fileId: number) => {
    await fileService.deleteFile(fileId)
    refetch()
  }

  return (
    <div className="space-y-2">
      {files?.map((file) => (
        <Card key={file.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{file.original_filename}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload(file.id, file.original_filename)}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDelete(file.id)}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}
```

---

### Exemple 6: Upload Drag-and-Drop Personnalisé

```typescript
import { useState } from 'react'
import { FileUpload } from '@/components/ui/file-upload'
import { Card } from '@/components/ui/card'
import { Cloud } from 'lucide-react'

export function DragDropUpload() {
  const [isDragging, setIsDragging] = useState(false)

  return (
    <div
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={() => setIsDragging(false)}
      className={`transition-colors ${
        isDragging ? 'bg-primary/10' : 'bg-muted/50'
      } p-8 rounded-lg`}
    >
      <div className="text-center space-y-3">
        <Cloud className="h-12 w-12 mx-auto text-primary" />
        <h3 className="font-semibold">Déposez vos fichiers ici</h3>
        <p className="text-sm text-muted-foreground">
          ou cliquez pour parcourir
        </p>
      </div>

      <FileUpload
        multiple={true}
        accept=".pdf,.ppt,.pptx,.doc,.docx"
        onFilesSelected={(files) => {
          console.log('Files dropped:', files)
          setIsDragging(false)
        }}
      />
    </div>
  )
}
```

---

### Exemple 7: Intégration Admin Dashboard

```typescript
// Dans AdminCourseEditPage
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { ContentUploadPage } from '@/pages/ContentUploadPage'

export function AdminCourseEdit() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gestion des Ressources</CardTitle>
        </CardHeader>
      </Card>

      {/* Page complète d'upload intégrée */}
      <ContentUploadPage />
    </div>
  )
}
```

---

### Exemple 8: Validation Personnalisée

```typescript
import { useState } from 'react'
import { FileUpload } from '@/components/ui/file-upload'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function ValidatedUpload() {
  const [validationError, setValidationError] = useState<string>('')

  const validateFiles = (files: File[]) => {
    setValidationError('')

    // Vérifier qu'il y a au moins 1 fichier
    if (files.length === 0) {
      setValidationError('Veuillez sélectionner au moins 1 fichier')
      return false
    }

    // Vérifier les extensions
    const allowedExt = ['pdf', 'docx', 'pptx']
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!allowedExt.includes(ext || '')) {
        setValidationError(`Format non autorisé: ${ext}`)
        return false
      }
    }

    return true
  }

  return (
    <div className="space-y-4">
      <FileUpload
        accept=".pdf,.docx,.pptx"
        onFilesSelected={(files) => {
          if (validateFiles(files)) {
            console.log('Upload valide:', files)
          }
        }}
      />

      {validationError && (
        <Alert variant="destructive">
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
```

---

### Exemple 9: Intégration Formulaire

```typescript
import { useForm } from 'react-hook-form'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileUpload } from '@/components/ui/file-upload'

interface CourseFormData {
  title: string
  description: string
  files: File[]
}

export function CourseFormWithFiles() {
  const { register, handleSubmit, setValue } = useForm<CourseFormData>()

  const onSubmit = async (data: CourseFormData) => {
    console.log('Form data with files:', data)
    // Envoyer au serveur
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label>Titre du Cours</label>
        <Input {...register('title')} required />
      </div>

      <div>
        <label>Description</label>
        <textarea
          {...register('description')}
          className="w-full border rounded-md p-2"
        />
      </div>

      <div>
        <label>Fichiers</label>
        <FileUpload
          multiple={true}
          onFilesSelected={(files) => setValue('files', files)}
        />
      </div>

      <Button type="submit">Créer le Cours</Button>
    </form>
  )
}
```

---

### Exemple 10: Intégration avec React Query

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fileService } from '@/services/file.service'

export function FileManagementWithQuery() {
  const queryClient = useQueryClient()

  // Query pour lister les fichiers
  const { data: files, isLoading } = useQuery({
    queryKey: ['files'],
    queryFn: () => fileService.listFiles({ limit: 20 }),
  })

  // Mutation pour uploader
  const uploadMutation = useMutation({
    mutationFn: (file: File) => fileService.uploadFile(file),
    onSuccess: (data) => {
      // Invalider et rafraîchir la liste
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })

  // Mutation pour supprimer
  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => fileService.deleteFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })

  if (isLoading) return <div>Chargement...</div>

  return (
    <div className="space-y-4">
      {files?.map((file) => (
        <div key={file.id} className="flex justify-between items-center p-3 border rounded">
          <span>{file.original_filename}</span>
          <button
            onClick={() => deleteMutation.mutate(file.id)}
            disabled={deleteMutation.isPending}
          >
            Supprimer
          </button>
        </div>
      ))}
    </div>
  )
}
```

---

## 📋 Checklist d'Intégration

Pour intégrer l'upload de fichiers dans votre page:

- [ ] Importer le composant approprié
- [ ] Ajouter les états nécessaires (`useState`)
- [ ] Implémenter le callback (`onFilesSelected` ou `onFilesUploaded`)
- [ ] Gérer les erreurs avec `useToast()`
- [ ] Rafraîchir les données après upload
- [ ] Ajouter la validation personnalisée si nécessaire
- [ ] Tester avec différents types de fichiers
- [ ] Tester la progression sur gros fichiers
- [ ] Vérifier les permissions utilisateur
- [ ] Tester sur mobile (drag-drop)

---

## 🎯 Cas d'Usage Courants

| Cas d'Usage | Composant | Exemple |
|---|---|---|
| Upload simple | `SimpleFileUpload` | Modal d'upload basique |
| Gestion complète | `ContentUploadPage` | Admin dashboard |
| Dans une leçon | `FileUploadWidget` | Leçon avec ressources |
| Liste de fichiers | `FileListWidget` | Affichage des ressources |
| UI personnalisée | `FileUpload` | Formulaire custom |

---

**Dernière mise à jour**: 2026-01-01
