import { DatabaseService } from './database.service';
import { logger } from '../utils/logger';

export class AuditService {
  /**
   * Record an audit trail entry. Never throws — a logging failure must not break
   * the action being logged. Timestamp is always the server clock (audit_logs.created_at
   * defaults to SYSUTCDATETIME()), never client-supplied, so the trail can't be backdated.
   */
  static async log(
    tenantId: number,
    userId: number | null,
    action: string,
    entity: string,
    entityId: number | null,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await DatabaseService.execute(
        `INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, metadata)
         VALUES (@tenantId, @userId, @action, @entity, @entityId, @metadata)`,
        {
          tenantId,
          userId,
          action,
          entity,
          entityId,
          metadata: metadata ? JSON.stringify(metadata) : null,
        }
      );
    } catch (error) {
      logger.error('Failed to write audit log:', error);
    }
  }
}
