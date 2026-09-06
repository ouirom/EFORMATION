import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import { QueryError } from '@/components/ui/query-error'
import { Award, Star, Lock, Trophy, Flame, Medal, Sparkles } from 'lucide-react'
import { api } from '@/services/api'
import { dateLocale } from '@/lib/utils'

interface UserBadge {
  id: number
  badge_id: number
  code: string
  name: string
  description: string
  badge_type: string
  quiz_id?: number
  course_id?: number
  quiz_title?: string
  course_title?: string
  score?: number
  awarded_at: string
}

interface BadgeStats {
  total: number
  trophies: number
  quizBadges: number
  courseBadges: number
}

export default function BadgesPage() {
  const { t } = useTranslation('badges')
  const { data: userBadgesData, isLoading: loadingUserBadges, error: userBadgesError, refetch: refetchUserBadges } = useQuery({
    queryKey: ['my-badges-page'],
    queryFn: () => api.badges.getUserBadges(),
  })

  const { data: allBadgesData, isLoading: loadingAllBadges, error: allBadgesError, refetch: refetchAllBadges } = useQuery({
    queryKey: ['all-badges'],
    queryFn: async () => {
      const response = await api.get('/badges')
      return response.data.data
    },
  })

  if (loadingUserBadges || loadingAllBadges) {
    return <PageLoading />
  }

  if (userBadgesError || allBadgesError) {
    return <QueryError onRetry={() => { refetchUserBadges(); refetchAllBadges() }} />
  }

  const userBadges: UserBadge[] = userBadgesData || []
  
  // Calculer les statistiques
  const stats: BadgeStats = {
    total: userBadges.length,
    trophies: userBadges.filter(b => b.badge_type === 'trophy').length,
    quizBadges: userBadges.filter(b => ['quiz_completion', 'perfect_score', 'first_quiz'].includes(b.badge_type)).length,
    courseBadges: userBadges.filter(b => ['course_start', 'course_completion'].includes(b.badge_type)).length,
  }

  const allBadges = allBadgesData || []

  // Merge user badges with all available badges
  const badgesWithStatus = allBadges.map((badge: any) => {
    const userBadge = userBadges.find((ub: UserBadge) => ub.id === badge.id || ub.badge_id === badge.id)
    return {
      ...badge,
      earned: !!userBadge,
      earnedAt: userBadge?.awarded_at,
      quizTitle: userBadge?.quiz_title,
      courseTitle: userBadge?.course_title,
      score: userBadge?.score,
    }
  })

  const categories = [
    { id: 'all', label: t('categories.all') },
    { id: 'trophy', label: t('categories.trophy') },
    { id: 'quiz', label: t('categories.quiz') },
    { id: 'course', label: t('categories.course') },
  ]

  const filterByCategory = (badge: any, categoryId: string) => {
    if (categoryId === 'all') return true
    if (categoryId === 'trophy') return badge.badge_type === 'trophy'
    if (categoryId === 'quiz') return ['quiz_completion', 'perfect_score', 'first_quiz'].includes(badge.badge_type)
    if (categoryId === 'course') return ['course_start', 'course_completion'].includes(badge.badge_type)
    return true
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Trophy className="h-8 w-8 text-yellow-500" />
          {t('title')}
        </h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Award className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.total}</p>
              <p className="text-sm text-blue-600/70 dark:text-blue-400/70">{t('stats.total')}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <Trophy className="h-6 w-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{stats.trophies}</p>
              <p className="text-sm text-yellow-600/70 dark:text-yellow-400/70">{t('stats.trophies')}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <Medal className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.quizBadges}</p>
              <p className="text-sm text-green-600/70 dark:text-green-400/70">{t('stats.quizBadges')}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Flame className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.courseBadges}</p>
              <p className="text-sm text-purple-600/70 dark:text-purple-400/70">{t('stats.courseBadges')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent badges earned */}
      {userBadges.length > 0 && (
        <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-2 border-yellow-300 dark:border-yellow-700">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
              <Sparkles className="h-5 w-5 text-yellow-500 animate-bounce" />
              {t('recentlyEarned')}
            </h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {userBadges.slice(0, 6).map((badge: UserBadge, index: number) => (
                <div
                  key={`${badge.id}-${index}`}
                  className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                    badge.badge_type === 'trophy'
                      ? 'bg-gradient-to-br from-yellow-100 to-amber-100 dark:from-yellow-900/40 dark:to-amber-900/40 border-yellow-300 dark:border-yellow-600 shadow-lg'
                      : 'bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 border-blue-300 dark:border-blue-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-4xl">
                      {badge.badge_type === 'trophy' ? '🏆' : 
                       badge.badge_type === 'perfect_score' ? '⭐' :
                       badge.badge_type === 'quiz_completion' ? '✅' :
                       badge.badge_type === 'course_start' ? '🚀' :
                       badge.badge_type === 'course_completion' ? '🎓' : '🎖️'}
                    </span>
                    <div className="flex-1">
                      <p className="font-bold text-sm">{badge.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {badge.quiz_title || badge.course_title || t('defaultBadge')}
                        {badge.score && ` • ${badge.score}%`}
                      </p>
                      {badge.awarded_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(badge.awarded_at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Badges */}
      <Tabs defaultValue="all">
        <TabsList>
          {categories.map((cat) => (
            <TabsTrigger key={cat.id} value={cat.id}>
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((cat) => (
          <TabsContent key={cat.id} value={cat.id} className="mt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {badgesWithStatus
                .filter((b: any) => filterByCategory(b, cat.id))
                .map((badge: any) => (
                  <BadgeCard key={badge.id} badge={badge} />
                ))}
            </div>
            {badgesWithStatus.filter((b: any) => filterByCategory(b, cat.id)).length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Lock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('emptyCategory')}</p>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function BadgeCard({ badge }: { badge: any }) {
  const { t } = useTranslation('badges')
  const getTypeInfo = (type: string) => {
    switch (type) {
      case 'trophy':
        return { icon: '🏆', color: 'yellow', label: t('types.trophy') }
      case 'perfect_score':
        return { icon: '⭐', color: 'yellow', label: t('types.perfectScore') }
      case 'quiz_completion':
        return { icon: '✅', color: 'green', label: t('types.quizCompletion') }
      case 'course_start':
        return { icon: '🚀', color: 'blue', label: t('types.courseStart') }
      case 'course_completion':
        return { icon: '🎓', color: 'purple', label: t('types.courseCompletion') }
      default:
        return { icon: '🎖️', color: 'gray', label: t('types.default') }
    }
  }

  const typeInfo = getTypeInfo(badge.badge_type)
  
  const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    yellow: { 
      bg: 'bg-gradient-to-br from-yellow-100 to-amber-100 dark:from-yellow-900/30 dark:to-amber-900/30', 
      border: 'border-yellow-300 dark:border-yellow-700',
      text: 'text-yellow-700 dark:text-yellow-300'
    },
    green: { 
      bg: 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30', 
      border: 'border-green-300 dark:border-green-700',
      text: 'text-green-700 dark:text-green-300'
    },
    blue: { 
      bg: 'bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30', 
      border: 'border-blue-300 dark:border-blue-700',
      text: 'text-blue-700 dark:text-blue-300'
    },
    purple: { 
      bg: 'bg-gradient-to-br from-purple-100 to-violet-100 dark:from-purple-900/30 dark:to-violet-900/30', 
      border: 'border-purple-300 dark:border-purple-700',
      text: 'text-purple-700 dark:text-purple-300'
    },
    gray: { 
      bg: 'bg-gray-100 dark:bg-gray-800', 
      border: 'border-gray-300 dark:border-gray-700',
      text: 'text-gray-700 dark:text-gray-300'
    },
  }

  const colors = colorClasses[typeInfo.color] || colorClasses.gray

  return (
    <Card className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg ${
      !badge.earned ? 'opacity-60 grayscale' : ''
    } ${badge.earned && badge.badge_type === 'trophy' ? 'ring-2 ring-yellow-400 animate-glow' : ''}`}>
      {badge.badge_type === 'trophy' && badge.earned && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-400" />
      )}
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div
            className={`h-16 w-16 rounded-xl flex items-center justify-center text-3xl transition-transform hover:scale-110 ${
              badge.earned ? colors.bg : 'bg-muted'
            } border ${badge.earned ? colors.border : 'border-muted'}`}
          >
            {badge.earned ? typeInfo.icon : <Lock className="h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`font-semibold ${badge.earned ? colors.text : 'text-muted-foreground'}`}>
                {badge.name}
              </h3>
              <Badge variant="outline" className={`text-xs ${badge.earned ? colors.text : ''}`}>
                {typeInfo.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{badge.description}</p>
            
            {badge.earned && (
              <div className="flex items-center gap-2 text-xs">
                <Star className={`h-4 w-4 ${badge.badge_type === 'trophy' ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                {badge.quizTitle && <span>{t('quizLabel', { title: badge.quizTitle })}</span>}
                {badge.courseTitle && <span>{t('courseLabel', { title: badge.courseTitle })}</span>}
                {badge.score && <span className="font-medium">{badge.score}%</span>}
              </div>
            )}
          </div>
        </div>

        {badge.earned && badge.earnedAt && (
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
            <span>✓</span> {t('earnedOn', {
              date: new Date(badge.earnedAt).toLocaleDateString(dateLocale(), {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })
            })}
          </p>
        )}

        {!badge.earned && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Lock className="h-3 w-3" />
              {badge.badge_type === 'trophy'
                ? t('lockedHints.trophy')
                : badge.badge_type === 'perfect_score'
                ? t('lockedHints.perfectScore')
                : badge.badge_type === 'quiz_completion'
                ? t('lockedHints.quizCompletion')
                : badge.badge_type === 'course_start'
                ? t('lockedHints.courseStart')
                : t('lockedHints.courseCompletion')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
