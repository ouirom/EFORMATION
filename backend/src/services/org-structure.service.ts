import { DatabaseService } from './database.service';
import { ApiError, BadRequestError, NotFoundError } from '../middleware/error.middleware';

/**
 * The organization structure of a tenant:
 *   entreprise -> filiale (optional) -> direction -> service
 * A direction belongs to a subsidiary of its enterprise, or directly to the
 * enterprise (subsidiary_id NULL). Users carry the ids of every level
 * (enterprise_id, subsidiary_id, direction_id, service_id) so targeting any level
 * stays a plain column match; this service keeps them consistent.
 */
export type OrgLevel = 'enterprise' | 'subsidiary' | 'direction' | 'service';

export interface UserPlacement {
  enterpriseId: number | null;
  subsidiaryId: number | null;
  directionId: number | null;
  serviceId: number | null;
}

const TABLE: Record<OrgLevel, string> = {
  enterprise: 'enterprises',
  subsidiary: 'subsidiaries',
  direction: 'directions',
  service: 'services',
};

const LABEL: Record<OrgLevel, string> = {
  enterprise: 'Enterprise',
  subsidiary: 'Subsidiary',
  direction: 'Direction',
  service: 'Service',
};

const toId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export class OrgStructureService {
  /** The unit's row if it exists in this tenant, else 404 (never another tenant's unit). */
  static async get(level: OrgLevel, tenantId: number, id: unknown): Promise<any> {
    const unitId = toId(id);
    const rows = unitId
      ? await DatabaseService.query<any>(`SELECT * FROM ${TABLE[level]} WHERE id = @id AND tenant_id = @tenantId`, {
          id: unitId,
          tenantId,
        })
      : [];
    if (rows.length === 0) throw NotFoundError(LABEL[level]);
    return rows[0];
  }

  /**
   * A consistent placement from whatever the caller filled in, derived bottom-up:
   * the service decides the direction, the direction decides the subsidiary and
   * the enterprise. An explicit value that contradicts its child is refused
   * (400 ORG_PLACEMENT_MISMATCH) instead of silently storing an impossible
   * combination -- which the user form and the import used to allow.
   */
  static async resolvePlacement(tenantId: number, input: Partial<Record<keyof UserPlacement, unknown>>): Promise<UserPlacement> {
    const wanted = {
      enterpriseId: toId(input.enterpriseId),
      subsidiaryId: toId(input.subsidiaryId),
      directionId: toId(input.directionId),
      serviceId: toId(input.serviceId),
    };
    const placement: UserPlacement = { ...wanted };
    const mismatch = (what: string) => {
      throw BadRequestError(`The selected ${what} does not belong to the selected parent`, 'ORG_PLACEMENT_MISMATCH');
    };

    if (wanted.serviceId) {
      const service = await this.get('service', tenantId, wanted.serviceId);
      if (wanted.directionId && Number(service.direction_id) !== wanted.directionId) mismatch('service');
      placement.directionId = Number(service.direction_id);
    }
    if (placement.directionId) {
      const direction = await this.get('direction', tenantId, placement.directionId);
      const subsidiaryId = direction.subsidiary_id ? Number(direction.subsidiary_id) : null;
      if (wanted.subsidiaryId && wanted.subsidiaryId !== subsidiaryId) mismatch('direction');
      if (wanted.enterpriseId && wanted.enterpriseId !== Number(direction.enterprise_id)) mismatch('direction');
      placement.subsidiaryId = subsidiaryId;
      placement.enterpriseId = Number(direction.enterprise_id);
    } else if (placement.subsidiaryId) {
      const subsidiary = await this.get('subsidiary', tenantId, placement.subsidiaryId);
      if (wanted.enterpriseId && wanted.enterpriseId !== Number(subsidiary.enterprise_id)) mismatch('subsidiary');
      placement.enterpriseId = Number(subsidiary.enterprise_id);
    } else if (placement.enterpriseId) {
      await this.get('enterprise', tenantId, placement.enterpriseId);
    }
    return placement;
  }

  /**
   * 409 ORG_UNIT_IN_USE when the unit still has child units, members, or
   * assignments/teams targeting it. Deleting used to either fail on a foreign
   * key (500) or leave assignments pointing at nothing.
   */
  static async assertDeletable(level: OrgLevel, tenantId: number, id: number): Promise<void> {
    const checks: { label: string; sql: string }[] = [];
    if (level === 'enterprise') {
      checks.push({ label: 'subsidiaries', sql: 'SELECT COUNT(*) as n FROM subsidiaries WHERE enterprise_id = @id AND tenant_id = @tenantId' });
      checks.push({ label: 'directions', sql: 'SELECT COUNT(*) as n FROM directions WHERE enterprise_id = @id AND tenant_id = @tenantId' });
    }
    if (level === 'subsidiary') {
      checks.push({ label: 'directions', sql: 'SELECT COUNT(*) as n FROM directions WHERE subsidiary_id = @id AND tenant_id = @tenantId' });
    }
    if (level === 'direction') {
      checks.push({ label: 'services', sql: 'SELECT COUNT(*) as n FROM services WHERE direction_id = @id AND tenant_id = @tenantId' });
    }
    const userColumn = `${level}_id`;
    checks.push({
      label: 'users',
      sql: `SELECT COUNT(*) as n FROM users WHERE ${userColumn} = @id AND tenant_id = @tenantId AND deleted_at IS NULL`,
    });
    checks.push({
      label: 'assignments',
      sql: `SELECT COUNT(*) as n FROM course_assignments WHERE assignment_type = '${level}' AND target_id = @id AND tenant_id = @tenantId`,
    });
    checks.push({
      label: 'teams',
      sql: `SELECT COUNT(*) as n FROM team_members tm JOIN teams t ON t.id = tm.team_id
            WHERE tm.member_type = '${level}' AND tm.target_id = @id AND t.tenant_id = @tenantId`,
    });

    const inUse: Record<string, number> = {};
    for (const check of checks) {
      const rows = await DatabaseService.query<{ n: number | string }>(check.sql, { id, tenantId });
      const n = Number(rows[0]?.n) || 0;
      if (n > 0) inUse[check.label] = n;
    }
    if (Object.keys(inUse).length > 0) {
      throw new ApiError(
        `This ${level} is still in use (${Object.entries(inUse).map(([k, n]) => `${n} ${k}`).join(', ')})`,
        409,
        'ORG_UNIT_IN_USE',
        inUse
      );
    }
  }

  /**
   * After a direction moved to another subsidiary (or out of one), its users
   * follow: their subsidiary_id/enterprise_id mirror their direction's.
   */
  static async syncDirectionMembers(tenantId: number, directionId: number): Promise<void> {
    await DatabaseService.execute(
      `UPDATE users SET
         subsidiary_id = (SELECT d.subsidiary_id FROM directions d WHERE d.id = @directionId),
         enterprise_id = (SELECT d.enterprise_id FROM directions d WHERE d.id = @directionId)
       WHERE tenant_id = @tenantId AND direction_id = @directionId`,
      { tenantId, directionId }
    );
  }
}
