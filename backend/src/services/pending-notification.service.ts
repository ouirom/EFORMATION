import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';
import { db, IS_PG } from '../database/db-helpers';
import { ForbiddenError, NotFoundError, BadRequestError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export type PendingNotificationEventType =
  | 'account_created'
  | 'password_changed'
  | 'account_suspended'
  | 'course_assigned'
  | 'quiz_result'
  | 'live_session_reminder'
  | 'certificate_expiring';

interface QueuePayload {
  tenantId: number;
  userId: number;
  eventType: PendingNotificationEventType;
  subject: string;
  body: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  /** The admin/user who caused this notification to be queued -- null for cron/system events. */
  triggeredBy?: number | null;
}

interface Reviewer {
  id: number;
  tenantId: number;
  role: string;
}

const REVIEWER_ROLES = ['admin', 'director', 'super_admin'];

/** Sent even when the organization disabled notifications (see NotificationService.send). */
const ESSENTIAL_EVENT_TYPES = new Set<string>(['account_created', 'password_changed', 'account_suspended']);

interface PendingNotificationRow {
  id: number;
  tenant_id: number;
  user_id: number;
  event_type: string;
  channel: string;
  subject: string | null;
  body: string;
  action_url: string | null;
  metadata: string | null;
  status: 'pending' | 'approved' | 'rejected';
  triggered_by: number | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_at: string;
}

export class PendingNotificationService {
  /**
   * Queues a notification instead of sending it immediately. Returns the new
   * row's id plus the recipient's email/subject so a Bucket-A caller can show
   * an immediate "confirm this email?" dialog without a second round trip.
   */
  static async queue(payload: QueuePayload): Promise<{ id: number; subject: string; recipientEmail: string }> {
    const recipients = await DatabaseService.query<{ email: string }>(
      'SELECT email FROM users WHERE id = @userId AND tenant_id = @tenantId',
      { userId: payload.userId, tenantId: payload.tenantId }
    );
    if (recipients.length === 0) {
      throw NotFoundError('User');
    }

    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO pending_notifications (tenant_id, user_id, event_type, subject, body, action_url, metadata, triggered_by)
           VALUES (@tenantId, @userId, @eventType, @subject, @body, @actionUrl, @metadata, @triggeredBy)
           RETURNING id`
        : `INSERT INTO pending_notifications (tenant_id, user_id, event_type, subject, body, action_url, metadata, triggered_by)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @userId, @eventType, @subject, @body, @actionUrl, @metadata, @triggeredBy)`,
      {
        tenantId: payload.tenantId,
        userId: payload.userId,
        eventType: payload.eventType,
        subject: payload.subject,
        body: payload.body,
        actionUrl: payload.actionUrl ?? null,
        metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
        triggeredBy: payload.triggeredBy ?? null,
      }
    );

    return { id: result[0].id, subject: payload.subject, recipientEmail: recipients[0].email };
  }

  private static async loadForReview(id: number, reviewer: Reviewer): Promise<PendingNotificationRow> {
    const rows = await DatabaseService.query<PendingNotificationRow>(
      'SELECT * FROM pending_notifications WHERE id = @id',
      { id }
    );
    if (rows.length === 0) {
      throw NotFoundError('Pending notification');
    }
    const row = rows[0];

    const isSuperAdmin = reviewer.role === 'super_admin';
    if (!isSuperAdmin && row.tenant_id !== reviewer.tenantId) {
      throw NotFoundError('Pending notification');
    }

    const isOwnAction = row.triggered_by === reviewer.id;
    const isReviewerRole = REVIEWER_ROLES.includes(reviewer.role);
    if (!isOwnAction && !isReviewerRole) {
      throw ForbiddenError('You are not allowed to review this notification');
    }

    if (row.status !== 'pending') {
      throw BadRequestError('This notification has already been reviewed');
    }

    return row;
  }

  static async approve(id: number, reviewer: Reviewer): Promise<void> {
    const row = await this.loadForReview(id, reviewer);

    try {
      await NotificationService.send({
        tenantId: row.tenant_id,
        userId: row.user_id,
        channel: row.channel as any,
        subject: row.subject || undefined,
        body: row.body,
        actionUrl: row.action_url || undefined,
        metadata: db.parseJsonColumn(row.metadata) || undefined,
        essential: ESSENTIAL_EVENT_TYPES.has(row.event_type),
      });
    } catch (error) {
      logger.error('Failed to send approved pending notification', { id, error });
    }

    await DatabaseService.execute(
      `UPDATE pending_notifications SET status = 'approved', reviewed_by = @reviewerId, reviewed_at = ${db.now()} WHERE id = @id`,
      { id, reviewerId: reviewer.id }
    );
  }

  static async reject(id: number, reviewer: Reviewer): Promise<void> {
    await this.loadForReview(id, reviewer);

    await DatabaseService.execute(
      `UPDATE pending_notifications SET status = 'rejected', reviewed_by = @reviewerId, reviewed_at = ${db.now()} WHERE id = @id`,
      { id, reviewerId: reviewer.id }
    );
  }

  static async list(
    tenantId: number,
    options: { status?: string; isSuperAdmin?: boolean } = {}
  ): Promise<any[]> {
    const status = options.status || 'pending';
    const rows = await DatabaseService.query<any>(
      options.isSuperAdmin
        ? `SELECT pn.*, u.display_name as recipient_name, u.email as recipient_email,
                  tb.display_name as triggered_by_name
           FROM pending_notifications pn
           JOIN users u ON u.id = pn.user_id
           LEFT JOIN users tb ON tb.id = pn.triggered_by
           WHERE pn.status = @status
           ORDER BY pn.created_at DESC`
        : `SELECT pn.*, u.display_name as recipient_name, u.email as recipient_email,
                  tb.display_name as triggered_by_name
           FROM pending_notifications pn
           JOIN users u ON u.id = pn.user_id
           LEFT JOIN users tb ON tb.id = pn.triggered_by
           WHERE pn.tenant_id = @tenantId AND pn.status = @status
           ORDER BY pn.created_at DESC`,
      { tenantId, status }
    );

    return rows.map((row: any) => ({
      id: row.id,
      eventType: row.event_type,
      channel: row.channel,
      subject: row.subject,
      recipientName: row.recipient_name,
      recipientEmail: row.recipient_email,
      triggeredByName: row.triggered_by_name,
      status: row.status,
      createdAt: row.created_at,
    }));
  }
}
