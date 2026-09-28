import { DatabaseService } from './database.service';
import { db, IS_PG } from '../database/db-helpers';
import { NotificationService } from './notification.service';
import { config } from '../config';
import { logger } from '../utils/logger';
import { teamAssignmentClauseForUserRow } from '../utils/teamAssignment';
import { TenantPlatformSettings, TenantSettingsService } from './tenant-settings.service';

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
  supervisor_id: number | null;
}

type ReminderType = 'upcoming' | 'urgent' | 'overdue' | 'escalation';

/**
 * How late a missed overdue reminder / escalation may still go out. The thresholds
 * are windows (a job that didn't run one day catches up the next), but a course
 * that has been late for months must not trigger a burst of emails the first time
 * this runs after a deploy or a settings change.
 */
const OVERDUE_CATCH_UP_DAYS = 7;

/**
 * Which learner reminder is due for a course `daysUntilDue` days from its
 * deadline, under the organization's thresholds (Administration > Organisation).
 * Each type is sent once per learner and assignment (assignment_reminders).
 */
export function learnerReminderType(
  daysUntilDue: number,
  settings: Pick<TenantPlatformSettings, 'assignmentReminderDays' | 'assignmentUrgentDays'>
): Exclude<ReminderType, 'escalation'> | null {
  if (daysUntilDue < 0) {
    return -daysUntilDue <= OVERDUE_CATCH_UP_DAYS ? 'overdue' : null;
  }
  if (settings.assignmentUrgentDays > 0 && daysUntilDue <= settings.assignmentUrgentDays) return 'urgent';
  if (settings.assignmentReminderDays > 0 && daysUntilDue <= settings.assignmentReminderDays) return 'upcoming';
  return null;
}

/** Whether the manager should be alerted about a course `daysUntilDue` days from its deadline. */
export function isEscalationDue(daysUntilDue: number, escalationDaysOverdue: number): boolean {
  const daysLate = -daysUntilDue;
  return escalationDaysOverdue > 0 && daysLate >= escalationDaysOverdue && daysLate <= escalationDaysOverdue + OVERDUE_CATCH_UP_DAYS;
}

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
              u.id as user_id, u.display_name, u.service_id, u.direction_id, u.supervisor_id
       FROM course_assignments ca
       JOIN courses c ON c.id = ca.course_id
       JOIN users u ON (
         (ca.assignment_type = 'user' AND u.id = ca.target_id)
         OR (ca.assignment_type = 'enterprise' AND u.enterprise_id = ca.target_id)
         OR (ca.assignment_type = 'subsidiary' AND u.subsidiary_id = ca.target_id)
         OR (ca.assignment_type = 'direction' AND u.direction_id = ca.target_id)
         OR (ca.assignment_type = 'service' AND u.service_id = ca.target_id)
         OR (ca.assignment_type = 'role' AND u.role = ca.target_role)
         OR ${teamAssignmentClauseForUserRow('ca', 'u')}
       )
       LEFT JOIN enrollments e ON e.course_id = ca.course_id AND e.user_id = u.id
       WHERE ca.is_mandatory = ${db.bool(true)}
         AND ca.due_date IS NOT NULL
         AND u.is_active = ${db.bool(true)} AND u.deleted_at IS NULL
         AND (e.completed_at IS NULL AND (e.progress_percent IS NULL OR e.progress_percent < 100))`
    );

    const today = new Date();
    let remindersSent = 0;
    let escalationsSent = 0;

    for (const row of pending) {
      // Thresholds of the learner's organization (cached per tenant). An organization
      // with notifications off is skipped rather than marked as reminded, so the
      // reminders still go out if it turns them back on in time.
      const settings = await TenantSettingsService.get(row.tenant_id);
      if (!settings.enableNotifications) continue;

      const daysUntilDue = daysBetween(today, new Date(row.due_date));
      const reminderType = learnerReminderType(daysUntilDue, settings);

      if (reminderType) {
        const sent = await this.sendIfNotAlreadySent(row, reminderType, daysUntilDue);
        if (sent) remindersSent++;
      }

      if (isEscalationDue(daysUntilDue, settings.escalationDaysOverdue)) {
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

  private static async sendIfNotAlreadySent(row: PendingAssignmentRow, type: ReminderType, daysUntilDue: number): Promise<boolean> {
    if (await this.alreadySent(row.assignment_id, row.user_id, type)) return false;

    const dueDateLabel = new Date(row.due_date).toLocaleDateString('fr-FR');
    // Thresholds are per organization now, so say how long is actually left.
    const whenLabel =
      daysUntilDue <= 0 ? "aujourd'hui" : daysUntilDue === 1 ? 'demain' : `dans ${daysUntilDue} jours`;
    const messages: Record<Exclude<ReminderType, 'escalation'>, { subject: string; body: string }> = {
      upcoming: {
        subject: `Formation "${row.course_title}" à terminer avant le ${dueDateLabel}`,
        body: `Bonjour ${row.display_name},\n\nLa formation obligatoire "${row.course_title}" doit être terminée avant le ${dueDateLabel}. Il vous reste ${daysUntilDue} jour${daysUntilDue > 1 ? 's' : ''}.`,
      },
      urgent: {
        subject: `Rappel : "${row.course_title}" à terminer ${whenLabel}`,
        body: `Bonjour ${row.display_name},\n\nLa formation obligatoire "${row.course_title}" doit être terminée avant le ${dueDateLabel}, soit ${whenLabel}. Merci de la finaliser rapidement.`,
      },
      overdue: {
        subject: `Formation "${row.course_title}" en retard`,
        body: `Bonjour ${row.display_name},\n\nLa formation obligatoire "${row.course_title}" avait une échéance au ${dueDateLabel} et n'est toujours pas terminée. Merci de la terminer au plus vite.`,
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

    // Prefer the learner's explicitly assigned direct supervisor; fall back to
    // "any supervisor/manager in the same service, else a director in the same
    // direction" for learners who don't have one set.
    let manager: { id: number; display_name: string } | null = null;

    if (row.supervisor_id) {
      const directSupervisor = await DatabaseService.query<{ id: number; display_name: string }>(
        `SELECT id, display_name FROM users WHERE id = @supervisorId AND is_active = ${db.bool(true)} AND deleted_at IS NULL`,
        { supervisorId: row.supervisor_id }
      );
      manager = directSupervisor[0] || null;
    }

    if (!manager) {
      const orderBy = `ORDER BY CASE WHEN service_id = @serviceId THEN 0 ELSE 1 END,
                  CASE role WHEN 'supervisor' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END`;
      const whereClause = `WHERE tenant_id = @tenantId AND is_active = ${db.bool(true)} AND deleted_at IS NULL
           AND (
             (service_id = @serviceId AND role IN ('supervisor', 'manager'))
             OR (direction_id = @directionId AND role = 'director')
           )`;
      const managers = await DatabaseService.query<{ id: number; display_name: string }>(
        IS_PG
          ? `SELECT id, display_name FROM users ${whereClause} ${orderBy} LIMIT 1`
          : `SELECT TOP 1 id, display_name FROM users ${whereClause} ${orderBy}`,
        { tenantId: row.tenant_id, serviceId: row.service_id, directionId: row.direction_id }
      );
      manager = managers[0] || null;
    }

    if (!manager) return false;

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
