import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import {
  BarChart3,
  Download,
  FileText,
  Users,
  BookOpen,
  Clock,
  TrendingUp,
  Award,
  Loader2,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatDate } from '@/lib/utils'

interface ReportData {
  id: number
  type: string
  name: string
  description: string
  generatedAt: string
  status: 'ready' | 'generating' | 'error'
  downloadUrl: string | null
}

const reportTypes = [
  {
    value: 'user_progress',
    label: 'Progression des utilisateurs',
    icon: Users,
    description: 'Rapport détaillé sur la progression des apprenants',
  },
  {
    value: 'course_completion',
    label: 'Complétion des cours',
    icon: BookOpen,
    description: 'Taux de complétion et statistiques par cours',
  },
  {
    value: 'time_spent',
    label: 'Temps de formation',
    icon: Clock,
    description: 'Analyse du temps passé en formation',
  },
  {
    value: 'quiz_performance',
    label: 'Performance aux quiz',
    icon: FileText,
    description: 'Résultats et statistiques des quiz',
  },
  {
    value: 'engagement',
    label: 'Engagement',
    icon: TrendingUp,
    description: 'Métriques d\'engagement des utilisateurs',
  },
  {
    value: 'certifications',
    label: 'Certifications',
    icon: Award,
    description: 'Rapport sur les certifications délivrées',
  },
]

export default function AdminReportsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedReportType, setSelectedReportType] = useState('')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false)

  const { data: reports = [], isLoading } = useQuery<ReportData[]>({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const response = await api.get('/reports')
      return response.data.data || []
    },
  })

  const { data: dashboardStats } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/analytics/dashboard')
      return response.data.data || {
        totalUsers: 0,
        totalCourses: 0,
        totalEnrollments: 0,
        completionRate: 0,
        avgTimeSpent: 0,
        certificatesIssued: 0,
      }
    },
  })

  const generateMutation = useMutation({
    mutationFn: async (data: { type: string; startDate?: string; endDate?: string }) => {
      const response = await api.post('/reports/generate', data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      setIsGenerateDialogOpen(false)
      setSelectedReportType('')
      setDateRange({ start: '', end: '' })
      toast({ title: 'Succès', description: 'Rapport en cours de génération' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Erreur lors de la génération', variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/reports/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      toast({ title: 'Succès', description: 'Rapport supprimé' })
    },
  })

  const handleGenerate = () => {
    generateMutation.mutate({
      type: selectedReportType,
      startDate: dateRange.start || undefined,
      endDate: dateRange.end || undefined,
    })
  }

  const handleDownload = (report: ReportData) => {
    if (report.downloadUrl) {
      window.open(report.downloadUrl, '_blank')
    }
  }

  const getReportTypeInfo = (type: string) => {
    return reportTypes.find((r) => r.value === type)
  }

  if (isLoading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Rapports et analyses</h1>
          <p className="text-muted-foreground">Générez et consultez les rapports de la plateforme</p>
        </div>
        <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <BarChart3 className="h-4 w-4 mr-2" />
              Générer un rapport
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Générer un rapport</DialogTitle>
              <DialogDescription>
                Sélectionnez le type de rapport et la période
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Type de rapport</Label>
                <Select value={selectedReportType} onValueChange={setSelectedReportType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un type" />
                  </SelectTrigger>
                  <SelectContent>
                    {reportTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date de début</Label>
                  <Input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date de fin</Label>
                  <Input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  />
                </div>
              </div>
              {selectedReportType && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {getReportTypeInfo(selectedReportType)?.description}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleGenerate} disabled={!selectedReportType || generateMutation.isPending}>
                {generateMutation.isPending ? 'Génération...' : 'Générer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.totalUsers || 0}</p>
                <p className="text-xs text-muted-foreground">Utilisateurs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.totalCourses || 0}</p>
                <p className="text-xs text-muted-foreground">Cours</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.totalEnrollments || 0}</p>
                <p className="text-xs text-muted-foreground">Inscriptions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.completionRate || 0}%</p>
                <p className="text-xs text-muted-foreground">Complétion</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.avgTimeSpent || 0}h</p>
                <p className="text-xs text-muted-foreground">Temps moyen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Award className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{dashboardStats?.certificatesIssued || 0}</p>
                <p className="text-xs text-muted-foreground">Certificats</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Types */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Types de rapports disponibles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportTypes.map((type) => (
            <Card key={type.value} className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => {
                    setSelectedReportType(type.value)
                    setIsGenerateDialogOpen(true)
                  }}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <type.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{type.label}</h3>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Generated Reports */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Rapports générés</h2>
        {reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Aucun rapport</h3>
              <p className="text-muted-foreground">
                Générez votre premier rapport pour commencer l'analyse
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">Rapport</th>
                    <th className="text-left p-4 font-medium">Type</th>
                    <th className="text-left p-4 font-medium">Généré le</th>
                    <th className="text-left p-4 font-medium">Statut</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reports.map((report) => {
                    const typeInfo = getReportTypeInfo(report.type)
                    return (
                      <tr key={report.id} className="hover:bg-muted/50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                              {typeInfo && <typeInfo.icon className="h-5 w-5" />}
                            </div>
                            <div>
                              <p className="font-medium">{report.name}</p>
                              <p className="text-sm text-muted-foreground">{report.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline">{typeInfo?.label || report.type}</Badge>
                        </td>
                        <td className="p-4 text-sm">{formatDate(report.generatedAt)}</td>
                        <td className="p-4">
                          {report.status === 'ready' && (
                            <Badge className="bg-green-600">Prêt</Badge>
                          )}
                          {report.status === 'generating' && (
                            <Badge variant="secondary">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              En cours
                            </Badge>
                          )}
                          {report.status === 'error' && (
                            <Badge variant="destructive">Erreur</Badge>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            {report.status === 'ready' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownload(report)}
                              >
                                <Download className="h-4 w-4 mr-1" />
                                Télécharger
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteMutation.mutate(report.id)}
                            >
                              Supprimer
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
