import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { CardLoading } from '@/components/ui/loading'

interface DocxViewerProps {
  fileUrl: string | undefined
}

/** Renders a .docx file inline, entirely client-side, preserving its actual
 * formatting (fonts, colors, tables, page layout) via docx-preview -- unlike a
 * plain-HTML conversion, it renders close to how Word itself would. No external
 * viewer service is possible here since the file is private/token-gated. */
export function DocxViewer({ fileUrl }: DocxViewerProps) {
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

    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.blob()
      })
      .then((blob) => renderAsync(blob, container, container, { useBase64URL: true }))
      .then(() => {
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
