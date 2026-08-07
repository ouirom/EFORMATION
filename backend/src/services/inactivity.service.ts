import { DatabaseService } from './database.service';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import { logger } from '../utils/logger';

export interface InactivityPolicy {
  role: string;
  maxInactiveDays: number;
}

// admin/super_admin are deliberately never eligible — auto-suspending every
// admin would lock a tenant out of its own platform with no one left to undo it.
export const INACTIVITY_POLICY_ROLES = ['director', 'manager', 'supervisor', 'agent', 'externe', 'stagiaire'];

export class InactivityPolicyService {
  static async getPolicies(tenantId: number): Promise<InactivityPolicy[]> {
    const rows = await DatabaseService.query<{ role: string; max_inactive_days: number }>(
      'SELECT role, max_inactive_days FROM inactivity_policies WHERE tenant_id = @tenantId ORDER BY role',
      { tenantId }
    );
    return rows.map((r) => ({ role: r.role, maxInactiveDays: r.max_inactive_days }));
  }

  /** Passing maxInactiveDays = null removes the policy (disables auto-suspend for that role). */
  static async setPolicy(
    tenantId: number,
    role: string,
    maxInactiveDays: number | null,
    updatedBy: number
  ): Promise<void> {
    if (maxInactiveDays === null) {
      await DatabaseService.execute(
        'DELETE FROM inactivity_policies WHERE tenant_id = @tenantId AND role = @role',
        { tenantId, role }
      );
      return;
    }

    const existing = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM inactivity_policies WHERE tenant_id = @tenantId AND role = @role',
      { tenantId, role }
    );

    if (existing.length === 0) {
      await DatabaseService.execute(
        `INSERT INTO inactivity_policies (tenant_id, role, max_inactive_days, updated_by)
         VALUES (@tenantId, @role, @maxInactiveDays, @updatedBy)`,
        { tenantId, role, maxInactiveDays, updatedBy }
      );
    } else {
      await DatabaseService.execute(
        `UPDATE inactivity_policies SET max_inactive_days = @maxInactiveDays, updated_by = @updatedBy, updated_at = SYSUTCDATETIME()
         WHERE tenant_id = @tenantId AND role = @role`,
        { tenantId, role, maxInactiveDays, updatedBy }
      );
    }
  }
}

export class InactivitySuspensionService {
  /**
   * Daily job: for every tenant+role with a configured policy, suspends active
   * users of that role who haven't logged in for longer than the policy allows
   * (falling back to their account creation date if they've never logged in).
   */
  static async runDailySuspensions(): Promise<{ suspended: number }> {
    const policies = await DatabaseService.query<{ tenant_id: number; role: string; max_inactive_days: number }>(
      'SELECT tenant_id, role, max_inactive_days FROM inactivity_policies'
    );

    let suspended = 0;

    for (const policy of policies) {
      const staleUsers = await DatabaseService.query<{ id: number; tenant_id: number; display_name: string; email: string }>(
        `SELECT id, tenant_id, display_name, email FROM users
         WHERE tenant_id = @tenantId AND role = @role AND status = 'active' AND deleted_at IS NULL
           AND ISNULL(last_login_at, created_at) < DATEADD(day, -@maxDays, SYSUTCDATETIME())`,
        { tenantId: policy.tenant_id, role: policy.role, maxDays: policy.max_inactive_days }
      );

      for (const user of staleUsers) {
        await DatabaseService.execute(
          `UPDATE users SET status = 'suspended', is_active = 0, updated_at = SYSUTCDATETIME() WHERE id = @id`,
          { id: user.id }
        );

        await AuditService.log(user.tenant_id, null, 'USER_AUTO_SUSPENDED', 'users', user.id, {
          role: policy.role,
          maxInactiveDays: policy.max_inactive_days,
        });

        await NotificationService.send({
          tenantId: user.tenant_id,
          userId: user.id,
          channel: 'email',
          subject: 'Votre compte E-Formation a été suspendu pour inactivité',
          body: `Bonjour ${user.display_name},\n\nVotre compte a été suspendu après ${policy.max_inactive_days} jours d'inactivité. Contactez votre administrateur pour le réactiver.`,
        }).catch((error) => {
          logger.error('Failed to send inactivity-suspension notice', { error, userId: user.id });
        });

        suspended++;
      }
    }

    return { suspended };
  }
}
