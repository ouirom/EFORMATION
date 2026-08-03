import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import {
  Users,
  BookOpen,
  Clock,
  Award,
  ArrowUp,
  ArrowDown,
  Calendar,
  Download,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/services/api'

export default function AdminAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => api.analytics.getDashboard(),
  })

  if (isLoading) {
    return <PageLoading />
  }

  const stats = data || {
    totalUsers: 1250,
    activeUsers: 890,
    totalCourses: 45,
    completedCourses: 3450,
    totalHours: 12500,
    avgCompletionRate: 72,
    newUsersThisMonth: 85,
    coursesThisMonth: 5,
    trends: {
      users: 12,
      courses: 8,
      hours: 15,
      completion: -3,
    },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Vue d'ensemble des performances de la plateforme
          </p>
        </div>
        <div className="flex gap-2">
          <Select defaultValue="30">
            <SelectTrigger className="w-[150px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 derniers jours</SelectItem>
              <SelectItem value="30">30 derniers jours</SelectItem>
              <SelectItem value="90">90 derniers jours</SelectItem>
              <SelectItem value="365">Cette année</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Utilisateurs actifs"
          value={stats.activeUsers}
          subtitle={`${stats.totalUsers} total`}
          trend={stats.trends.users}
          icon={Users}
        />
        <StatCard
          title="Cours complétés"
          value={stats.completedCourses}
          subtitle={`${stats.totalCourses} cours disponibles`}
          trend={stats.trends.courses}
          icon={BookOpen}
        />
        <StatCard
          title="Heures d'apprentissage"
          value={`${(stats.totalHours / 1000).toFixed(1)}k`}
          subtitle="Ce mois-ci"
          trend={stats.trends.hours}
          icon={Clock}
        />
        <StatCard
          title="Taux de complétion"
          value={`${stats.avgCompletionRate}%`}
          subtitle="Moyenne globale"
          trend={stats.trends.completion}
          icon={Award}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Activité des utilisateurs</CardTitle>
            <CardDescription>Connexions quotidiennes sur les 30 derniers jours</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-between gap-2">
              {Array.from({ length: 30 }).map((_, i) => {
                const height = 20 + Math.random() * 80
                return (
                  <div
                    key={i}
                    className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-t"
                    style={{ height: `${height}%` }}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>1 Mar</span>
              <span>15 Mar</span>
              <span>30 Mar</span>
            </div>
          </CardContent>
        </Card>

        {/* Courses Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Distribution des cours</CardTitle>
            <CardDescription>Par catégorie</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Technologie', value: 35, color: 'bg-blue-500' },
                { name: 'Management', value: 25, color: 'bg-green-500' },
                { name: 'Soft Skills', value: 20, color: 'bg-yellow-500' },
                { name: 'Conformité', value: 15, color: 'bg-purple-500' },
                { name: 'Autres', value: 5, color: 'bg-gray-500' },
              ].map((item) => (
                <div key={item.name} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.name}</span>
                    <span className="font-medium">{item.value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all`}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed analytics */}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Utilisateurs</TabsTrigger>
          <TabsTrigger value="courses">Cours</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Nouveaux utilisateurs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.newUsersThisMonth}</div>
                <p className="text-sm text-muted-foreground">Ce mois-ci</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Utilisateurs par rôle</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { role: 'Agents', count: 850 },
                    { role: 'Superviseurs', count: 200 },
                    { role: 'Managers', count: 120 },
                    { role: 'Directeurs', count: 50 },
                    { role: 'Admins', count: 30 },
                  ].map((item) => (
                    <div key={item.role} className="flex items-center justify-between">
                      <span className="text-sm">{item.role}</span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="courses" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cours les plus populaires</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: 'Introduction au ML', enrollments: 450, completion: 78 },
                  { name: 'React Avancé', enrollments: 380, completion: 65 },
                  { name: 'Gestion de projet', enrollments: 320, completion: 82 },
                  { name: 'Communication efficace', enrollments: 280, completion: 90 },
                ].map((course, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{course.name}</p>
                      <p className="text-sm text-muted-foreground">{course.enrollments} inscrits</p>
                    </div>
                    <Badge variant={course.completion >= 80 ? 'default' : 'secondary'}>
                      {course.completion}% complétion
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engagement" className="mt-4">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-4xl font-bold text-primary">24min</div>
                <p className="text-sm text-muted-foreground mt-2">
                  Temps moyen par session
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-4xl font-bold text-primary">4.2</div>
                <p className="text-sm text-muted-foreground mt-2">
                  Sessions par semaine / utilisateur
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-4xl font-bold text-primary">87%</div>
                <p className="text-sm text-muted-foreground mt-2">
                  Taux de rétention
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
}: {
  title: string
  value: string | number
  subtitle: string
  trend: number
  icon: React.ComponentType<any>
}) {
  const isPositive = trend >= 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          <div
            className={`flex items-center text-xs ${
              isPositive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {isPositive ? (
              <ArrowUp className="h-3 w-3 mr-1" />
            ) : (
              <ArrowDown className="h-3 w-3 mr-1" />
            )}
            {Math.abs(trend)}%
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
