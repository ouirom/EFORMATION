import cron from 'node-cron';
import { ReminderService } from '../services/reminder.service';
import { CertificateService } from '../services/certificate.service';
import { TeamReportService } from '../services/team-report.service';
import { InactivitySuspensionService } from '../services/inactivity.service';
import { LiveSessionReminderService } from '../services/live-session-reminder.service';
import { logger } from '../utils/logger';
import { ComplianceService } from '../services/compliance.service';

/**
 * node-cron fires a new run on schedule regardless of whether the previous run of
 * that same job finished -- fine for these fast daily jobs, but the hourly one could
 * overlap itself under DB load and double-send reminders. Guards every job the same
 * way for consistency, even though only the hourly one is realistically at risk with
 * a single backend instance.
 */
function withLock(name: string, task: () => Promise<unknown>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      logger.warn(`${name} job skipped: previous run still in progress`);
      return;
    }
    running = true;
    try {
      await task();
    } catch (error) {
      logger.error(`${name} job failed`, { error });
    } finally {
      running = false;
    }
  };
}

/**
 * Registers the platform's scheduled background jobs. Called once at server startup.
 */
export function startScheduledJobs(): void {
  // Daily at 08:00 server time: assignment due-date reminders + manager escalation.
  cron.schedule('0 8 * * *', withLock('Assignment reminder', () => ReminderService.runDailyAssignmentReminders()));

  // Daily at 08:15 server time: certificate renewal reminders.
  cron.schedule('15 8 * * *', withLock('Certificate expiry reminder', () => CertificateService.runExpiryReminders()));

  // Daily at 08:30 server time: team-progress digest for n+1s who opted in.
  cron.schedule('30 8 * * *', withLock('Team report digest', () => TeamReportService.runDailyDigests()));

  // Daily at 08:45 server time: auto-suspend accounts inactive past their role's
  // configured threshold (admin-set per role via /settings/inactivity-policies).
  cron.schedule('45 8 * * *', withLock('Inactivity suspension', () => InactivitySuspensionService.runDailySuspensions()));

  // 03:30: purge activity-log rows older than each organization's retention (Conformité).
  cron.schedule('30 3 * * *', withLock('Activity log retention', () => ComplianceService.purgeAuditLogs()));

  // Hourly, on the hour: upcoming live-session reminders. Sessions are
  // time-sensitive (unlike the once-daily jobs above), so this needs a
  // tighter cadence to reliably land within its 2-hour lookahead window.
  cron.schedule('0 * * * *', withLock('Live session reminder', () => LiveSessionReminderService.runUpcomingReminders()));

  logger.info('Scheduled jobs registered (assignment reminders, certificate expiry, team reports, inactivity suspension, live session reminders)');
}
