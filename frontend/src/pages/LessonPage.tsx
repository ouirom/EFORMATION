import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
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
  ClipboardCheck,
  Lock,
  Trophy,
} from 'lucide-react'
import { api } from '@/services/api'
import { fileService } from '@/services/file.service'
import { useSessionTimeoutContext, idleLimitForLessonDuration } from '@/contexts/SessionTimeoutContext'

// <video>/<iframe> elements can't send an Authorization header, so the token
// travels as a query param for this one streaming endpoint.
function streamUrl(fileId: number) {
  const token = localStorage.getItem('accessToken')
  return `/api/v1/files/${fileId}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`
}

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
  title: string
  type: 'video' | 'document' | 'link' | 'quiz' | 'text' | null
  duration_min: number
  position: number
  module_id: number
  contents: Content[]
  quizzes: any[]
}

interface Module {
  id: number
  title: string
  lessons: { id: number; title: string; type: string; duration_min: number; position: number }[]
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
  const { courseId, lessonId } = useParams()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const pageContainerRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number>(Date.now())
  const lastUpdateRef = useRef<number>(Date.now())

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [activeTab, setActiveTab] = useState('content')
  const [isPageFullscreen, setIsPageFullscreen] = useState(false)

  // Fetch lesson progress
  const { data: lessonProgress } = useQuery<LessonProgress>({
    queryKey: ['lesson-progress', lessonId],
    queryFn: async () => {
      const response = await api.get(`/lessons/${lessonId}/progress`)
      return response.data.data
    },
  })

  // Start lesson tracking mutation
  const startLessonMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/lessons/${lessonId}/start`, { courseId: parseInt(courseId || '0') })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-progress', lessonId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  // Update progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: async ({ progressPercent, timeSpentSeconds }: { progressPercent: number; timeSpentSeconds: number }) => {
      await api.post(`/lessons/${lessonId}/progress`, { progressPercent, timeSpentSeconds })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-progress', lessonId] })
    },
  })

  // Fetch lesson data
  const { data: lesson, isLoading: lessonLoading, error: lessonError } = useQuery<LessonData>({
    queryKey: ['lesson', lessonId],
    queryFn: async () => {
      const response = await api.get(`/lessons/${lessonId}`)
      console.log('Lesson API response:', response.data)
      return response.data.data
    },
  })

  // Fetch course modules for navigation
  const { data: modules = [] } = useQuery<Module[]>({
    queryKey: ['course-modules', courseId],
    queryFn: async () => {
      const response = await api.get(`/modules?courseId=${courseId}`)
      console.log('Modules API response:', response.data)
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
    mutationFn: async () => {
      await api.post(`/lessons/${lessonId}/complete`, { courseId: parseInt(courseId || '0') })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson', lessonId] })
      queryClient.invalidateQueries({ queryKey: ['lesson-progress', lessonId] })
      queryClient.invalidateQueries({ queryKey: ['course', courseId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['my-courses'] })
      
      // Check if lesson has quizzes
      const hasQuizzes = lesson?.quizzes && lesson.quizzes.length > 0
      toast({
        title: 'Leçon terminée ! 🎉',
        description: hasQuizzes 
          ? 'Vous pouvez maintenant passer le quiz d\'évaluation.'
          : 'Vous pouvez passer à la leçon suivante.',
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
      if (timeSpent >= 30 && lessonProgress?.status !== 'completed') {
        // Update every 30 seconds
        updateProgressMutation.mutate({ 
          progressPercent: lessonProgress?.progress_percent || 0, 
          timeSpentSeconds: timeSpent 
        })
        lastUpdateRef.current = Date.now()
      }
    }, 30000) // Check every 30 seconds

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation object is recreated each render; only re-run when progress changes
  }, [lessonProgress])

  // Save progress when leaving the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      const timeSpent = Math.floor((Date.now() - lastUpdateRef.current) / 1000)
      if (timeSpent > 5) {
        // Use sendBeacon for reliable tracking on page unload
        const data = JSON.stringify({ 
          progressPercent: progress, 
          timeSpentSeconds: timeSpent 
        })
        navigator.sendBeacon(`/api/v1/lessons/${lessonId}/progress`, data)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [lessonId, progress])

  // Find current lesson position - filter out undefined values
  const allLessons = modules.flatMap((m) => m.lessons || []).filter(Boolean)
  const currentIndex = allLessons.findIndex((l) => l && l.id === parseInt(lessonId || '0'))
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null

  // Video progress tracking
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      const progressValue = (video.currentTime / video.duration) * 100
      setProgress(progressValue)

      // Auto-complete when 90% watched
      if (progressValue >= 90) {
        completeMutation.mutate()
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
          title: 'Plein écran indisponible',
          description: "Votre navigateur a refusé le passage en plein écran.",
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
      toast({ title: 'Erreur', description: 'Impossible de télécharger le fichier', variant: 'destructive' })
    }
  }

  if (lessonLoading) {
    return <PageLoading />
  }

  if (lessonError || !lesson) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Leçon non trouvée</h2>
        <p className="text-muted-foreground mb-4">Cette leçon n'existe pas ou n'est pas accessible.</p>
        <Link to={`/courses/${courseId}`}>
          <Button>Retour au cours</Button>
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

  // Get content for display
  const videoContent = lesson.contents?.find(c => 
    c.mime_type?.startsWith('video/') || 
    (c.url && isVideoUrl(c.url)) ||
    c.type === 'youtube_link' ||
    c.type === 'video_mp4'
  )
  const documentContent = lesson.contents?.find(c =>
    c.type === 'pdf' ||
    c.type === 'docx' ||
    (c.file_id && c.type !== 'image' && !c.mime_type?.startsWith('image/')) || // Support for uploaded files with file_id
    (c.url && isDocumentUrl(c.url))
  )
  // A "link" lesson's content is also stored with type 'text' (no dedicated link
  // type exists in the schema) but only carries a url, not a body — require a
  // real body here so that row doesn't fall through to the empty text block below.
  const textContent = lesson.contents?.find(c => c.body)
  const imageContent = lesson.contents?.find(c =>
    c.type === 'image' || c.mime_type?.startsWith('image/')
  )
  const mainContent = lesson.contents?.[0]

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

  // Format time spent
  const formatTimeSpent = (seconds: number) => {
    if (!seconds) return '0 min'
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) {
      return `${hours}h ${minutes % 60}min`
    }
    return `${minutes} min`
  }

  // Get status color and label
  const getStatusInfo = (status: string | undefined) => {
    switch (status) {
      case 'completed':
        return { color: 'bg-green-500', label: 'Terminée', icon: CheckCircle }
      case 'in_progress':
        return { color: 'bg-blue-500', label: 'En cours', icon: Play }
      default:
        return { color: 'bg-gray-400', label: 'Non commencée', icon: Clock }
    }
  }

  const statusInfo = getStatusInfo(lessonProgress?.status)
  const StatusIcon = statusInfo.icon

  return (
    <div ref={pageContainerRef} className="min-h-screen bg-background overflow-y-auto">
      {/* Header with Progress Indicator */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
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
                  {lesson.duration_min || '-'} min • {lesson.type || 'Leçon'}
                  {lessonProgress?.time_spent_seconds ? (
                    <span className="ml-2">• Temps passé: {formatTimeSpent(lessonProgress.time_spent_seconds)}</span>
                  ) : null}
                </p>
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
              <Button
                variant="outline"
                size="icon"
                onClick={togglePageFullscreen}
                title={isPageFullscreen ? 'Quitter le plein écran' : 'Ouvrir le cours en plein écran'}
              >
                {isPageFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
              <Button
                onClick={() => completeMutation.mutate()}
                variant={lessonProgress?.status === 'completed' ? 'outline' : 'default'}
                disabled={lessonProgress?.status === 'completed'}
              >
                {lessonProgress?.status === 'completed' ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Terminée
                  </>
                ) : (
                  'Marquer comme terminé'
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

      <div className="container mx-auto px-4 py-6">
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
                            src={streamUrl(videoContent.file_id)}
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
                            <p>Aucune vidéo disponible pour cette leçon</p>
                            <p className="text-sm opacity-70">Ajoutez une URL vidéo dans l'administration</p>
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
                        <p className="text-sm text-muted-foreground">{documentContent?.type || documentContent?.mime_type || 'Document'}</p>
                        
                      </div>
                    </div>
                    {documentContent?.file_id ? (
                      <Button onClick={() => handleFileDownload(documentContent.file_id!, documentContent.filename)}>
                        <Download className="h-4 w-4 mr-2" />
                        Télécharger le document
                      </Button>
                    ) : documentContent?.url ? (
                      <a href={documentContent.url} target="_blank" rel="noopener noreferrer">
                        <Button>
                          <Download className="h-4 w-4 mr-2" />
                          Télécharger le document
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
                          src={streamUrl(documentContent.file_id!)}
                          className="w-full h-[600px] border rounded-lg"
                          title={lesson.title}
                        />
                      ) : documentContent.mime_type?.includes('document') || documentContent.mime_type?.includes('wordprocessingml') ? (
                        <div className="border rounded-lg p-6 text-center">
                          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="font-medium mb-2">Document Word</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            Ce document ne peut pas être prévisualisé directement. Téléchargez-le pour le consulter.
                          </p>
                          <Button onClick={() => handleFileDownload(documentContent.file_id!, documentContent.filename)}>
                            <Download className="h-4 w-4 mr-2" />
                            Télécharger le document
                          </Button>
                        </div>
                      ) : documentContent.mime_type?.includes('spreadsheet') || documentContent.mime_type?.includes('excel') ? (
                        <div className="border rounded-lg p-6 text-center">
                          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="font-medium mb-2">Feuille de calcul</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            Cette feuille de calcul ne peut pas être prévisualisée directement. Téléchargez-la pour la consulter.
                          </p>
                          <Button onClick={() => handleFileDownload(documentContent.file_id!, documentContent.filename)}>
                            <Download className="h-4 w-4 mr-2" />
                            Télécharger le fichier
                          </Button>
                        </div>
                      ) : documentContent.mime_type?.includes('presentation') ? (
                        <div className="border rounded-lg p-6 text-center">
                          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="font-medium mb-2">Présentation</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            Cette présentation ne peut pas être prévisualisée directement. Téléchargez-la pour la consulter.
                          </p>
                          <Button onClick={() => handleFileDownload(documentContent.file_id!, documentContent.filename)}>
                            <Download className="h-4 w-4 mr-2" />
                            Télécharger la présentation
                          </Button>
                        </div>
                      ) : (
                        <div className="border rounded-lg p-6 text-center">
                          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="font-medium mb-2">{documentContent.filename || 'Document'}</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            Ce type de document ne peut pas être prévisualisé directement.
                          </p>
                          <Button onClick={() => handleFileDownload(documentContent.file_id!, documentContent.filename)}>
                            <Download className="h-4 w-4 mr-2" />
                            Télécharger le document
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {!documentContent?.url && !documentContent?.file_id && (
                    <div className="text-center text-muted-foreground py-8">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Aucun document disponible</p>
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
                      <p className="text-sm text-muted-foreground">Image</p>
                    </div>
                  </div>
                  <img
                    src={imageContent?.file_id ? streamUrl(imageContent.file_id) : imageContent?.url}
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
                        <p className="text-sm text-muted-foreground">Ressource externe</p>
                      </div>
                    </div>
                    <a href={mainContent?.url} target="_blank" rel="noopener noreferrer">
                      <Button>
                        Ouvrir le lien
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
                  <div dangerouslySetInnerHTML={{ __html: textContent?.body || 'Aucun contenu texte disponible.' }} />
                </CardContent>
              </Card>
            )}

            {/* Default: no content */}
            {!hasVideoContent && !hasDocumentContent && !hasLinkContent && !hasTextContent && !hasImageContent && (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucun contenu disponible pour cette leçon.</p>
                </CardContent>
              </Card>
            )}

            {/* Quiz Section - Shows when lesson has quizzes */}
            {lesson.quizzes && lesson.quizzes.length > 0 && (
              <Card className={lessonProgress?.status === 'completed' ? 'border-primary' : 'border-muted'}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5" />
                    Quiz d'évaluation
                  </CardTitle>
                  <CardDescription>
                    {lessonProgress?.status === 'completed' 
                      ? 'Testez vos connaissances avec le quiz de cette leçon'
                      : 'Terminez la leçon pour débloquer le quiz'
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lesson.quizzes.map((quiz: any) => (
                    <div 
                      key={quiz.id} 
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        lessonProgress?.status === 'completed' 
                          ? 'bg-primary/5 hover:bg-primary/10 transition-colors' 
                          : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {lessonProgress?.status === 'completed' ? (
                          <Trophy className="h-5 w-5 text-primary" />
                        ) : (
                          <Lock className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{quiz.title}</p>
                          <p className="text-sm text-muted-foreground">
                            Score requis: {quiz.passing_score}%
                          </p>
                        </div>
                      </div>
                      {lessonProgress?.status === 'completed' ? (
                        <Link to={`/quizzes/${quiz.id}`}>
                          <Button>
                            Commencer le quiz
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </Link>
                      ) : (
                        <Button disabled variant="outline">
                          <Lock className="h-4 w-4 mr-2" />
                          Verrouillé
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Tabs for content, resources, notes */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="content">Contenu</TabsTrigger>
                <TabsTrigger value="resources">Ressources</TabsTrigger>
                <TabsTrigger value="notes">Mes notes</TabsTrigger>
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
                                <p className="font-medium">{content.filename || `Contenu ${idx + 1}`}</p>
                                <p className="text-sm text-muted-foreground">{content.type || content.mime_type}</p>
                              </div>
                            </div>
                            {content.body && (
                              <div className="mt-3 prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: content.body }} />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Aucun contenu supplémentaire pour cette leçon.</p>
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
                              <span>{content.filename || `Fichier ${content.id}`}</span>
                            </div>
                            {content.file_id ? (
                              <Button size="sm" variant="outline" onClick={() => handleFileDownload(content.file_id!, content.filename)}>
                                <Download className="h-4 w-4 mr-2" />
                                Télécharger
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Aucune ressource supplémentaire pour cette leçon.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="notes" className="mt-4">
                <Card>
                  <CardContent className="p-6">
                    <textarea
                      placeholder="Prenez des notes pendant votre apprentissage..."
                      className="w-full h-40 p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <Button className="mt-4">Sauvegarder les notes</Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              {prevLesson ? (
                <Link to={`/courses/${courseId}/lessons/${prevLesson.id}`}>
                  <Button variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {prevLesson.title}
                  </Button>
                </Link>
              ) : (
                <div />
              )}
              {nextLesson ? (
                <Link to={`/courses/${courseId}/lessons/${nextLesson.id}`}>
                  <Button>
                    {nextLesson.title}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              ) : (
                <Link to={`/courses/${courseId}`}>
                  <Button>
                    Terminer le cours
                    <CheckCircle className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Sidebar - Course outline */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contenu du cours</CardTitle>
                <CardDescription>
                  {allLessons.length} leçons
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
                          to={`/courses/${courseId}/lessons/${l.id}`}
                          className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
                            l.id === parseInt(lessonId || '0') ? 'bg-primary/10 border-l-2 border-l-primary' : ''
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
                    Aucun module disponible
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
