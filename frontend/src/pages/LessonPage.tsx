import { useState, useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import { useTranslation } from 'react-i18next'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PresenceCheckDialog } from '@/components/PresenceCheckDialog'
import { DocxViewer } from '@/components/DocxViewer'
import { XlsxViewer } from '@/components/XlsxViewer'
import { PptxViewer } from '@/components/PptxViewer'
import { FavoriteButton } from '@/components/FavoriteButton'
import {
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  CheckCircle,
  FileText,
  Download,
  BookOpen,
  Clock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Lock,
  Trophy,
  Star,
  MessageSquare,
  Trash2,
  Send,
} from 'lucide-react'
import { api } from '@/services/api'
import { fileService } from '@/services/file.service'
import { useSessionTimeoutContext } from '@/contexts/SessionTimeoutContext'
import { idleLimitForLessonDuration } from '@/lib/idleLimit'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatDateTime } from '@/lib/utils'
import { useStreamUrl } from '@/hooks/useStreamUrl'

interface Content {
  id: number
  type: string
  title?: string
  body?: string
  url?: string
  embed_url?: string
  file_id?: number
  filename?: string
  mime_type?: string
  storage_key?: string
  position: number
}

interface LessonData {
  id: number
  public_id: string
  course_id: number
  title: string
  type: 'video' | 'document' | 'link' | 'quiz' | 'text' | null
  duration_min: number
  position: number
  module_id: number
  contents: Content[]
  quizzes: any[]
  presence_check_percent: number | null
  reset_time_on_reopen: boolean
  allow_document_download: boolean
}

interface Module {
  id: number
  title: string
  lessons: { id: number; public_id: string; title: string; type: string; duration_min: number; position: number }[]
}

interface LessonProgress {
  id?: number
  status: 'not_started' | 'in_progress' | 'completed'
  progress_percent: number
  time_spent_seconds: number
  started_at?: string
  last_accessed_at?: string
  completed_at?: string
}

export default function LessonPage() {
  const { t } = useTranslation('courses')
  const { t: tCommon } = useTranslation('common')
  const { courseId, lessonId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const pageContainerRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number>(Date.now())
  const lastUpdateRef = useRef<number>(Date.now())

  const { user } = useAuth()
  const ratingPromptedRef = useRef(false)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [activeTab, setActiveTab] = useState('content')
  const [isPageFullscreen, setIsPageFullscreen] = useState(false)
  const [showDetails, setShowDetails] = useState(true)
  const [notesDraft, setNotesDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [showRatingDialog, setShowRatingDialog] = useState(false)
  const [ratingValue, setRatingValue] = useState(0)
  const [ratingHover, setRatingHover] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [showPresenceCheck, setShowPresenceCheck] = useState(false)
  const [presenceCountdown, setPresenceCountdown] = useState(15)
  const presenceCheckShownRef = useRef(false)

  // Fetch lesson data
  const { data: lesson, isLoading: lessonLoading, error: lessonError } = useQuery<LessonData>({
    queryKey: ['lesson', lessonId],
    queryFn: async () => {
      const response = await api.get(`/lessons/${lessonId}`)
      return response.data.data
    },
  })

  // Fetch lesson progress
  const { data: lessonProgress } = useQuery<LessonProgress>({
    queryKey: ['lesson-progress', lessonId],
    queryFn: async () => {
      const response = await api.get(`/lessons/${lesson!.id}/progress`)
      return response.data.data
    },
    enabled: !!lesson,
  })

  // Start lesson tracking mutation
  const startLessonMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/lessons/${lesson!.id}/start`, { courseId: lesson!.course_id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-progress', lessonId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  // Update progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: async ({ progressPercent, timeSpentSeconds }: { progressPercent: number; timeSpentSeconds: number }) => {
      await api.post(`/lessons/${lesson!.id}/progress`, { progressPercent, timeSpentSeconds })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-progress', lessonId] })
    },
  })

  // Personal notes (private to the current user)
  const { data: savedNote } = useQuery<{ body: string } | null>({
    queryKey: ['lesson-notes', lessonId],
    queryFn: async () => {
      const response = await api.get(`/lessons/${lesson!.id}/notes`)
      return response.data.data
    },
    enabled: !!lesson,
  })

  useEffect(() => {
    setNotesDraft(savedNote?.body || '')
  }, [savedNote])

  const saveNotesMutation = useMutation({
    mutationFn: async (body: string) => {
      await api.put(`/lessons/${lesson!.id}/notes`, { body })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-notes', lessonId] })
      toast({ title: tCommon('status.success'), description: t('lesson.notesSavedDescription') })
    },
  })

  // Shared discussion comments
  interface LessonComment {
    id: number
    user_id: number
    body: string
    created_at: string
    author_name?: string
  }

  const { data: comments = [] } = useQuery<LessonComment[]>({
    queryKey: ['lesson-comments', lessonId],
    queryFn: async () => {
      const response = await api.get(`/lessons/${lesson!.id}/comments`)
      return response.data.data || []
    },
    enabled: showDetails && !!lesson,
  })

  const addCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      await api.post(`/lessons/${lesson!.id}/comments`, { body })
    },
    onSuccess: () => {
      setCommentDraft('')
      queryClient.invalidateQueries({ queryKey: ['lesson-comments', lessonId] })
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      await api.delete(`/lessons/${lesson!.id}/comments/${commentId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-comments', lessonId] })
    },
  })

  // Optional star rating, prompted once when the lesson is first marked complete
  const { data: existingEvaluation } = useQuery<{ rating: number; comment: string | null } | null>({
    queryKey: ['lesson-evaluation', lessonId],
    queryFn: async () => {
      const response = await api.get(`/lessons/${lesson!.id}/evaluations/me`)
      return response.data.data
    },
    enabled: !!lesson,
  })

  const submitEvaluationMutation = useMutation({
    mutationFn: async ({ rating, comment }: { rating: number; comment?: string }) => {
      await api.post(`/lessons/${lesson!.id}/evaluations`, { rating, comment })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-evaluation', lessonId] })
      setShowRatingDialog(false)
      toast({ title: tCommon('status.success'), description: t('lesson.ratingThanks') })
    },
  })

  // Fetch course modules for navigation
  const { data: modules = [] } = useQuery<Module[]>({
    queryKey: ['course-modules', courseId],
    queryFn: async () => {
      const response = await api.get(`/modules?courseId=${courseId}`)
      return response.data.data || []
    },
  })

  // While this lesson is open, give the user more idle leeway than the app-wide
  // default, proportional to how long the lesson is meant to take.
  const { setIdleLimitOverrideMs } = useSessionTimeoutContext()
  useEffect(() => {
    setIdleLimitOverrideMs(idleLimitForLessonDuration(lesson?.duration_min))
    return () => setIdleLimitOverrideMs(null)
  }, [lesson?.duration_min, setIdleLimitOverrideMs])

  const completeMutation = useMutation({
    mutationFn: async (_variables: { silent?: boolean } = {}) => {
      await api.post(`/lessons/${lesson!.id}/complete`, { courseId: lesson!.course_id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson', lessonId] })
      queryClient.invalidateQueries({ queryKey: ['lesson-progress', lessonId] })
      queryClient.invalidateQueries({ queryKey: ['course', courseId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['my-courses'] })
      
      // Prompt for an optional star rating once, the first time this lesson
      // reaches 'completed' -- guarded so the silent auto-complete call (fired
      // on every video timeupdate tick past 90%) doesn't reopen it repeatedly.
      if (!ratingPromptedRef.current && !existingEvaluation) {
        ratingPromptedRef.current = true
        setShowRatingDialog(true)
      }

      // Check if lesson has quizzes
      const hasQuizzes = lesson?.quizzes && lesson.quizzes.length > 0
      toast({
        title: t('lesson.completedToastTitle'),
        description: hasQuizzes
          ? t('lesson.completedToastWithQuiz')
          : t('lesson.completedToastNoQuiz'),
      })
    },
    onError: (error: any, variables) => {
      // Swallow the auto-complete-at-90%-watched call (no explicit user action to
      // react to); only surface the rejection when the user clicked the button.
      if (variables?.silent) return
      toast({
        title: tCommon('status.error'),
        description: error?.response?.data?.error?.message || tCommon('status.error'),
        variant: 'destructive',
      })
    },
  })

  // Auto-start lesson tracking when page loads
  useEffect(() => {
    if (lesson && lessonId && courseId) {
      startTimeRef.current = Date.now()
      startLessonMutation.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation object is recreated each render; only re-run when the lesson identity changes
  }, [lesson, lessonId, courseId])

  // Track time spent on page
  useEffect(() => {
    const interval = setInterval(() => {
      const timeSpent = Math.floor((Date.now() - lastUpdateRef.current) / 1000)
      // Paused while the presence-check prompt is up -- the wait for a response
      // isn't watched time (see the presence-check effect, which flushes real
      // time up to the prompt and resets the ref on trigger/continue).
      if (timeSpent >= 30 && lessonProgress?.status !== 'completed' && !showPresenceCheck) {
        // Update every 30 seconds
        updateProgressMutation.mutate({
          progressPercent: lessonProgress?.progress_percent || 0,
          timeSpentSeconds: timeSpent
        })
        lastUpdateRef.current = Date.now()
      }
    }, 30000) // Check every 30 seconds

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation object is recreated each render; only re-run when progress/prompt state changes
  }, [lessonProgress, showPresenceCheck])

  // "Are you still there?" presence check -- fires once per page load, part-way
  // through the lesson (per-lesson configurable trigger point, as a percentage of
  // duration_min), to catch a tab left open unattended while time keeps accumulating
  // toward the completion gate. Based on time spent, not video-scrub position, since
  // that's the only progress measure common to every lesson type.
  useEffect(() => {
    if (!lesson?.duration_min || !lesson.presence_check_percent) return
    if (lessonProgress?.status === 'completed') return

    const requiredSeconds = lesson.duration_min * 60
    const checkInterval = setInterval(() => {
      if (presenceCheckShownRef.current) return
      const baseSeconds = lessonProgress?.time_spent_seconds || 0
      const localElapsed = (Date.now() - lastUpdateRef.current) / 1000
      const percent = ((baseSeconds + localElapsed) / requiredSeconds) * 100
      if (percent >= (lesson.presence_check_percent as number)) {
        presenceCheckShownRef.current = true

        // Flush real watched time up to this moment, then reset the ref so the
        // wait for a response isn't itself counted as watched time.
        const elapsed = Math.floor((Date.now() - lastUpdateRef.current) / 1000)
        if (elapsed > 0) {
          updateProgressMutation.mutate({
            progressPercent: lessonProgress?.progress_percent || 0,
            timeSpentSeconds: elapsed,
          })
        }
        lastUpdateRef.current = Date.now()

        const video = videoRef.current
        if (video && !video.paused) {
          video.pause()
          setIsPlaying(false)
        }

        setPresenceCountdown(15)
        setShowPresenceCheck(true)
      }
    }, 5000)

    return () => clearInterval(checkInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation object is recreated each render; only re-run when the lesson/progress identity changes
  }, [lesson, lessonProgress])

  // Countdown while the presence-check prompt is shown -- expiring it (no click)
  // sends the learner back instead of letting the lesson silently keep "running".
  useEffect(() => {
    if (!showPresenceCheck) return
    if (presenceCountdown <= 0) {
      navigate(-1)
      return
    }
    const timer = setTimeout(() => setPresenceCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [showPresenceCheck, presenceCountdown, navigate])

  const handlePresenceContinue = () => {
    setShowPresenceCheck(false)
    // The wait itself doesn't count as watched/spent time.
    lastUpdateRef.current = Date.now()
    const video = videoRef.current
    if (video && lesson?.type === 'video') {
      video.play().catch(() => {})
      setIsPlaying(true)
    }
  }

  // Save progress when leaving the page
  useEffect(() => {
    if (!lesson) return
    const handleBeforeUnload = () => {
      const timeSpent = Math.floor((Date.now() - lastUpdateRef.current) / 1000)
      if (timeSpent > 5) {
        // Use sendBeacon for reliable tracking on page unload
        const data = JSON.stringify({
          progressPercent: progress,
          timeSpentSeconds: timeSpent
        })
        navigator.sendBeacon(`/api/v1/lessons/${lesson.id}/progress`, data)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [lesson, progress])

  // Find current lesson position - filter out undefined values
  const allLessons = modules.flatMap((m) => m.lessons || []).filter(Boolean)
  const currentIndex = allLessons.findIndex((l) => l && l.public_id === lessonId)
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null

  // Video progress tracking
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      const progressValue = (video.currentTime / video.duration) * 100
      setProgress(progressValue)

      // Auto-complete when 90% watched (silently no-ops if the required lesson
      // duration hasn't been reached yet -- see completeMutation's onError)
      if (progressValue >= 90) {
        completeMutation.mutate({ silent: true })
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation object is recreated each render; only re-attach when the lesson changes
  }, [lesson])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
    } else {
      video.play()
    }
    setIsPlaying(!isPlaying)
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const toggleFullscreen = () => {
    const video = videoRef.current
    if (!video) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      video.requestFullscreen()
    }
  }

  const togglePageFullscreen = () => {
    const el = pageContainerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      el.requestFullscreen().catch(() => {
        toast({
          title: t('lesson.fullscreenUnavailableTitle'),
          description: t('lesson.fullscreenUnavailableDescription'),
          variant: 'destructive',
        })
      })
    }
  }

  // Keep the button/icon in sync when fullscreen is exited via Esc or the browser's own UI.
  useEffect(() => {
    const handleFullscreenChange = () => setIsPageFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // A plain <a href="/api/v1/files/:id/download"> can't carry the access token
  // (it lives in localStorage, not a cookie), so every such link 401'd. Route
  // downloads through the authenticated blob helper instead.
  const handleFileDownload = async (fileId: number, filename?: string) => {
    try {
      await fileService.downloadFile(fileId, filename)
    } catch {
      toast({ title: tCommon('status.error'), description: t('lesson.downloadError'), variant: 'destructive' })
    }
  }

  // Helper function to check if URL is a video link
  const isVideoUrl = (url: string): boolean => {
    if (!url) return false
    return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com') || url.endsWith('.mp4')
  }

  // Helper function to check if URL is a document link
  const isDocumentUrl = (url: string): boolean => {
    if (!url) return false
    return url.includes('docs.google.com') || url.endsWith('.pdf') || url.endsWith('.docx') || url.endsWith('.doc')
  }

  // The stored `contents.type` is a coarse classifier that doesn't reliably
  // reflect the real file format for an uploaded document (every uploaded file
  // is inserted with type='pdf' regardless of its actual type -- see
  // AdminCourseEditPage.tsx's createLessonMutation). mime_type is what's
  // actually accurate and what the viewer branching below keys off of, so the
  // label shown to the user must be derived from it too, not from `type`.
  const documentTypeLabel = (content: Content | undefined): string => {
    const mime = content?.mime_type
    if (mime?.includes('pdf')) return t('lesson.documentTypePdf')
    if (mime?.includes('wordprocessingml') || mime === 'application/msword') return t('lesson.documentTypeWord')
    if (mime?.includes('spreadsheet') || mime?.includes('excel')) return t('lesson.documentTypeExcel')
    if (mime?.includes('presentation')) return t('lesson.presentationTitle')
    // No file_id (a pasted link, e.g. Google Docs) -- no mime_type to key off of,
    // fall back to the URL's own extension.
    const url = content?.url?.toLowerCase()
    if (url?.endsWith('.pdf')) return t('lesson.documentTypePdf')
    if (url?.endsWith('.docx') || url?.endsWith('.doc')) return t('lesson.documentTypeWord')
    // Not document-shaped (video/image/text content, listed in the generic
    // "Contenu" tab alongside documents) -- `type` is accurate for those, only
    // uploaded documents have the stale-'pdf' problem this function exists for.
    return content?.type || content?.mime_type || t('lesson.defaultDocumentType')
  }

  // Get content for display. Computed here (ahead of the loading/error early
  // returns below) rather than after them, because the useStreamUrl() hooks that
  // depend on these must themselves run unconditionally on every render.
  const videoContent = lesson?.contents?.find(c =>
    c.mime_type?.startsWith('video/') ||
    (c.url && isVideoUrl(c.url)) ||
    c.type === 'youtube_link' ||
    c.type === 'video_mp4'
  )
  const documentContent = lesson?.contents?.find(c =>
    c.type === 'pdf' ||
    c.type === 'docx' ||
    (c.file_id && c.type !== 'image' && !c.mime_type?.startsWith('image/')) || // Support for uploaded files with file_id
    (c.url && isDocumentUrl(c.url))
  )
  // A "link" lesson's content is also stored with type 'text' (no dedicated link
  // type exists in the schema) but only carries a url, not a body — require a
  // real body here so that row doesn't fall through to the empty text block below.
  const textContent = lesson?.contents?.find(c => c.body)
  const imageContent = lesson?.contents?.find(c =>
    c.type === 'image' || c.mime_type?.startsWith('image/')
  )
  const mainContent = lesson?.contents?.[0]

  const videoStreamUrl = useStreamUrl(videoContent?.file_id)
  const documentStreamUrl = useStreamUrl(documentContent?.file_id)
  const imageStreamUrl = useStreamUrl(imageContent?.file_id)

  if (lessonLoading) {
    return <PageLoading />
  }

  if (lessonError || !lesson) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t('lesson.notFoundTitle')}</h2>
        <p className="text-muted-foreground mb-4">{t('lesson.notFoundHint')}</p>
        <Link to={`/courses/${courseId}`}>
          <Button>{t('lesson.backToCourse')}</Button>
        </Link>
      </div>
    )
  }

  // Helper function to convert YouTube URL to embed URL
  const getYouTubeEmbedUrl = (url: string): string | null => {
    if (!url) return null
    // Handle various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) {
        return `https://www.youtube.com/embed/${match[1]}`
      }
    }
    return null
  }

  // Determine what to display based on lesson type and content. lesson.type is only
  // a fallback for lessons with no content rows at all — it must not be OR'd in
  // unconditionally, or a lesson whose single content row is e.g. an image (but whose
  // coarse lesson.type is still 'document') would show both the image AND an empty
  // "no document" placeholder.
  const hasAnyContent = (lesson.contents?.length || 0) > 0
  const hasVideoContent = !!videoContent || (!hasAnyContent && lesson.type === 'video')
  const hasDocumentContent = !!documentContent || (!hasAnyContent && lesson.type === 'document')
  const hasTextContent = !!textContent || (!hasAnyContent && lesson.type === 'text')
  const hasLinkContent = lesson.type === 'link' && !!mainContent?.url
  const hasImageContent = !!imageContent

  // Quiz unlock requires both lesson completion AND having spent at least the
  // lesson's estimated duration on it -- otherwise a learner could mark a lesson
  // complete instantly (see "Marquer comme terminé" below) and skip straight to
  // the quiz. Lessons with no duration_min set have no time requirement.
  const requiredLessonSeconds = (lesson.duration_min || 0) * 60
  const timeSpentSeconds = lessonProgress?.time_spent_seconds || 0
  const lessonDurationReached = requiredLessonSeconds === 0 || timeSpentSeconds >= requiredLessonSeconds
  const quizUnlocked = lessonProgress?.status === 'completed' && lessonDurationReached
  const remainingLessonMinutes = Math.max(0, Math.ceil((requiredLessonSeconds - timeSpentSeconds) / 60))

  // Format time spent
  const formatTimeSpent = (seconds: number) => {
    if (!seconds) return t('lesson.timeSpentMinutes', { minutes: 0 })
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) {
      return t('lesson.timeSpentHours', { hours, minutes: minutes % 60 })
    }
    return t('lesson.timeSpentMinutes', { minutes })
  }

  // Get status color and label
  const getStatusInfo = (status: string | undefined) => {
    switch (status) {
      case 'completed':
        return { color: 'bg-green-500', label: t('lesson.status.completed'), icon: CheckCircle }
      case 'in_progress':
        return { color: 'bg-blue-500', label: t('lesson.status.inProgress'), icon: Play }
      default:
        return { color: 'bg-gray-400', label: t('lesson.status.notStarted'), icon: Clock }
    }
  }

  const statusInfo = getStatusInfo(lessonProgress?.status)
  const StatusIcon = statusInfo.icon

  return (
    <div ref={pageContainerRef} className="min-h-screen bg-background overflow-y-auto">
      {/* Header with Progress Indicator */}
      <div className="border-b bg-card">
        <div className={cn('mx-auto px-4 py-4', isPageFullscreen ? 'w-[90%]' : 'container')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to={`/courses/${courseId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-semibold">{lesson.title}</h1>
                  {/* Status Badge */}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${statusInfo.color}`}>
                    <StatusIcon className="h-3 w-3" />
                    {statusInfo.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  {lesson.duration_min || '-'} min • {lesson.type || t('lesson.defaultType')}
                  {lessonProgress?.time_spent_seconds ? (
                    <span className="ml-2">• {t('lesson.timeSpent', { time: formatTimeSpent(lessonProgress.time_spent_seconds) })}</span>
                  ) : null}
                </p>
                {lessonProgress?.status !== 'completed' && !lessonDurationReached && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                    <Lock className="h-3 w-3" />
                    {t('lesson.markCompleteLockedTimeRemaining', { minutes: remainingLessonMinutes })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Progress indicator */}
              {lessonProgress?.status !== 'completed' && (
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-24">
                    <Progress value={lessonProgress?.progress_percent || 0} className="h-2" />
                  </div>
                  <span>{lessonProgress?.progress_percent || 0}%</span>
                </div>
              )}
              <FavoriteButton type="lesson" id={lesson.id} showLabel={false} size="icon" />
              <Button
                variant="outline"
                size="icon"
                onClick={togglePageFullscreen}
                title={isPageFullscreen ? t('lesson.exitFullscreen') : t('lesson.enterFullscreen')}
              >
                {isPageFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
              <Button
                onClick={() => completeMutation.mutate({})}
                variant={lessonProgress?.status === 'completed' ? 'outline' : 'default'}
                disabled={lessonProgress?.status === 'completed' || !lessonDurationReached}
                title={
                  lessonProgress?.status !== 'completed' && !lessonDurationReached
                    ? t('lesson.markCompleteLockedTimeRemaining', { minutes: remainingLessonMinutes })
                    : undefined
                }
              >
                {lessonProgress?.status === 'completed' ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {t('lesson.status.completed')}
                  </>
                ) : (
                  t('lesson.markComplete')
                )}
              </Button>
            </div>
          </div>
        </div>
        {/* Progress bar at bottom of header */}
        {lessonProgress?.status !== 'completed' && (
          <div className="h-1 bg-muted">
            <div 
              className="h-full bg-primary transition-all duration-300" 
              style={{ width: `${lessonProgress?.progress_percent || 0}%` }} 
            />
          </div>
        )}
        {lessonProgress?.status === 'completed' && (
          <div className="h-1 bg-green-500" />
        )}
      </div>

      <div className={cn('mx-auto px-4 py-6', isPageFullscreen ? 'w-[90%]' : 'container')}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video player */}
            {hasVideoContent && (
              <Card className="overflow-hidden">
                <div className="relative aspect-video bg-black">
                  {(() => {
                    // Get the video URL from content
                    const videoUrl = videoContent?.url || ''
                    const youtubeEmbed = getYouTubeEmbedUrl(videoUrl)
                    
                    if (youtubeEmbed) {
                      // YouTube video - use iframe
                      return (
                        <iframe
                          src={youtubeEmbed}
                          className="w-full h-full"
                          allowFullScreen
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          title={lesson.title}
                        />
                      )
                    } else if (videoUrl.includes('vimeo.com')) {
                      // Vimeo video
                      const vimeoId = videoUrl.match(/vimeo\.com\/(\d+)/)?.[1]
                      return (
                        <iframe
                          src={`https://player.vimeo.com/video/${vimeoId}`}
                          className="w-full h-full"
                          allowFullScreen
                          title={lesson.title}
                        />
                      )
                    } else if (videoContent?.file_id) {
                      // Local video file
                      return (
                        <>
                          <video
                            ref={videoRef}
                            src={videoStreamUrl}
                            className="w-full h-full"
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            controls
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                            <Progress value={progress} className="mb-3" />
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:text-white">
                                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                                </Button>
                                <Button variant="ghost" size="icon" onClick={toggleMute} className="text-white hover:text-white">
                                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                                </Button>
                              </div>
                              <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:text-white">
                                <Maximize className="h-5 w-5" />
                              </Button>
                            </div>
                          </div>
                        </>
                      )
                    } else if (videoUrl) {
                      // Direct video URL or other external video
                      return (
                        <iframe
                          src={videoUrl}
                          className="w-full h-full"
                          allowFullScreen
                          title={lesson.title}
                        />
                      )
                    } else {
                      // No video URL - show placeholder
                      return (
                        <div className="w-full h-full flex items-center justify-center text-white">
                          <div className="text-center">
                            <Play className="h-16 w-16 mx-auto mb-4 opacity-50" />
                            <p>{t('lesson.noVideoAvailable')}</p>
                            <p className="text-sm opacity-70">{t('lesson.noVideoHint')}</p>
                          </div>
                        </div>
                      )
                    }
                  })()}
                </div>
              </Card>
            )}

            {/* Document view */}
            {hasDocumentContent && (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium">{documentContent?.title || lesson.title}</h3>
                        <p className="text-sm text-muted-foreground">{documentTypeLabel(documentContent)}</p>

                      </div>
                    </div>
                    {documentContent?.file_id ? (
                      lesson.allow_document_download !== false && (
                        <Button onClick={() => handleFileDownload(documentContent.file_id!, documentContent.filename)}>
                          <Download className="h-4 w-4 mr-2" />
                          {t('lesson.downloadDocument')}
                        </Button>
                      )
                    ) : documentContent?.url ? (
                      <a href={documentContent.url} target="_blank" rel="noopener noreferrer">
                        <Button>
                          <Download className="h-4 w-4 mr-2" />
                          {t('lesson.downloadDocument')}
                        </Button>
                      </a>
                    ) : null}
                  </div>
                  {documentContent?.url && (
                    <iframe
                      src={documentContent.url.includes('docs.google.com') 
                        ? documentContent.url.replace('/edit', '/preview').replace('/view', '/preview')
                        : documentContent.url}
                      className="w-full h-[600px] border rounded-lg"
                      title={lesson.title}
                    />
                  )}
                  {documentContent?.file_id && !documentContent?.url && (
                    <div className="space-y-4">
                      {documentContent.mime_type?.includes('pdf') ? (
                        <iframe
                          src={documentStreamUrl}
                          className="w-full h-[600px] border rounded-lg"
                          title={lesson.title}
                        />
                      ) : documentContent.mime_type?.includes('wordprocessingml') ? (
                        // Deliberately not also matching the broader 'document' substring here --
                        // both the xlsx and pptx OOXML mime types contain "...officedocument...",
                        // so a loose 'document' check would misroute them into the Word viewer.
                        <DocxViewer fileUrl={documentStreamUrl} />
                      ) : documentContent.mime_type?.includes('spreadsheet') || documentContent.mime_type?.includes('excel') ? (
                        <XlsxViewer fileUrl={documentStreamUrl} />
                      ) : documentContent.mime_type?.includes('presentation') ? (
                        <PptxViewer fileUrl={documentStreamUrl} />
                      ) : (
                        <div className="border rounded-lg p-6 text-center">
                          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="font-medium mb-2">{documentContent.filename || t('lesson.defaultDocumentType')}</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            {t('lesson.genericDocumentHint')}
                          </p>
                          {lesson.allow_document_download !== false && (
                            <Button onClick={() => handleFileDownload(documentContent.file_id!, documentContent.filename)}>
                              <Download className="h-4 w-4 mr-2" />
                              {t('lesson.downloadDocument')}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {!documentContent?.url && !documentContent?.file_id && (
                    <div className="text-center text-muted-foreground py-8">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{t('lesson.noDocumentAvailable')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Image content */}
            {hasImageContent && (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">{imageContent?.title || lesson.title}</h3>
                      <p className="text-sm text-muted-foreground">{t('lesson.imageLabel')}</p>
                    </div>
                  </div>
                  <img
                    src={imageContent?.file_id ? imageStreamUrl : imageContent?.url}
                    alt={imageContent?.title || lesson.title}
                    className="w-full rounded-lg border"
                  />
                </CardContent>
              </Card>
            )}

            {/* Link content */}
            {hasLinkContent && (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium">{mainContent?.title || lesson.title}</h3>
                        <p className="text-sm text-muted-foreground">{t('lesson.externalResource')}</p>
                      </div>
                    </div>
                    <a href={mainContent?.url} target="_blank" rel="noopener noreferrer">
                      <Button>
                        {t('lesson.openLink')}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </a>
                  </div>
                  <iframe
                    src={mainContent?.url}
                    className="w-full h-[600px] border rounded-lg"
                    title={lesson.title}
                  />
                </CardContent>
              </Card>
            )}

            {/* Text content */}
            {hasTextContent && (
              <Card>
                <CardContent className="p-6 prose dark:prose-invert max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(textContent?.body || t('lesson.noTextContent')) }} />
                </CardContent>
              </Card>
            )}

            {/* Default: no content */}
            {!hasVideoContent && !hasDocumentContent && !hasLinkContent && !hasTextContent && !hasImageContent && (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('lesson.noContentAvailable')}</p>
                </CardContent>
              </Card>
            )}

            {/* Quiz Section - Shows when lesson has quizzes */}
            {lesson.quizzes && lesson.quizzes.length > 0 && (
              <Card className={quizUnlocked ? 'border-primary' : 'border-muted'}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5" />
                    {t('lesson.quizSectionTitle')}
                  </CardTitle>
                  <CardDescription>
                    {quizUnlocked
                      ? t('lesson.quizUnlockedHint')
                      : lessonProgress?.status !== 'completed'
                        ? t('lesson.quizLockedCompleteFirst')
                        : t('lesson.quizLockedTimeRemaining', { minutes: remainingLessonMinutes })
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lesson.quizzes.map((quiz: any) => (
                    <div
                      key={quiz.id}
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        quizUnlocked
                          ? 'bg-primary/5 hover:bg-primary/10 transition-colors'
                          : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {quizUnlocked ? (
                          <Trophy className="h-5 w-5 text-primary" />
                        ) : (
                          <Lock className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{quiz.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {t('lesson.passingScoreRequired', { score: quiz.passing_score })}
                          </p>
                        </div>
                      </div>
                      {quizUnlocked ? (
                        <Link to={`/quizzes/${quiz.id}`}>
                          <Button>
                            {t('lesson.startQuiz')}
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </Link>
                      ) : (
                        <Button disabled variant="outline">
                          <Lock className="h-4 w-4 mr-2" />
                          {t('lesson.locked')}
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Lesson details: content, resources, notes, comments -- collapsible */}
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">{t('lesson.detailsTitle')}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowDetails((v) => !v)}>
                {showDetails ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    {t('lesson.hideDetails')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    {t('lesson.showDetails')}
                  </>
                )}
              </Button>
            </div>

            {showDetails && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="content">{t('lesson.tabs.content')}</TabsTrigger>
                <TabsTrigger value="resources">{t('lesson.tabs.resources')}</TabsTrigger>
                <TabsTrigger value="notes">{t('lesson.tabs.notes')}</TabsTrigger>
                <TabsTrigger value="comments">{t('lesson.tabs.comments')}</TabsTrigger>
              </TabsList>
              <TabsContent value="content" className="mt-4">
                <Card>
                  <CardContent className="p-6">
                    {lesson.contents && lesson.contents.length > 0 ? (
                      <div className="space-y-4">
                        {lesson.contents.map((content: Content, idx: number) => (
                          <div key={content.id || idx} className="p-4 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{content.filename || t('lesson.defaultContentTitle', { index: idx + 1 })}</p>
                                <p className="text-sm text-muted-foreground">{documentTypeLabel(content)}</p>
                              </div>
                            </div>
                            {content.body && (
                              <div className="mt-3 prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content.body) }} />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">{t('lesson.noAdditionalContent')}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="resources" className="mt-4">
                <Card>
                  <CardContent className="p-6">
                    {lesson.contents?.filter((c: Content) => c.filename || c.file_id).length > 0 ? (
                      <div className="space-y-2">
                        {lesson.contents.filter((c: Content) => c.filename || c.file_id).map((content: Content) => (
                          <div key={content.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <span>{content.filename || t('lesson.defaultFileTitle', { id: content.id })}</span>
                            </div>
                            {content.file_id && lesson.allow_document_download !== false ? (
                              <Button size="sm" variant="outline" onClick={() => handleFileDownload(content.file_id!, content.filename)}>
                                <Download className="h-4 w-4 mr-2" />
                                {t('lesson.download')}
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">{t('lesson.noAdditionalResources')}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="notes" className="mt-4">
                <Card>
                  <CardContent className="p-6">
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder={t('lesson.notesPlaceholder')}
                      className="w-full h-40 p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <Button
                      className="mt-4"
                      onClick={() => saveNotesMutation.mutate(notesDraft)}
                      disabled={saveNotesMutation.isPending}
                    >
                      {t('lesson.saveNotes')}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="comments" className="mt-4">
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start gap-2">
                      <textarea
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder={t('lesson.commentPlaceholder')}
                        className="w-full h-20 p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <Button
                        size="icon"
                        onClick={() => commentDraft.trim() && addCommentMutation.mutate(commentDraft.trim())}
                        disabled={addCommentMutation.isPending || !commentDraft.trim()}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    {comments.length === 0 ? (
                      <p className="text-muted-foreground text-sm flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        {t('lesson.noComments')}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {comments.map((comment) => (
                          <div key={comment.id} className="flex items-start justify-between gap-2 p-3 border rounded-lg">
                            <div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium">{comment.author_name || t('lesson.anonymousAuthor')}</span>
                                <span className="text-muted-foreground text-xs">{formatDateTime(comment.created_at)}</span>
                              </div>
                              <p className="text-sm mt-1 whitespace-pre-wrap">{comment.body}</p>
                            </div>
                            {(comment.user_id === user?.id || ['admin', 'director', 'super_admin'].includes(user?.role || '')) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => deleteCommentMutation.mutate(comment.id)}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between">
              {prevLesson ? (
                <Link to={`/courses/${courseId}/lessons/${prevLesson.public_id}`}>
                  <Button variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {prevLesson.title}
                  </Button>
                </Link>
              ) : (
                <div />
              )}
              {nextLesson ? (
                <Link to={`/courses/${courseId}/lessons/${nextLesson.public_id}`}>
                  <Button>
                    {nextLesson.title}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              ) : lessonProgress?.status === 'completed' ? (
                <Link to={`/courses/${courseId}`}>
                  <Button>
                    {t('lesson.finishCourse')}
                    <CheckCircle className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              ) : (
                <Button
                  onClick={() =>
                    completeMutation.mutate(
                      {},
                      { onSuccess: () => navigate(`/courses/${courseId}`) }
                    )
                  }
                  disabled={!lessonDurationReached || completeMutation.isPending}
                  title={
                    !lessonDurationReached
                      ? t('lesson.markCompleteLockedTimeRemaining', { minutes: remainingLessonMinutes })
                      : undefined
                  }
                >
                  {!lessonDurationReached ? (
                    <Lock className="h-4 w-4 mr-2" />
                  ) : null}
                  {t('lesson.finishCourse')}
                  {lessonDurationReached ? <CheckCircle className="h-4 w-4 ml-2" /> : null}
                </Button>
              )}
            </div>
          </div>

          {/* Sidebar - Course outline */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('lesson.courseContent')}</CardTitle>
                <CardDescription>
                  {t('lesson.lessonsCount', { count: allLessons.length })}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {modules.length > 0 ? modules.map((module: Module) => (
                  <div key={module.id} className="border-b last:border-b-0">
                    <div className="px-4 py-3 bg-muted/50 font-medium text-sm">
                      {module.title}
                    </div>
                    <div className="divide-y">
                      {(module.lessons || []).map((l) => (
                        <Link
                          key={l.id}
                          to={`/courses/${courseId}/lessons/${l.public_id}`}
                          className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
                            l.public_id === lessonId ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                          }`}
                        >
                          <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 bg-muted">
                            <BookOpen className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{l.title}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {l.duration_min || '-'} min
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )) : (
                  <div className="p-4 text-center text-muted-foreground">
                    {t('lesson.noModulesAvailable')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Optional star rating, prompted once when the lesson is first marked complete */}
      <Dialog open={showRatingDialog} onOpenChange={setShowRatingDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('lesson.ratingDialogTitle')}</DialogTitle>
            <DialogDescription>{t('lesson.ratingDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-2 py-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRatingValue(star)}
                onMouseEnter={() => setRatingHover(star)}
                onMouseLeave={() => setRatingHover(0)}
                aria-label={t('lesson.ratingStarLabel', { count: star })}
              >
                <Star
                  className={cn(
                    'h-8 w-8 transition-colors',
                    (ratingHover || ratingValue) >= star
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-muted-foreground'
                  )}
                />
              </button>
            ))}
          </div>
          <textarea
            value={ratingComment}
            onChange={(e) => setRatingComment(e.target.value)}
            placeholder={t('lesson.ratingCommentPlaceholder')}
            className="w-full h-20 p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => setShowRatingDialog(false)}>
              {t('lesson.ratingSkip')}
            </Button>
            <Button
              disabled={ratingValue === 0 || submitEvaluationMutation.isPending}
              onClick={() =>
                submitEvaluationMutation.mutate({ rating: ratingValue, comment: ratingComment.trim() || undefined })
              }
            >
              {t('lesson.ratingSubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PresenceCheckDialog
        open={showPresenceCheck}
        secondsRemaining={presenceCountdown}
        onContinue={handlePresenceContinue}
      />
    </div>
  )
}
