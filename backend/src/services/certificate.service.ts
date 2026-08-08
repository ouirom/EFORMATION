import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';
import { db } from '../database/db-helpers';
import { config } from '../config';
import { logger } from '../utils/logger';

const RENEWAL_REMINDER_DAYS_BEFORE = 30;

interface ExpiringCertificateRow {
  id: number;
  tenant_id: number;
  user_id: number;
  display_name: string;
  course_id: number;
  course_title: string;
  expires_at: string;
}

export class CertificateService {
  /**
   * Daily job: notifies certificate holders whose certificate expires within
   * RENEWAL_REMINDER_DAYS_BEFORE days and hasn't already been reminded.
   */
  static async runExpiryReminders(): Promise<{ remindersSent: number }> {
    const expiringSoon = await DatabaseService.query<ExpiringCertificateRow>(
      `SELECT c.id, c.tenant_id, c.user_id, u.display_name, c.course_id, co.title as course_title, c.expires_at
       FROM certificates c
       JOIN users u ON u.id = c.user_id
       JOIN courses co ON co.id = c.course_id
       WHERE c.expires_at IS NOT NULL
         AND c.renewal_reminder_sent_at IS NULL
         AND c.expires_at BETWEEN ${db.now()} AND ${db.dateAdd('day', '@daysBefore', db.now())}`,
      { daysBefore: RENEWAL_REMINDER_DAYS_BEFORE }
    );

    let remindersSent = 0;
    for (const cert of expiringSoon) {
      const expiresLabel = new Date(cert.expires_at).toLocaleDateString('fr-FR');

      await NotificationService.send({
        tenantId: cert.tenant_id,
        userId: cert.user_id,
        channel: 'email',
        subject: `Votre certificat "${cert.course_title}" expire bientôt`,
        body: `Bonjour ${cert.display_name},\n\nVotre certificat pour la formation "${cert.course_title}" expire le ${expiresLabel}. Pensez à repasser la formation pour le renouveler.`,
        actionUrl: `${config.frontendUrl}/certificates`,
        metadata: { certificateId: cert.id, courseId: cert.course_id },
      });

      await DatabaseService.execute(
        `UPDATE certificates SET renewal_reminder_sent_at = ${db.now()} WHERE id = @id`,
        { id: cert.id }
      );
      remindersSent++;
    }

    logger.info('Certificate expiry reminder job completed', { remindersSent, scanned: expiringSoon.length });
    return { remindersSent };
  }
}
