import { useEffect, useRef, useState } from 'react'
import { init } from 'pptx-preview'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { CardLoading } from '@/components/ui/loading'

interface PptxViewerProps {
  fileUrl: string | undefined
}

/** Renders a .pptx file inline (all slides, scrollable) entirely client-side via
 * pptx-preview -- same rationale as DocxViewer/XlsxViewer: the file is private,
 * served through an authenticated/token-gated endpoint, so no external viewer
 * service (Office/Google) can be used. */
export function PptxViewer({ fileUrl }: PptxViewerProps) {
  const { t } = useTranslation('courses')
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!fileUrl) return
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    setLoading(true)
    setError(false)
    container.innerHTML = ''

    const previewer = init(container, { width: 960, height: 540, mode: 'list' })

    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.arrayBuffer()
      })
      .then((arrayBuffer) => previewer.preview(arrayBuffer))
      .then(() => {
        // pptx-preview can resolve without throwing yet still parse zero slides
        // (seen with a real .pptx carrying a stray/orphaned Content_Types
        // relationship) -- treat that as a failure too rather than showing an
        // empty, unexplained box.
        if (previewer.slideCount === 0) throw new Error('no slides parsed')
        if (!cancelled) setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      previewer.destroy()
    }
  }, [fileUrl])

  if (!fileUrl) {
    return <CardLoading />
  }

  return (
    <div className="border rounded-lg overflow-auto max-h-[600px]">
      {loading && <CardLoading />}
      {error && (
        <div className="p-6 text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p>{t('lesson.documentViewerError')}</p>
        </div>
      )}
      <div ref={containerRef} className={error || loading ? 'hidden' : ''} />
    </div>
  )
}
