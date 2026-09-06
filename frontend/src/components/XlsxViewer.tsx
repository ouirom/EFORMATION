import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import DOMPurify from 'dompurify'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { CardLoading } from '@/components/ui/loading'
import { cn } from '@/lib/utils'

interface XlsxViewerProps {
  fileUrl: string | undefined
}

/** Renders an .xlsx file inline as an HTML table per sheet, entirely client-side
 * (SheetJS) -- same rationale as DocxViewer: the file is private/token-gated, so
 * no external viewer service can be used. */
export function XlsxViewer({ fileUrl }: XlsxViewerProps) {
  const { t } = useTranslation('courses')
  const [sheets, setSheets] = useState<{ name: string; html: string }[] | null>(null)
  const [activeSheet, setActiveSheet] = useState(0)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!fileUrl) return
    let cancelled = false
    setSheets(null)
    setActiveSheet(0)
    setError(false)

    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.arrayBuffer()
      })
      .then((arrayBuffer) => {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const parsed = workbook.SheetNames.map((name) => ({
          name,
          html: DOMPurify.sanitize(XLSX.utils.sheet_to_html(workbook.Sheets[name])),
        }))
        if (!cancelled) setSheets(parsed)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [fileUrl])

  if (!fileUrl || (!sheets && !error)) {
    return <CardLoading />
  }

  if (error || !sheets || sheets.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
        <p>{t('lesson.documentViewerError')}</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {sheets.length > 1 && (
        <div className="flex gap-1 border-b bg-muted/50 p-2 overflow-x-auto">
          {sheets.map((sheet, i) => (
            <button
              key={sheet.name}
              type="button"
              onClick={() => setActiveSheet(i)}
              className={cn(
                'px-3 py-1 text-sm rounded whitespace-nowrap',
                i === activeSheet ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}
      <div
        className="xlsx-viewer p-4 max-h-[600px] overflow-auto text-sm [&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-1.5 [&_th]:border [&_th]:border-border [&_th]:p-1.5 [&_th]:bg-muted"
        dangerouslySetInnerHTML={{ __html: sheets[activeSheet].html }}
      />
    </div>
  )
}
