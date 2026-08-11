import { useQuery } from '@tanstack/react-query'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import { Loader2 } from 'lucide-react'
import { api } from '@/services/api'

interface LiveKitRoomEmbedProps {
  sessionId: number
  onLeave: () => void
}

// Embedded video conference for a live session that has no external meetingUrl
// configured (Zoom/Teams/etc.) -- see LiveSessionDetailPage.tsx. Requests a
// short-lived per-participant token from the backend (which also registers
// the caller in live_participants) and hands it to LiveKit's prebuilt
// VideoConference UI (camera/mic/screen-share/chat all included).
export function LiveKitRoomEmbed({ sessionId, onLeave }: LiveKitRoomEmbedProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['livekit-token', sessionId],
    queryFn: () => api.liveSessions.getLivekitToken(sessionId),
    retry: false,
    staleTime: Infinity,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 h-96 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Connexion à la session...
      </div>
    )
  }

  if (error || !data) {
    const message =
      (error as any)?.response?.data?.error?.message ||
      "Impossible de rejoindre la visioconférence intégrée."
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {message}
        </div>
        <button onClick={onLeave} className="text-sm text-muted-foreground hover:underline">
          Retour
        </button>
      </div>
    )
  }

  return (
    <div className="h-[70vh] rounded-lg overflow-hidden border" data-lk-theme="default">
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
