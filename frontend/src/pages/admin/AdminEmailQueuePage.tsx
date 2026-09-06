import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { Check, X } from 'lucide-react'
import { api } from '@/services/api'

interface PendingItem {
  id: number
  eventType: string
  channel: string
  subject: string | null
  recipientName: string
  recipientEmail: string
  triggeredByName: string | null
  status: string
  createdAt: string
}

/** Bucket-B review queue: notifications queued by automatic/cron events
 * (auto-suspension, quiz results, live session reminders, certificate
 * expiry, bulk import, group course assignments) with no single admin
 * "confirming" them synchronously -- see PendingNotificationService. */
export default function AdminEmailQueuePage() {
  const { t, i18n } = useTranslation('admin')
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: items = [], isLoading } = useQuery<PendingItem[]>({
    queryKey: ['admin-email-queue'],
    queryFn: async () => (await api.get('/notifications/pending')).data.data,
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.put(`/notifications/pending/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-email-queue'] })
      toast({ title: t('emailQueue.approvedToast') })
    },
    onError: () => toast({ title: t('emailQueue.errorToast'), variant: 'destructive' }),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: number) => api.put(`/notifications/pending/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-email-queue'] })
      toast({ title: t('emailQueue.rejectedToast') })
    },
    onError: () => toast({ title: t('emailQueue.errorToast'), variant: 'destructive' }),
  })

  const [isBulkRunning, setIsBulkRunning] = useState(false)

  const handleBulk = async (action: 'approve' | 'reject') => {
    setIsBulkRunning(true)
    try {
      for (const item of items) {
        await api.put(`/notifications/pending/${item.id}/${action}`)
      }
      queryClient.invalidateQueries({ queryKey: ['admin-email-queue'] })
      toast({ title: action === 'approve' ? t('emailQueue.approvedToast') : t('emailQueue.rejectedToast') })
    } catch {
      toast({ title: t('emailQueue.errorToast'), variant: 'destructive' })
    } finally {
      setIsBulkRunning(false)
    }
  }

  if (isLoading) return <PageLoading />

  const isBusy = isBulkRunning || approveMutation.isPending || rejectMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('emailQueue.title')}</h1>
          <p className="text-muted-foreground">{t('emailQueue.subtitle')}</p>
        </div>
        {items.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleBulk('reject')} disabled={isBusy}>
              {t('emailQueue.rejectAll')}
            </Button>
            <Button onClick={() => handleBulk('approve')} disabled={isBusy}>
              {t('emailQueue.approveAll')}
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t('emailQueue.empty')}</p>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">
                        {t(`emailQueue.eventTypes.${item.eventType}`, { defaultValue: item.eventType })}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString(i18n.language)}
                      </span>
                    </div>
                    <p className="font-medium truncate mt-1">{item.subject}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {item.recipientName} ({item.recipientEmail}) — {t('emailQueue.columns.triggeredBy')}: {item.triggeredByName || t('emailQueue.system')}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(item.id)}
                      disabled={isBusy}
                    >
                      <X className="h-4 w-4 mr-1" />
                      {t('emailQueue.reject')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(item.id)}
                      disabled={isBusy}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {t('emailQueue.approve')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
