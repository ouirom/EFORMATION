import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

// <img>/<video>/<audio>/<iframe> elements can't send an Authorization header, so a
// token has to travel as a query param for this one streaming endpoint -- a
// short-lived, single-file-scoped token (minted via POST /files/:id/stream-token)
// rather than the full access token, so it can't be replayed against the rest of
// the API if it leaks through logs/history. Returns undefined until the token is
// fetched. The endpoint itself sets Content-Disposition: inline for images/video/
// audio/pdf and attachment (forced download, real filename) for everything else,
// so the same URL works for both inline preview and "click to download".
export function useStreamUrl(fileId: number | undefined): string | undefined {
  const { data: streamToken } = useQuery({
    queryKey: ['stream-token', fileId],
    queryFn: async () => {
      const response = await api.post(`/files/${fileId}/stream-token`)
      return response.data.data.streamToken as string
    },
    enabled: !!fileId,
    staleTime: 8 * 60 * 1000, // just under the token's 10-minute server-side expiry
  })
  if (!fileId || !streamToken) return undefined
  return `/api/v1/files/${fileId}/stream?token=${encodeURIComponent(streamToken)}`
}
