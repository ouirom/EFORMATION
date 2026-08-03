# Système de Gestion de Fichiers - Documentation

## Vue d'ensemble

Un système complet de gestion de fichiers a été implémenté pour permettre l'upload et la gestion des fichiers (PDF, Word, PowerPoint, Excel, Images, etc.) dans la plateforme e-learning.

## Fonctionnalités

### ✅ Upload de Fichiers

- **Formats Supportés**:
  - Documents: PDF, Word (.doc, .docx), PowerPoint (.ppt, .pptx), Excel (.xls, .xlsx)
  - Images: PNG, JPG, JPEG, GIF
  - Autres: TXT, MP4 (vidéos)

- **Limitations**:
  - Taille maximale par fichier: **100 MB**
  - Maximum de fichiers par upload: **10**

### 📁 Endpoints API Backend

#### POST `/api/v1/files/upload`
Upload un seul fichier
```typescript
// Request
FormData {
  file: File,
  folder?: string  // 'lessons' | 'modules' | etc
}

// Response
{
  id: number,
  filename: string,
  original_filename: string,
  mime_type: string,
  size: number,
  path: string,
  url: string,
  created_at: string
}
```

#### POST `/api/v1/files/upload-multiple`
Upload plusieurs fichiers (max 10)
```typescript
// Request
FormData {
  files: File[],
  folder?: string
}

// Response: FileUploadResponse[]
```

#### GET `/api/v1/files`
Liste les fichiers avec pagination
```typescript
// Query params
{
  page?: number,
  limit?: number,
  folder?: string,
  mimeType?: string
}
```

#### GET `/api/v1/files/:id`
Récupère un fichier spécifique

#### DELETE `/api/v1/files/:id`
Supprime un fichier

#### GET `/api/v1/files/:id/download`
Télécharge un fichier

#### POST `/api/v1/contents`
Crée un contenu associé à une leçon avec un fichier
```typescript
{
  lessonId: number,
  type: 'pdf' | 'docx' | 'image' | 'video_mp4' | 'youtube_link' | 'text',
  title: string,
  body?: string,
  fileId?: number,
  url?: string,
  position?: number
}
```

## 🎨 Composants Frontend

### 1. FileUpload Component
**Fichier**: `src/components/ui/file-upload.tsx`

Composant Radix UI réutilisable avec drag-and-drop

```typescript
<FileUpload
  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif"
  multiple={true}
  maxFiles={10}
  maxSize={100 * 1024 * 1024}
  disabled={false}
  onFilesSelected={(files) => console.log(files)}
  onFilesChange={(filesWithProgress) => console.log(filesWithProgress)}
/>
```

**Features**:
- ✅ Drag and drop
- ✅ Clique pour sélectionner
- ✅ Validation de la taille
- ✅ Validation du nombre de fichiers
- ✅ Affichage de la progression
- ✅ Indicateurs de statut (pending, uploading, success, error)

### 2. FileUploadWidget Component
**Fichier**: `src/components/FileUploadWidget.tsx`

Composants pratiques pour intégrer l'upload dans les pages

#### FileUploadWidget
```typescript
<FileUploadWidget
  lessonId={123}
  onFilesUploaded={(fileIds) => console.log(fileIds)}
/>
```

#### FileListWidget
```typescript
<FileListWidget
  lessonId={123}
  files={existingFiles}
  onFileDeleted={() => refetchFiles()}
/>
```

### 3. ContentUploadPage
**Fichier**: `src/pages/ContentUploadPage.tsx`

Page dédiée pour la gestion complète des fichiers de contenu

**Route**: `/content-upload`

**Fonctionnalités**:
- Sélection de leçon
- Upload multiple de fichiers
- Définition du type de contenu
- Ajout de titre et description
- Liste des fichiers existants
- Téléchargement de fichiers
- Suppression de fichiers

## 🔧 Service File Service

**Fichier**: `src/services/file.service.ts`

Classe singleton pour gérer les opérations de fichiers

```typescript
// Upload un fichier
const result = await fileService.uploadFile(
  file,
  (progress) => console.log(progress),  // 0-100
  'lessons'
);

// Upload plusieurs fichiers
const results = await fileService.uploadFiles(
  files,
  (fileIndex, progress) => console.log(`File ${fileIndex}: ${progress}%`),
  'lessons'
);

// Lister les fichiers
const files = await fileService.listFiles({
  page: 1,
  limit: 20,
  folder: 'lessons',
  mimeType: 'application/pdf'
});

// Supprimer un fichier
await fileService.deleteFile(fileId);

// Télécharger un fichier
await fileService.downloadFile(fileId, 'nom-du-fichier.pdf');
```

## 📡 API Frontend (Service)

**Fichier**: `src/services/api.ts`

```typescript
// Utilisation directe via le service api
await api.files.upload(file, 'lessons');
await api.files.uploadMultiple(files, 'lessons');
await api.files.list({ page: 1, folder: 'lessons' });
await api.files.get(fileId);
await api.files.delete(fileId);
await api.files.download(fileId);
```

## 🔒 Sécurité

- ✅ Authentification requise pour tous les endpoints
- ✅ Validation des types MIME côté serveur
- ✅ Validation de la taille des fichiers
- ✅ Upload dans un répertoire temporaire puis déplacement
- ✅ Génération d'UUID pour les noms de fichiers
- ✅ Autorisation basée sur le rôle (admin, director, manager)

## 💾 Structure de Base de Données

### Table: file_assets
```sql
CREATE TABLE file_assets (
  id INT PRIMARY KEY IDENTITY(1,1),
  tenant_id INT,
  filename NVARCHAR(255),
  original_filename NVARCHAR(255),
  mime_type NVARCHAR(100),
  size INT,
  path NVARCHAR(500),
  storage_key NVARCHAR(255),
  folder NVARCHAR(100),
  created_by INT,
  created_at DATETIME DEFAULT GETDATE(),
  updated_at DATETIME DEFAULT GETDATE(),
  deleted_at DATETIME
);
```

### Table: contents
```sql
CREATE TABLE contents (
  id INT PRIMARY KEY IDENTITY(1,1),
  lesson_id INT,
  type NVARCHAR(50),  -- 'pdf', 'docx', 'image', 'video_mp4', 'youtube_link', 'text'
  title NVARCHAR(255),
  body NVARCHAR(MAX),
  file_id INT,
  url NVARCHAR(500),
  embed_url NVARCHAR(500),
  position INT,
  created_at DATETIME DEFAULT GETDATE(),
  updated_at DATETIME DEFAULT GETDATE(),
  FOREIGN KEY (file_id) REFERENCES file_assets(id)
);
```

## 🚀 Utilisation Pratique

### Exemple 1: Upload dans une Leçon

```typescript
import { FileUploadWidget } from '@/components/FileUploadWidget'
import { useParams } from 'react-router-dom'

export function LessonContent() {
  const { lessonId } = useParams()

  const handleFilesUploaded = (fileIds: number[]) => {
    console.log('Fichiers uploadés:', fileIds)
    // Rafraîchir la liste des contenus
  }

  return (
    <FileUploadWidget
      lessonId={parseInt(lessonId!)}
      onFilesUploaded={handleFilesUploaded}
    />
  )
}
```

### Exemple 2: Upload Multiple avec Progression

```typescript
import { useState } from 'react'
import { fileService } from '@/services/file.service'

export function BulkUploadPage() {
  const [progress, setProgress] = useState<Map<string, number>>(new Map())

  const handleUpload = async (files: File[]) => {
    try {
      const results = await fileService.uploadFiles(
        files,
        (fileIndex, prog) => {
          setProgress(prev => {
            const map = new Map(prev)
            map.set(files[fileIndex].name, prog)
            return map
          })
        },
        'lessons'
      )
      console.log('Tous les fichiers uploadés:', results)
    } catch (error) {
      console.error('Erreur:', error)
    }
  }

  return (
    <div>
      {Array.from(progress.entries()).map(([name, prog]) => (
        <div key={name}>
          <p>{name}: {prog}%</p>
        </div>
      ))}
    </div>
  )
}
```

### Exemple 3: Intégration dans Admin

```typescript
// Pour les admins uploading des ressources
import { useAuth } from '@/contexts/AuthContext'
import ContentUploadPage from '@/pages/ContentUploadPage'

export function AdminContentManagement() {
  const { user } = useAuth()

  if (user?.role !== 'admin' && user?.role !== 'manager') {
    return <div>Accès refusé</div>
  }

  return <ContentUploadPage />
}
```

## 📋 Checklist d'Intégration

Pour intégrer l'upload de fichiers dans une nouvelle page:

- [ ] Importer `FileUpload` ou `FileUploadWidget`
- [ ] Ajouter un état pour gérer les fichiers sélectionnés
- [ ] Implémenter le callback `onFilesSelected` ou `onFilesUploaded`
- [ ] Afficher la progression si nécessaire
- [ ] Gérer les erreurs avec `useToast()`
- [ ] Tester avec différents types de fichiers
- [ ] Vérifier les permissions utilisateur

## 🐛 Dépannage

### L'upload échoue
- Vérifier la taille du fichier (< 100MB)
- Vérifier le type MIME est accepté
- Vérifier que l'utilisateur est authentifié
- Vérifier les logs du serveur

### Les fichiers ne s'affichent pas
- Vérifier que le fileId est bien défini
- Vérifier que le fichier existe dans la base de données
- Vérifier les chemins de fichiers sur le serveur

### Problèmes de progression
- Vérifier que `onUploadProgress` est supporté par le serveur
- Vérifier les headers CORS
- Vérifier que la réponse de l'API est correcte

## 📚 Ressources

- [API Backend - file.routes.ts](../backend/src/routes/file.routes.ts)
- [FileUpload Component](./components/ui/file-upload.tsx)
- [File Service](./services/file.service.ts)
- [ContentUploadPage](./pages/ContentUploadPage.tsx)
