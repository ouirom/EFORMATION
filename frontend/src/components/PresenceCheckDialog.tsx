import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface PresenceCheckDialogProps {
  open: boolean
  secondsRemaining: number
  onContinue: () => void
}

/** "Are you still there?" prompt shown part-way through a lesson (per-lesson
 * configurable trigger point and countdown) -- only the Continue button can
 * dismiss it; letting the countdown expire sends the learner back. */
export function PresenceCheckDialog({ open, secondsRemaining, onContinue }: PresenceCheckDialogProps) {
  const { t } = useTranslation('courses')

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-sm"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('lesson.presenceCheck.title')}</DialogTitle>
          <DialogDescription>{t('lesson.presenceCheck.description')}</DialogDescription>
        </DialogHeader>
        <p className="text-center text-3xl font-bold tabular-nums">{secondsRemaining}</p>
        <DialogFooter>
          <Button onClick={onContinue} className="w-full">
            {t('lesson.presenceCheck.continueButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
