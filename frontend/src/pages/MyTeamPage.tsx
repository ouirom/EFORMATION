import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { AlertTriangle, Users, Mail, Bell } from 'lucide-react'
import { api } from '@/services/api'
import { getInitials, getRoleColor, getRoleLabel, formatRelativeTime } from '@/lib/utils'

interface ReportSettings {
  isEnabled: boolean
  frequency: 'daily' | 'weekly'
  weekday: number | null
  channelEmail: boolean
  channelInApp: boolean
  lastSentAt: string | null
}

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

interface TeamMember {
  id: number
  displayName: string
  email: string
  role: string
  avatarUrl?: string | null
  enrolledCount: number
  completedCount: number
  avgProgress: number
  lastActivity: string | null
  overdueCount: number
}

export default function MyTeamPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: team = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['my-team'],
    queryFn: async () => {
      const response = await api.get('/analytics/my-team')
      return response.data.data || []
    },
  })

  const { data: settings, isLoading: settingsLoading } = useQuery<ReportSettings>({
    queryKey: ['my-team-report-settings'],
    queryFn: async () => {
      const response = await api.get('/analytics/my-team/report-settings')
      return response.data.data
    },
  })

  const [form, setForm] = useState<ReportSettings>({
    isEnabled: false, frequency: 'weekly', weekday: 1, channelEmail: true, channelInApp: true, lastSentAt: null,
  })

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (data: ReportSettings) => api.put('/analytics/my-team/report-settings', data),
    onSuccess: () => {
      toast({ title: 'Préférences enregistrées', description: 'Vos réglages de rapport ont été mis à jour.' })
      queryClient.invalidateQueries({ queryKey: ['my-team-report-settings'] })
    },
    onError: () => {
      toast({ title: 'Erreur', description: "Impossible d'enregistrer vos préférences", variant: 'destructive' })
    },
  })

  if (isLoading) {
    return <PageLoading />
  }

  const overdueTotal = team.reduce((sum, m) => sum + m.overdueCount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mon équipe</h1>
        <p className="text-muted-foreground">
          Progression et activité des collaborateurs qui vous sont rattachés
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rapport périodique</CardTitle>
          <CardDescription>
            Recevez un résumé automatique de la progression de votre équipe, dans l'interface et/ou par email
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="reportEnabled"
                  checked={form.isEnabled}
                  onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="reportEnabled">Recevoir un rapport automatique</Label>
              </div>

              {form.isEnabled && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                    <div className="space-y-2">
                      <Label>Fréquence</Label>
                      <Select
                        value={form.frequency}
                        onValueChange={(value: string) => setForm({ ...form, frequency: value as 'daily' | 'weekly' })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Quotidien</SelectItem>
                          <SelectItem value="weekly">Hebdomadaire</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.frequency === 'weekly' && (
                      <div className="space-y-2">
                        <Label>Jour</Label>
                        <Select
                          value={String(form.weekday ?? 1)}
                          onValueChange={(value: string) => setForm({ ...form, weekday: parseInt(value, 10) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WEEKDAYS.map((day, i) => (
                              <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Canaux</Label>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.channelInApp}
                          onChange={(e) => setForm({ ...form, channelInApp: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <Bell className="h-4 w-4 text-muted-foreground" /> Notification dans l'application
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.channelEmail}
                          onChange={(e) => setForm({ ...form, channelEmail: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <Mail className="h-4 w-4 text-muted-foreground" /> Email
                      </label>
                    </div>
                  </div>
                </>
              )}

              {settings?.lastSentAt && (
                <p className="text-xs text-muted-foreground">
                  Dernier rapport envoyé {formatRelativeTime(settings.lastSentAt)}
                </p>
              )}

              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{team.length}</p>
                <p className="text-sm text-muted-foreground">Collaborateurs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {team.length > 0 ? Math.round(team.reduce((s, m) => s + m.avgProgress, 0) / team.length) : 0}%
                </p>
                <p className="text-sm text-muted-foreground">Progression moyenne</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${overdueTotal > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                <AlertTriangle className={`h-5 w-5 ${overdueTotal > 0 ? 'text-red-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{overdueTotal}</p>
                <p className="text-sm text-muted-foreground">Formations obligatoires en retard</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {team.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              Aucun collaborateur rattaché n'a été trouvé pour votre profil.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium">Collaborateur</th>
                    <th className="text-left p-4 font-medium">Rôle</th>
                    <th className="text-left p-4 font-medium">Cours suivis</th>
                    <th className="text-left p-4 font-medium">Progression moyenne</th>
                    <th className="text-left p-4 font-medium">En retard</th>
                    <th className="text-left p-4 font-medium">Dernière activité</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((member) => (
                    <tr key={member.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={member.avatarUrl || undefined} />
                            <AvatarFallback>{getInitials(member.displayName)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{member.displayName}</p>
                            <p className="text-sm text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge className={getRoleColor(member.role)}>{getRoleLabel(member.role)}</Badge>
                      </td>
                      <td className="p-4 text-sm">
                        {member.completedCount} / {member.enrolledCount} terminés
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${member.avgProgress}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground">{member.avgProgress}%</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {member.overdueCount > 0 ? (
                          <Badge variant="destructive">{member.overdueCount}</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {member.lastActivity ? formatRelativeTime(member.lastActivity) : 'Jamais'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
