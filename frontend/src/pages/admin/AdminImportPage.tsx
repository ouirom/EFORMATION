import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/services/api'
import { Download, Upload, CheckCircle2, XCircle, MinusCircle, Loader2 } from 'lucide-react'

interface ImportRow {
  line?: number
  label?: string
  email?: string
  status: 'created' | 'skipped' | 'error'
  message?: string
}

interface ImportResponseData {
  total?: number
  totalRows?: number
  created: number
  skipped?: number
  errors?: number
  results: ImportRow[]
}

interface ImportSectionConfig {
  key: string
  title: string
  description: string
  templateUrl: string
  templateFilename: string
  importUrl: string
  roles: string[]
}

const SECTIONS: ImportSectionConfig[] = [
  {
    key: 'organization',
    title: "Hiérarchie de l'organisation",
    description: "Entreprises, directions et services — une ligne par service (ou par niveau supérieur si les colonnes suivantes sont laissées vides).",
    templateUrl: '/import/organization/template',
    templateFilename: 'modele_organisation.xlsx',
    importUrl: '/import/organization',
    roles: ['admin', 'super_admin'],
  },
  {
    key: 'users',
    title: 'Utilisateurs',
    description: 'Comptes utilisateurs avec rôle et rattachement organisationnel.',
    templateUrl: '/import/users/template',
    templateFilename: 'modele_utilisateurs.xlsx',
    importUrl: '/users/import',
    roles: ['admin', 'director', 'super_admin'],
  },
  {
    key: 'courses',
    title: 'Cours',
    description: 'Fiches de cours (titre, description, catégorie, niveau).',
    templateUrl: '/import/courses/template',
    templateFilename: 'modele_cours.xlsx',
    importUrl: '/import/courses',
    roles: ['admin', 'director', 'manager', 'super_admin'],
  },
  {
    key: 'lessons',
    title: 'Leçons',
    description: "Leçons rattachées à un cours déjà existant — le module est créé automatiquement s'il n'existe pas.",
    templateUrl: '/import/lessons/template',
    templateFilename: 'modele_lecons.xlsx',
    importUrl: '/import/lessons',
    roles: ['admin', 'director', 'manager', 'super_admin'],
  },
  {
    key: 'quizzes',
    title: 'Quiz',
    description: 'Questions de quiz rattachées à une leçon déjà existante — une ligne par question.',
    templateUrl: '/import/quizzes/template',
    templateFilename: 'modele_quiz.xlsx',
    importUrl: '/import/quizzes',
    roles: ['admin', 'director', 'manager', 'super_admin'],
  },
]

async function downloadTemplate(url: string, filename: string) {
  const response = await api.get(url, { responseType: 'blob' })
  const blobUrl = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = blobUrl
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.parentNode?.removeChild(link)
  window.URL.revokeObjectURL(blobUrl)
}

function ImportSection({ config }: { config: ImportSectionConfig }) {
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResponseData | null>(null)

  const downloadMutation = useMutation({
    mutationFn: () => downloadTemplate(config.templateUrl, config.templateFilename),
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de télécharger le modèle', variant: 'destructive' })
    },
  })

  const importMutation = useMutation({
    mutationFn: async (uploadedFile: File) => {
      const formData = new FormData()
      formData.append('file', uploadedFile)
      const response = await api.post(config.importUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data.data as ImportResponseData
    },
    onSuccess: (data) => {
      setResult(data)
      setFile(null)
      toast({ title: 'Import terminé', description: `${data.created} ligne(s) créée(s)` })
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || "Impossible d'importer le fichier",
        variant: 'destructive',
      })
    },
  })

  const totalRows = result ? result.total ?? result.totalRows ?? result.results.length : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{config.title}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending}>
          <Download className="h-4 w-4 mr-2" />
          Télécharger le modèle
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          />
          <Button
            size="sm"
            onClick={() => file && importMutation.mutate(file)}
            disabled={!file || importMutation.isPending}
          >
            {importMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importer
          </Button>
        </div>

        {result && (
          <div className="rounded-md border">
            <div className="px-3 py-2 text-sm text-muted-foreground border-b bg-muted/40">
              {result.created} créé(s)
              {typeof result.skipped === 'number' && `, ${result.skipped} ignoré(s)`}
              {typeof result.errors === 'number' && `, ${result.errors} erreur(s)`}
              {' '}sur {totalRows} ligne(s)
            </div>
            <div className="max-h-64 overflow-y-auto divide-y">
              {result.results.map((row, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                  {row.status === 'created' && <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />}
                  {row.status === 'skipped' && <MinusCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
                  {row.status === 'error' && <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />}
                  <div>
                    <span className="font-medium">{row.label || row.email || `Ligne ${row.line}`}</span>
                    {row.message && <span className="text-muted-foreground"> — {row.message}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AdminImportPage() {
  const { user } = useAuth()
  const role = user?.role || ''
  const visibleSections = SECTIONS.filter((s) => s.roles.includes(role))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import de données</h1>
        <p className="text-muted-foreground">
          Téléchargez un modèle Excel, remplissez-le puis importez-le. Les imports sont rejouables : les éléments déjà existants sont automatiquement ignorés.
        </p>
      </div>

      {visibleSections.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Aucun import n'est disponible pour votre rôle.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleSections.map((section) => (
            <ImportSection key={section.key} config={section} />
          ))}
        </div>
      )}
    </div>
  )
}
