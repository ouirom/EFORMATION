import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';
import { config } from '../config';
import { logger } from '../utils/logger';

interface PendingAssignmentRow {
  assignment_id: number;
  tenant_id: number;
  course_id: number;
  course_title: string;
  due_date: string;
  user_id: number;
  display_name: string;
  service_id: number | null;
  direction_id: number | null;
}

type ReminderType = 'upcoming' | 'urgent' | 'overdue' | 'escalation';

// Days-until-due that trigger each learner-facing reminder. Overdue/escalation fire once,
// one day after the deadline passes.
const UPCOMING_DAYS_BEFORE = 7;
const URGENT_DAYS_BEFORE = 1;
const OVERDUE_DAYS_AFTER = 1;

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / msPerDay);
}

export class ReminderService {
  /**
   * Daily job: reminds learners of mandatory courses approaching/past their due date,
   * and escalates to their manager once a course is overdue.
   */
  static async runDailyAssignmentReminders(): Promise<{ remindersSent: number; escalationsSent: number }> {
    const pending = await DatabaseService.query<PendingAssignmentRow>(
      `SELECT ca.id as assignment_id, ca.tenant_id, ca.course_id, c.title as course_title, ca.due_date,
              u.id as user_id, u.display_name, u.service_id, u.direction_id
       FROM course_assignments ca
       JOIN courses c ON c.id = ca.course_id
       JOIN users u ON (
         (ca.assignment_type = 'user' AND u.id = ca.target_id)
         OR (ca.assignment_type = 'enterprise' AND u.enterprise_id = ca.target_id)
         OR (ca.assignment_type = 'direction' AND u.direction_id = ca.target_id)
         OR (ca.assignment_type = 'service' AND u.service_id = ca.target_id)
         OR (ca.assignment_type = 'role' AND u.role = ca.target_role)
       )
       LEFT JOIN enrollments e ON e.course_id = ca.course_id AND e.user_id = u.id
       WHERE ca.is_mandatory = 1
         AND ca.due_date IS NOT NULL
         AND u.is_active = 1 AND u.deleted_at IS NULL
         AND (e.completed_at IS NULL AND (e.progress_percent IS NULL OR e.progress_percent < 100))`
    );

    const today = new Date();
    let remindersSent = 0;
    let escalationsSent = 0;

    for (const row of pending) {
      const daysUntilDue = daysBetween(today, new Date(row.due_date));
      let reminderType: ReminderType | null = null;

      if (daysUntilDue === UPCOMING_DAYS_BEFORE) reminderType = 'upcoming';
      else if (daysUntilDue === URGENT_DAYS_BEFORE) reminderType = 'urgent';
      else if (daysUntilDue === -OVERDUE_DAYS_AFTER) reminderType = 'overdue';

      if (reminderType) {
        const sent = await this.sendIfNotAlreadySent(row, reminderType);
        if (sent) remindersSent++;
      }

      // Escalate to the manager the same day the "overdue" reminder fires.
      if (daysUntilDue === -OVERDUE_DAYS_AFTER) {
        const escalated = await this.escalateToManager(row);
        if (escalated) escalationsSent++;
      }
    }

    logger.info('Assignment reminder job completed', { remindersSent, escalationsSent, scanned: pending.length });
    return { remindersSent, escalationsSent };
  }

  private static async alreadySent(assignmentId: number, userId: number, type: ReminderType): Promise<boolean> {
    const existing = await DatabaseService.query<{ id: number }>(
      `SELECT id FROM assignment_reminders WHERE course_assignment_id = @assignmentId AND user_id = @userId AND reminder_type = @type`,
      { assignmentId, userId, type }
    );
    return existing.length > 0;
  }

  private static async recordSent(tenantId: number, assignmentId: number, userId: number, type: ReminderType): Promise<void> {
    await DatabaseService.execute(
      `INSERT INTO assignment_reminders (tenant_id, course_assignment_id, user_id, reminder_type)
       VALUES (@tenantId, @assignmentId, @userId, @type)`,
      { tenantId, assignmentId, userId, type }
    );
  }

  private static async sendIfNotAlreadySent(row: PendingAssignmentRow, type: ReminderType): Promise<boolean> {
    if (await this.alreadySent(row.assignment_id, row.user_id, type)) return false;

    const dueDateLabel = new Date(row.due_date).toLocaleDateString('fr-FR');
    const messages: Record<Exclude<ReminderType, 'escalation'>, { subject: string; body: string }> = {
      upcoming: {
        subject: `Formation "${row.course_title}" à terminer avant le ${dueDateLabel}`,
        body: `Bonjour ${row.display_name},\n\nLa formation obligatoire "${row.course_title}" doit être terminée avant le ${dueDateLabel}. Il vous reste ${UPCOMING_DAYS_BEFORE} jours.`,
      },
      urgent: {
        subject: `Rappel : "${row.course_title}" à terminer demain`,
        body: `Bonjour ${row.display_name},\n\nLa formation obligatoire "${row.course_title}" doit être terminée avant le ${dueDateLabel}, soit demain. Merci de la finaliser rapidement.`,
      },
      overdue: {
        subject: `Formation "${row.course_title}" en retard`,
        body: `Bonjour ${row.display_name},\n\nLa formation obligatoire "${row.course_title}" avait une échéance au ${dueDateLabel} et n'est toujours pas terminée. Votre responsable a été informé.`,
      },
    };

    const message = messages[type as Exclude<ReminderType, 'escalation'>];

    await NotificationService.send({
      tenantId: row.tenant_id,
      userId: row.user_id,
      channel: 'email',
      subject: message.subject,
      body: message.body,
      actionUrl: `${config.frontendUrl}/courses/${row.course_id}`,
      metadata: { assignmentId: row.assignment_id, courseId: row.course_id, reminderType: type },
    });

    await this.recordSent(row.tenant_id, row.assignment_id, row.user_id, type);
    return true;
  }

  private static async escalateToManager(row: PendingAssignmentRow): Promise<boolean> {
    if (await this.alreadySent(row.assignment_id, row.user_id, 'escalation')) return false;

    const managers = await DatabaseService.query<{ id: number; display_name: string }>(
      `SELECT TOP 1 id, display_name FROM users
       WHERE tenant_id = @tenantId AND is_active = 1 AND deleted_at IS NULL
         AND (
           (service_id = @serviceId AND role IN ('supervisor', 'manager'))
           OR (direction_id = @directionId AND role = 'director')
         )
       ORDER BY CASE WHEN service_id = @serviceId THEN 0 ELSE 1 END,
                CASE role WHEN 'supervisor' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END`,
      { tenantId: row.tenant_id, serviceId: row.service_id, directionId: row.direction_id }
    );

    if (managers.length === 0) return false;

    const manager = managers[0];
    const dueDateLabel = new Date(row.due_date).toLocaleDateString('fr-FR');

    await NotificationService.send({
      tenantId: row.tenant_id,
      userId: manager.id,
      channel: 'email',
      subject: `Formation obligatoire en retard : ${row.display_name}`,
      body: `Bonjour ${manager.display_name},\n\n${row.display_name} n'a pas terminé la formation obligatoire "${row.course_title}" (échéance : ${dueDateLabel}).`,
      actionUrl: `${config.frontendUrl}/admin/assignments`,
      metadata: { assignmentId: row.assignment_id, courseId: row.course_id, learnerId: row.user_id },
    });

    await this.recordSent(row.tenant_id, row.assignment_id, row.user_id, 'escalation');
    return true;
  }
}
