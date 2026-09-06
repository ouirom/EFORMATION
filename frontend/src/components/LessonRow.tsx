import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, CheckCircle, Clock, FileText, Link as LinkIcon, Video } from 'lucide-react'

function lessonTypeIcon(type: string) {
  switch (type) {
    case 'video':
      return <Video className="h-4 w-4" />
    case 'document':
    case 'text':
      return <FileText className="h-4 w-4" />
    case 'link':
      return <LinkIcon className="h-4 w-4" />
    default:
      return <BookOpen className="h-4 w-4" />
  }
}

/** A single lesson entry in the lesson catalog -- used on the dashboard's embedded
 * catalog widget and on the dedicated /lessons page. */
export function LessonRow({ lesson }: { lesson: any }) {
  const { t } = useTranslation('dashboard')
  const isCompleted = lesson.progress_status === 'completed'
  const progress = lesson.progress_percent || 0

  return (
    <Link to={`/courses/${lesson.course_public_id}/lessons/${lesson.public_id}`}>
      <Card className="p-3 hover:border-primary/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isCompleted ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-primary/10 text-primary'}`}>
            {isCompleted ? <CheckCircle className="h-4 w-4" /> : lessonTypeIcon(lesson.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{lesson.title}</p>
              {lesson.is_mandatory && (
                <Badge variant="outline" className="shrink-0 text-xs">{t('lessonCatalog.mandatory')}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {lesson.course_title} · {lesson.module_title}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground shrink-0">
            <Clock className="h-4 w-4" />
            {t('lessonCatalog.durationMin', { count: lesson.duration_min || 0 })}
          </div>
          <Badge
            variant={isCompleted ? 'default' : 'secondary'}
            className={`shrink-0 ${isCompleted ? 'bg-green-500 hover:bg-green-600' : ''}`}
          >
            {isCompleted ? t('lessonCatalog.completed') : progress > 0 ? `${progress}%` : t('lessonCatalog.start')}
          </Badge>
        </div>
      </Card>
    </Link>
  )
}
