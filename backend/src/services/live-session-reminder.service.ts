import { DatabaseService } from './database.service';
import { PendingNotificationService } from './pending-notification.service';
import { TenantSettingsService } from './tenant-settings.service';
import { db } from '../database/db-helpers';
import { config } from '../config';
import { logger } from '../utils/logger';

const REMINDER_WINDOW_HOURS = 2;

interface UpcomingRecipientRow {
  session_id: number;
  tenant_id: number;
  title: string;
  scheduled_at: string;
  user_id: number;
}

export class LiveSessionReminderService {
  /**
   * Hourly job: for every live session starting within the next
   * REMINDER_WINDOW_HOURS that hasn't been reminded yet, queues a reminder
   * for everyone who can see it -- invitees + organizer for a private
   * session, enrolled learners for a public course-linked session. A public
   * session with no course_id has no natural recipient list (it's visible to
   * the whole tenant) and is skipped rather than blasting every user.
   */
  static async runUpcomingReminders(): Promise<{ sessionsReminded: number; notificationsQueued: number }> {
    const recipients = await DatabaseService.query<UpcomingRecipientRow>(
      `SELECT DISTINCT ls.id as session_id, ls.tenant_id, ls.title, ls.scheduled_at, r.user_id
       FROM live_sessions ls
       JOIN (
         SELECT session_id, user_id FROM live_session_invitees
         UNION
         SELECT ls2.id as session_id, ls2.organizer_id as user_id
         FROM live_sessions ls2
         WHERE ls2.visibility = 'private' AND ls2.organizer_id IS NOT NULL
         UNION
         SELECT ls3.id as session_id, e.user_id
         FROM live_sessions ls3
         JOIN enrollments e ON e.course_id = ls3.course_id
         WHERE ls3.visibility = 'public' AND ls3.course_id IS NOT NULL
       ) r ON r.session_id = ls.id
       WHERE ls.status = 'scheduled'
         AND ls.reminder_sent_at IS NULL
         AND ls.scheduled_at BETWEEN ${db.now()} AND ${db.dateAdd('hour', String(REMINDER_WINDOW_HOURS), db.now())}`,
      {}
    );

    const sessionIds = Array.from(new Set(recipients.map((r) => r.session_id)));
    let notificationsQueued = 0;

    for (const row of recipients) {
      // Nothing is queued for an organization that turned live sessions or notifications off.
      const settings = await TenantSettingsService.get(row.tenant_id);
      if (!settings.enableLiveSessions || !settings.enableNotifications) continue;
      const timeLabel = new Date(row.scheduled_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
      try {
        await PendingNotificationService.queue({
          tenantId: row.tenant_id,
          userId: row.user_id,
          eventType: 'live_session_reminder',
          subject: `Rappel : la session "${row.title}" commence bientôt`,
          body: `Bonjour,\n\nLa session en direct "${row.title}" commence le ${timeLabel}.`,
          actionUrl: `${config.frontendUrl}/live/${row.session_id}`,
          metadata: { sessionId: row.session_id },
        });
        notificationsQueued++;
      } catch (error) {
        logger.error('Failed to queue live-session reminder', { error, sessionId: row.session_id, userId: row.user_id });
      }
    }

    for (const sessionId of sessionIds) {
      await DatabaseService.execute(
        `UPDATE live_sessions SET reminder_sent_at = ${db.now()} WHERE id = @sessionId`,
        { sessionId }
      );
    }

    logger.info('Live session reminder job completed', { sessionsReminded: sessionIds.length, notificationsQueued });
    return { sessionsReminded: sessionIds.length, notificationsQueued };
  }
}
