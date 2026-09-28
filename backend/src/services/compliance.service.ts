import { DatabaseService } from './database.service';
import { AuditService } from './audit.service';
import { TenantSettingsService } from './tenant-settings.service';
import { db } from '../database/db-helpers';
import { logger } from '../utils/logger';

/**
 * GDPR / compliance operations (Administration > Organisation > Conformité):
 * activity log retention, anonymization of deleted accounts, and the export of
 * everything the platform stores about one person.
 */
export class ComplianceService {
  /**
   * Daily job: deletes activity-log rows older than each organization's retention
   * (0 = keep forever, the behaviour so far). The number of days comes from a
   * validated integer setting and is inlined (pg can't type a parameter that is
   * only multiplied by an interval).
   */
  static async purgeAuditLogs(): Promise<{ deleted: number }> {
    const tenants = await DatabaseService.query<{ tenant_id: number; days: number }>(
      'SELECT tenant_id, audit_log_retention_days as days FROM tenant_settings WHERE audit_log_retention_days > 0'
    );
    let deleted = 0;
    for (const { tenant_id: tenantId, days } of tenants) {
      const retention = Math.trunc(Number(days));
      if (!(retention > 0)) continue;
      const result = await DatabaseService.execute(
        `DELETE FROM audit_logs WHERE tenant_id = @tenantId AND created_at < ${db.dateAdd('day', String(-retention), db.now())}`,
        { tenantId }
      );
      deleted += result.rowsAffected || 0;
      if (result.rowsAffected) {
        logger.info('Activity log purged', { tenantId, retentionDays: retention, deleted: result.rowsAffected });
      }
    }
    return { deleted };
  }

  /**
   * Erases the personal data of an account while keeping its learning records
   * (enrollments, results, certificates stay attached to an anonymous user, so
   * statistics remain right). The email and username are replaced by unique
   * placeholders, which also frees the real address for a future account.
   * Messages the person wrote in the chat are emptied; notifications addressed
   * to them (which contain their name) are deleted.
   */
  static async anonymizeUser(tenantId: number, userId: number, actorId: number): Promise<void> {
    await DatabaseService.execute(
      `UPDATE users SET
         email = @email, username = @username, display_name = @displayName,
         avatar_url = NULL, phone = NULL, job_title = 'Défaut',
         password_hash = 'ANONYMIZED', token_version = token_version + 1,
         anonymized_at = ${db.now()}
       WHERE id = @userId AND tenant_id = @tenantId AND anonymized_at IS NULL`,
      {
        userId,
        tenantId,
        email: `deleted-${userId}@anonymized.invalid`,
        username: `deleted-${userId}`,
        displayName: 'Utilisateur supprimé',
      }
    );
    await DatabaseService.execute('DELETE FROM sso_identities WHERE user_id = @userId AND tenant_id = @tenantId', { userId, tenantId });
    await DatabaseService.execute('DELETE FROM notifications WHERE user_id = @userId AND tenant_id = @tenantId', { userId, tenantId });
    await DatabaseService.execute(
      `UPDATE chat_messages SET body = '', deleted_at = COALESCE(deleted_at, ${db.now()})
       WHERE sender_id = @userId AND tenant_id = @tenantId`,
      { userId, tenantId }
    );
    await AuditService.log(tenantId, actorId, 'USER_ANONYMIZED', 'users', userId);
  }

  /** Whether deleting an account of this organization must also anonymize it. */
  static async shouldAnonymizeOnDelete(tenantId: number): Promise<boolean> {
    return (await TenantSettingsService.get(tenantId)).anonymizeDeletedUsers;
  }

  /**
   * Everything stored about one person, as one JSON document (right of access /
   * portability). Secrets (password hash, tokens) are never included.
   */
  static async exportUserData(tenantId: number, userId: number): Promise<Record<string, unknown>> {
    const q = (sql: string) => DatabaseService.query<any>(sql, { tenantId, userId });
    const [profile] = await q(
      `SELECT u.id, u.email, u.username, u.display_name, u.phone, u.job_title, u.role, u.status, u.avatar_url,
              u.created_at, u.updated_at, u.last_login_at, u.password_changed_at,
              e.name as enterprise, sub.name as subsidiary, d.name as direction, s.name as service,
              sup.display_name as supervisor
       FROM users u
       LEFT JOIN enterprises e ON e.id = u.enterprise_id
       LEFT JOIN subsidiaries sub ON sub.id = u.subsidiary_id
       LEFT JOIN directions d ON d.id = u.direction_id
       LEFT JOIN services s ON s.id = u.service_id
       LEFT JOIN users sup ON sup.id = u.supervisor_id
       WHERE u.id = @userId AND u.tenant_id = @tenantId`
    );
    if (!profile) return {};

    const [enrollments, lessonProgress, quizAttempts, certificates, badges, notificationPreferences, notifications, identityProviders, chatMessages, activity] =
      await Promise.all([
        q(`SELECT e.course_id, c.title as course, e.enrolled_at, e.progress_percent, e.completed_at
           FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = @userId AND e.tenant_id = @tenantId`),
        q(`SELECT lp.lesson_id, l.title as lesson, lp.status, lp.progress_percent, lp.started_at, lp.completed_at, lp.time_spent_seconds
           FROM lesson_progress lp LEFT JOIN lessons l ON l.id = lp.lesson_id WHERE lp.user_id = @userId AND lp.tenant_id = @tenantId`),
        q(`SELECT qa.quiz_id, qz.title as quiz, qa.score, qa.passed, qa.started_at, qa.completed_at
           FROM quiz_attempts qa LEFT JOIN quizzes qz ON qz.id = qa.quiz_id WHERE qa.user_id = @userId AND qa.tenant_id = @tenantId`),
        q(`SELECT ce.serial, c.title as course, ce.issued_at, ce.expires_at, ce.revoked_at
           FROM certificates ce LEFT JOIN courses c ON c.id = ce.course_id WHERE ce.user_id = @userId AND ce.tenant_id = @tenantId`),
        q(`SELECT b.name as badge, ub.awarded_at, ub.score
           FROM user_badges ub LEFT JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = @userId AND ub.tenant_id = @tenantId`),
        q(`SELECT email, sms, whatsapp, push_web, push_mobile, updated_at FROM notification_preferences WHERE user_id = @userId AND tenant_id = @tenantId`),
        q(`SELECT channel, subject, body, created_at, read_at FROM notifications WHERE user_id = @userId AND tenant_id = @tenantId ORDER BY created_at DESC`),
        q(`SELECT provider FROM sso_identities WHERE user_id = @userId AND tenant_id = @tenantId`),
        q(`SELECT conversation_id, body, created_at FROM chat_messages WHERE sender_id = @userId AND tenant_id = @tenantId AND deleted_at IS NULL ORDER BY created_at`),
        q(`SELECT action, entity, created_at FROM audit_logs WHERE user_id = @userId AND tenant_id = @tenantId ORDER BY created_at DESC`),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      profile,
      learning: { enrollments, lessonProgress, quizAttempts, certificates, badges },
      notificationPreferences: notificationPreferences[0] || null,
      notifications,
      identityProviders: identityProviders.map((p: any) => p.provider),
      chatMessages,
      activity,
    };
  }
}
