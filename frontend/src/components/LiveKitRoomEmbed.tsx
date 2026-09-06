import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import { Circle, Loader2, Maximize, Minimize, Square } from 'lucide-react'
import { api } from '@/services/api'
import { useToast } from '@/components/ui/use-toast'

interface LiveKitRoomEmbedProps {
  sessionId: number
  onLeave: () => void
  isOrganizer?: boolean
}

// Embedded video conference for a live session that has no external meetingUrl
// configured (Zoom/Teams/etc.) -- see LiveSessionDetailPage.tsx. Requests a
// short-lived per-participant token from the backend (which also registers
// the caller in live_participants) and hands it to LiveKit's prebuilt
// VideoConference UI (camera/mic/screen-share/chat all included).
export function LiveKitRoomEmbed({ sessionId, onLeave, isOrganizer }: LiveKitRoomEmbedProps) {
  const { t } = useTranslation('live')
  const { t: tCommon } = useTranslation('common')
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const { toast } = useToast()

  const { data, isLoading, error } = useQuery({
    queryKey: ['livekit-token', sessionId],
    queryFn: () => api.liveSessions.getLivekitToken(sessionId),
    retry: false,
    staleTime: Infinity,
  })

  const startRecordingMutation = useMutation({
    mutationFn: () => api.liveSessions.startRecording(sessionId),
    onSuccess: () => setIsRecording(true),
    onError: (err: any) => {
      toast({
        title: t('embed.recordingImpossibleTitle'),
        description: err?.response?.data?.error?.message || t('embed.startRecordingError'),
        variant: 'destructive',
      })
    },
  })

  const stopRecordingMutation = useMutation({
    mutationFn: () => api.liveSessions.stopRecording(sessionId),
    onSuccess: () => setIsRecording(false),
    onError: (err: any) => {
      toast({
        title: tCommon('status.error'),
        description: err?.response?.data?.error?.message || t('embed.stopRecordingError'),
        variant: 'destructive',
      })
    },
  })

  // Keep the icon in sync when fullscreen is exited via Esc or the browser's own UI.
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen().catch(() => {
        // Fullscreen can be denied by the browser (e.g. no user gesture, or
        // disabled by an iframe's allow policy) -- fail silently, the room
        // still works at normal size.
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 h-96 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {t('embed.connecting')}
      </div>
    )
  }

  if (error || !data) {
    const message =
      (error as any)?.response?.data?.error?.message ||
      t('embed.connectionError')
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {message}
        </div>
        <button onClick={onLeave} className="text-sm text-muted-foreground hover:underline">
          {t('embed.back')}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[70vh] rounded-lg overflow-hidden border bg-black"
      data-lk-theme="default"
    >
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        {isOrganizer && (
          <button
            type="button"
            onClick={() => (isRecording ? stopRecordingMutation.mutate() : startRecordingMutation.mutate())}
            disabled={startRecordingMutation.isPending || stopRecordingMutation.isPending}
            title={isRecording ? t('embed.stopRecording') : t('embed.startRecording')}
            className="flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-2 text-white hover:bg-black/80 disabled:opacity-50"
          >
            {isRecording ? (
              <Square className="h-4 w-4 fill-current text-red-500" />
            ) : (
              <Circle className="h-4 w-4 fill-current text-red-500" />
            )}
            {isRecording && <span className="text-xs">REC</span>}
          </button>
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? t('embed.exitFullscreen') : t('embed.fullscreen')}
          className="rounded-md bg-black/60 p-2 text-white hover:bg-black/80"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      </div>
      <LiveKitRoom
        serverUrl={data.url}
        token={data.token}
        video
        audio
        connect
        onDisconnected={onLeave}
        style={{ height: '100%' }}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  )
}
