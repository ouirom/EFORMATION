import cron from 'node-cron';
import { ReminderService } from '../services/reminder.service';
import { CertificateService } from '../services/certificate.service';
import { TeamReportService } from '../services/team-report.service';
import { logger } from '../utils/logger';

/**
 * Registers the platform's scheduled background jobs. Called once at server startup.
 */
export function startScheduledJobs(): void {
  // Daily at 08:00 server time: assignment due-date reminders + manager escalation.
  cron.schedule('0 8 * * *', async () => {
    try {
      await ReminderService.runDailyAssignmentReminders();
    } catch (error) {
      logger.error('Assignment reminder job failed', { error });
    }
  });

  // Daily at 08:15 server time: certificate renewal reminders.
  cron.schedule('15 8 * * *', async () => {
    try {
      await CertificateService.runExpiryReminders();
    } catch (error) {
      logger.error('Certificate expiry reminder job failed', { error });
    }
  });

  // Daily at 08:30 server time: team-progress digest for n+1s who opted in.
  cron.schedule('30 8 * * *', async () => {
    try {
      await TeamReportService.runDailyDigests();
    } catch (error) {
      logger.error('Team report digest job failed', { error });
    }
  });

  logger.info('Scheduled jobs registered (assignment reminders, certificate expiry, team reports)');
}
