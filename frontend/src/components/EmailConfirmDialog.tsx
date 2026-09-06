import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/services/api'

export interface PendingNotification {
  id: number
  subject: string
  recipientEmail: string
}

interface EmailConfirmDialogProps {
  pendingNotification: PendingNotification | null
  onOpenChange: (open: boolean) => void
}

/** Confirm/reject modal shown right after an action that queued an email --
 * see PendingNotificationService on the backend. Reused across every
 * Bucket-A trigger point (account creation, suspension, single-user course
 * assignment, self-service password change). */
export function EmailConfirmDialog({ pendingNotification, onOpenChange }: EmailConfirmDialogProps) {
  const { t } = useTranslation('shared')
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const respond = async (action: 'approve' | 'reject') => {
    if (!pendingNotification) return
    setIsSubmitting(true)
    try {
      await api.put(`/notifications/pending/${pendingNotification.id}/${action}`)
      toast({
        title: action === 'approve' ? t('emailConfirm.sentToast') : t('emailConfirm.rejectedToast'),
      })
      onOpenChange(false)
    } catch (error) {
      toast({ title: t('emailConfirm.errorToast'), variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={!!pendingNotification} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('emailConfirm.title')}</DialogTitle>
          <DialogDescription>
            {t('emailConfirm.description', { email: pendingNotification?.recipientEmail })}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm font-medium">« {pendingNotification?.subject} »</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => respond('reject')} disabled={isSubmitting}>
            {t('emailConfirm.reject')}
          </Button>
          <Button onClick={() => respond('approve')} disabled={isSubmitting}>
            {t('emailConfirm.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
