import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TourStep } from '@/lib/tourSteps'

interface ProductTourProps {
  steps: TourStep[]
  onFinish: () => void
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export function ProductTour({ steps, onFinish }: ProductTourProps) {
  const { t } = useTranslation('tour')
  const { t: tShared } = useTranslation('shared')
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const step = steps[stepIndex]

  useEffect(() => {
    const measure = () => {
      const el = step ? document.querySelector(step.target) : null
      if (!el) {
        setRect(null)
        return
      }
      el.scrollIntoView({ block: 'center', behavior: 'auto' })
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    // Let scrollIntoView settle before measuring final position
    const t1 = setTimeout(measure, 30)
    const t2 = setTimeout(measure, 200)
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener('resize', measure)
    }
  }, [stepIndex, step])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFinish()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex])

  const goNext = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1)
    } else {
      onFinish()
    }
  }

  const goPrev = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1)
  }

  if (!step) return null

  const padding = 8
  const spotlight = rect
    ? {
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }
    : null

  const TOOLTIP_WIDTH = 320
  const TOOLTIP_HEIGHT_ESTIMATE = 180
  const MARGIN = 16

  let tooltipStyle: React.CSSProperties
  if (spotlight) {
    const maxLeft = window.innerWidth - TOOLTIP_WIDTH - MARGIN
    const maxTop = window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - MARGIN

    if (step.placement === 'right') {
      const preferredLeft = spotlight.left + spotlight.width + MARGIN
      tooltipStyle = {
        top: Math.max(MARGIN, Math.min(spotlight.top, maxTop)),
        // Fall back to the left of the target if there's no room on the right
        left: preferredLeft > maxLeft ? Math.max(MARGIN, spotlight.left - TOOLTIP_WIDTH - MARGIN) : preferredLeft,
      }
    } else {
      tooltipStyle = {
        top: Math.max(MARGIN, Math.min(spotlight.top + spotlight.height + MARGIN, maxTop)),
        left: Math.max(MARGIN, Math.min(spotlight.left, maxLeft)),
      }
    }
  } else {
    tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Dimmed backdrop */}
      <div className="absolute inset-0 bg-black/50 transition-opacity" />

      {/* Spotlight ring around the target */}
      {spotlight && (
        <div
          className="absolute rounded-lg ring-2 ring-primary transition-all duration-300 pointer-events-none"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute w-80 rounded-lg border bg-popover p-4 shadow-xl transition-all duration-300"
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold">{t(`${step.key}.title`)}</h3>
          <button
            type="button"
            onClick={onFinish}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={tShared('productTour.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{t(`${step.key}.content`)}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {stepIndex + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={goPrev}>
                {tShared('productTour.previous')}
              </Button>
            )}
            <Button size="sm" onClick={goNext}>
              {stepIndex < steps.length - 1 ? tShared('productTour.next') : tShared('productTour.finish')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
