import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlarmClock } from 'lucide-react'

export function SessionTimeoutDialog({
  open,
  secondsLeft,
  onStayActive,
}: {
  open: boolean
  secondsLeft: number
  onStayActive: () => void
}) {
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-sm"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlarmClock className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">Session sur le point d'expirer</DialogTitle>
          <DialogDescription className="text-center">
            Pour votre sécurité, vous allez être déconnecté(e) automatiquement par inactivité.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 text-center">
          <p className="text-4xl font-bold tabular-nums">
            {minutes}:{String(seconds).padStart(2, '0')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">avant la déconnexion automatique</p>
        </div>
        <DialogFooter>
          <Button onClick={onStayActive} className="w-full">
            Rester connecté(e)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
