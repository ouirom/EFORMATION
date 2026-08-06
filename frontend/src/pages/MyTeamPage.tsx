import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageLoading } from '@/components/ui/loading'
import { AlertTriangle, Users } from 'lucide-react'
import { api } from '@/services/api'
import { getInitials, getRoleColor, getRoleLabel, formatRelativeTime } from '@/lib/utils'

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
  const { data: team = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['my-team'],
    queryFn: async () => {
      const response = await api.get('/analytics/my-team')
      return response.data.data || []
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
