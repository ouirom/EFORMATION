import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';
import { TeamService } from './team.service';
import { config } from '../config';
import { logger } from '../utils/logger';
import { db } from '../database/db-helpers';

interface SubscriptionRow {
  id: number;
  tenant_id: number;
  user_id: number;
  frequency: 'daily' | 'weekly';
  weekday: number | null;
  channel_email: boolean;
  channel_in_app: boolean;
  role: string;
  direction_id: number | null;
  service_id: number | null;
  display_name: string;
}

export class TeamReportService {
  /**
   * Daily job: sends each subscribed n+1 (manager/director/supervisor/admin) a
   * digest of their team's training progress, on whatever cadence they configured
   * (self-service, see PUT /analytics/my-team/report-settings). Reuses the exact
   * same scoping + activity query as GET /analytics/my-team via TeamService, so
   * the report and the on-demand dashboard never disagree.
   */
  static async runDailyDigests(): Promise<{ sent: number }> {
    const weekday = new Date().getUTCDay(); // 0=Sunday..6=Saturday, matches team_report_subscriptions.weekday

    const subs = await DatabaseService.query<SubscriptionRow>(
      `SELECT trs.id, trs.tenant_id, trs.user_id, trs.frequency, trs.weekday,
              trs.channel_email, trs.channel_in_app,
              u.role, u.direction_id, u.service_id, u.display_name
       FROM team_report_subscriptions trs
       JOIN users u ON u.id = trs.user_id AND u.tenant_id = trs.tenant_id
       WHERE trs.is_enabled = ${db.bool(true)} AND u.is_active = ${db.bool(true)} AND u.deleted_at IS NULL
         AND (trs.frequency = 'daily' OR (trs.frequency = 'weekly' AND trs.weekday = @weekday))`,
      { weekday }
    );

    let sent = 0;
    for (const sub of subs) {
      const team = await TeamService.getTeamActivity({
        tenantId: sub.tenant_id,
        id: sub.user_id,
        role: sub.role,
        directionId: sub.direction_id ?? undefined,
        serviceId: sub.service_id ?? undefined,
      });

      // Nothing to report if the n+1 currently has no one attached to them.
      if (team.length === 0) continue;

      const overdueTotal = team.reduce((total, m) => total + m.overdueCount, 0);
      const lines = team.map((m) => {
        const overdueNote = m.overdueCount > 0 ? `, ${m.overdueCount} en retard` : '';
        return `- ${m.displayName} : ${m.completedCount}/${m.enrolledCount} formation(s) terminée(s), progression moyenne ${m.avgProgress}%${overdueNote}`;
      });

      const subject = overdueTotal > 0
        ? `Rapport d'équipe — ${overdueTotal} formation(s) obligatoire(s) en retard`
        : `Rapport d'équipe — ${team.length} collaborateur(s), à jour`;
      const body = `Bonjour ${sub.display_name},\n\nVoici le résumé de la progression de votre équipe (${team.length} personne(s)) :\n\n${lines.join('\n')}\n\nDétail : ${config.frontendUrl}/my-team`;

      if (sub.channel_email) {
        await NotificationService.send({
          tenantId: sub.tenant_id,
          userId: sub.user_id,
          channel: 'email',
          subject,
          body,
          actionUrl: `${config.frontendUrl}/my-team`,
        });
      }
      if (sub.channel_in_app) {
        await NotificationService.send({
          tenantId: sub.tenant_id,
          userId: sub.user_id,
          channel: 'in_app',
          subject,
          body,
          actionUrl: `${config.frontendUrl}/my-team`,
        });
      }

      await DatabaseService.execute(
        `UPDATE team_report_subscriptions SET last_sent_at = ${db.now()} WHERE id = @id`,
        { id: sub.id }
      );
      sent++;
    }

    logger.info('Team report digest job completed', { sent, scanned: subs.length });
    return { sent };
  }
}
