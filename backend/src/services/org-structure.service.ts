import { DatabaseService, DbExecutor } from './database.service';
import { IS_PG } from '../database/db-helpers';
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

// ==================== STRUCTURE COPY (subsidiary -> subsidiary) ====================

interface UnitRow {
  id: number;
  name: string;
  code: string | null;
  direction_id?: number;
}

export interface PlannedService {
  sourceId: number;
  name: string;
  /** The code the copy gets (may differ from the source's, see uniqueCode). */
  code: string | null;
  sourceCode: string | null;
  /** skip: the target direction already has a service of that name. */
  action: 'create' | 'skip';
  targetId?: number;
}

export interface PlannedDirection {
  sourceId: number;
  name: string;
  code: string | null;
  sourceCode: string | null;
  /** merge: reuses the target's direction of the same name (or one created earlier in this copy). */
  action: 'create' | 'merge';
  targetId?: number;
  services: PlannedService[];
}

export interface StructureCopySummary {
  directionsCreated: number;
  directionsMerged: number;
  servicesCreated: number;
  servicesSkipped: number;
}

export interface StructureCopyPlan {
  directions: PlannedDirection[];
  summary: StructureCopySummary;
}

export interface StructureCopyInput {
  sourceDirections: UnitRow[];
  sourceServices: UnitRow[];
  targetDirections: UnitRow[];
  targetServices: UnitRow[];
  /** Direction/service codes already used anywhere in the tenant. */
  usedDirectionCodes: (string | null)[];
  usedServiceCodes: (string | null)[];
  /** Suffix tried first when a copied code is taken (the target subsidiary's code). */
  codeSuffix?: string | null;
  /** Omitted = every direction / every service of the selected directions. */
  directionIds?: number[];
  serviceIds?: number[];
}

/** Names match case- and space-insensitively ("Ressources  humaines" = "ressources humaines"). */
export const unitNameKey = (name: string) => String(name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');

const CODE_MAX = 50;

/**
 * Codes are what the Excel user import resolves units by, tenant-wide, so a copy
 * never reuses a taken code: it gets "-<target code>" or "-2", "-3"... instead.
 */
function uniqueCode(code: string | null, used: Set<string>, suffix?: string | null): string | null {
  const base = code?.trim();
  if (!base) return null;
  const fits = (tail: string) => `${base.slice(0, CODE_MAX - tail.length)}${tail}`;
  const candidates = [base.slice(0, CODE_MAX), ...(suffix?.trim() ? [fits(`-${suffix.trim()}`)] : [])];
  for (let n = 2; n < 1000; n++) candidates.push(fits(`-${n}`));
  const free = candidates.find((c) => !used.has(c.toLowerCase())) ?? null;
  if (free) used.add(free.toLowerCase());
  return free;
}

/**
 * What copying the selected directions/services of one subsidiary into another
 * does, without touching the database: a direction whose name already exists in
 * the target is merged into it, and only its missing services are added.
 */
export function planStructureCopy(input: StructureCopyInput): StructureCopyPlan {
  const pickedDirections = input.directionIds ? new Set(input.directionIds.map(Number)) : null;
  const pickedServices = input.serviceIds ? new Set(input.serviceIds.map(Number)) : null;
  const usedDirectionCodes = new Set(input.usedDirectionCodes.filter(Boolean).map((c) => String(c).trim().toLowerCase()));
  const usedServiceCodes = new Set(input.usedServiceCodes.filter(Boolean).map((c) => String(c).trim().toLowerCase()));

  // Target directions by name, with the service names each one has (or will have).
  const targetByKey = new Map<string, { id?: number; serviceNames: Set<string> }>();
  for (const d of input.targetDirections) {
    const key = unitNameKey(d.name);
    if (!targetByKey.has(key)) targetByKey.set(key, { id: Number(d.id), serviceNames: new Set() });
  }
  const targetKeyById = new Map(input.targetDirections.map((d) => [Number(d.id), unitNameKey(d.name)]));
  for (const s of input.targetServices) {
    const key = targetKeyById.get(Number(s.direction_id));
    if (key) targetByKey.get(key)!.serviceNames.add(unitNameKey(s.name));
  }

  const directions: PlannedDirection[] = [];
  for (const d of input.sourceDirections) {
    if (pickedDirections && !pickedDirections.has(Number(d.id))) continue;
    const key = unitNameKey(d.name);
    const existing = targetByKey.get(key);
    const planned: PlannedDirection = existing
      ? { sourceId: Number(d.id), name: d.name, code: null, sourceCode: d.code ?? null, action: 'merge', targetId: existing.id, services: [] }
      : {
          sourceId: Number(d.id),
          name: d.name.trim(),
          code: uniqueCode(d.code, usedDirectionCodes, input.codeSuffix),
          sourceCode: d.code ?? null,
          action: 'create',
          services: [],
        };
    const serviceNames = existing?.serviceNames ?? new Set<string>();
    if (!existing) targetByKey.set(key, { serviceNames });

    for (const s of input.sourceServices) {
      if (Number(s.direction_id) !== Number(d.id)) continue;
      if (pickedServices && !pickedServices.has(Number(s.id))) continue;
      const serviceKey = unitNameKey(s.name);
      if (serviceNames.has(serviceKey)) {
        planned.services.push({ sourceId: Number(s.id), name: s.name, code: null, sourceCode: s.code ?? null, action: 'skip' });
      } else {
        serviceNames.add(serviceKey);
        planned.services.push({
          sourceId: Number(s.id),
          name: s.name.trim(),
          code: uniqueCode(s.code, usedServiceCodes, input.codeSuffix),
          sourceCode: s.code ?? null,
          action: 'create',
        });
      }
    }
    directions.push(planned);
  }

  const services = directions.flatMap((d) => d.services);
  return {
    directions,
    summary: {
      directionsCreated: directions.filter((d) => d.action === 'create').length,
      directionsMerged: directions.filter((d) => d.action === 'merge').length,
      servicesCreated: services.filter((s) => s.action === 'create').length,
      servicesSkipped: services.filter((s) => s.action === 'skip').length,
    },
  };
}

export interface CopyStructureOptions {
  targetSubsidiaryId: unknown;
  directionIds?: number[];
  serviceIds?: number[];
  dryRun?: boolean;
}

export interface CopyStructureResult extends StructureCopyPlan {
  dryRun: boolean;
  source: { id: number; name: string };
  target: { id: number; name: string; enterpriseId: number };
  createdDirectionIds: number[];
  createdServiceIds: number[];
}

async function insertReturningId(tx: DbExecutor, table: string, columns: Record<string, unknown>): Promise<number> {
  const names = Object.keys(columns);
  const values = names.map((n) => '@' + n).join(', ');
  const rows = await tx.query<{ id: number }>(
    IS_PG
      ? `INSERT INTO ${table} (${names.join(', ')}) VALUES (${values}) RETURNING id`
      : `INSERT INTO ${table} (${names.join(', ')}) OUTPUT INSERTED.id VALUES (${values})`,
    columns
  );
  return Number(rows[0].id);
}

/**
 * Copies the directions (and their services) of a subsidiary into another one of
 * the same tenant -- the structure only: no members, heads, assignments or teams.
 * `dryRun` returns the plan without writing; otherwise everything is created in
 * one transaction (all or nothing).
 */
export async function copySubsidiaryStructure(
  tenantId: number,
  sourceSubsidiaryId: unknown,
  options: CopyStructureOptions
): Promise<CopyStructureResult> {
  const source = await OrgStructureService.get('subsidiary', tenantId, sourceSubsidiaryId);
  const target = await OrgStructureService.get('subsidiary', tenantId, options.targetSubsidiaryId);
  if (Number(source.id) === Number(target.id)) {
    throw BadRequestError('The target subsidiary must differ from the source', 'ORG_COPY_SAME_SUBSIDIARY');
  }

  const params = { tenantId, sourceId: Number(source.id), targetId: Number(target.id) };
  const [sourceDirections, sourceServices, targetDirections, targetServices, directionCodes, serviceCodes] = await Promise.all([
    DatabaseService.query<UnitRow>('SELECT id, name, code FROM directions WHERE tenant_id = @tenantId AND subsidiary_id = @sourceId ORDER BY name', params),
    DatabaseService.query<UnitRow>(
      `SELECT s.id, s.name, s.code, s.direction_id FROM services s JOIN directions d ON d.id = s.direction_id
       WHERE s.tenant_id = @tenantId AND d.subsidiary_id = @sourceId ORDER BY s.name`,
      params
    ),
    DatabaseService.query<UnitRow>('SELECT id, name, code FROM directions WHERE tenant_id = @tenantId AND subsidiary_id = @targetId ORDER BY id', params),
    DatabaseService.query<UnitRow>(
      `SELECT s.id, s.name, s.code, s.direction_id FROM services s JOIN directions d ON d.id = s.direction_id
       WHERE s.tenant_id = @tenantId AND d.subsidiary_id = @targetId`,
      params
    ),
    DatabaseService.query<{ code: string | null }>('SELECT code FROM directions WHERE tenant_id = @tenantId AND code IS NOT NULL', params),
    DatabaseService.query<{ code: string | null }>('SELECT code FROM services WHERE tenant_id = @tenantId AND code IS NOT NULL', params),
  ]);

  // Only units of the source may be picked (never another subsidiary's or tenant's).
  const known = (ids: number[] | undefined, rows: UnitRow[]) => {
    const own = new Set(rows.map((r) => Number(r.id)));
    return (ids ?? []).every((id) => own.has(Number(id)));
  };
  if (!known(options.directionIds, sourceDirections) || !known(options.serviceIds, sourceServices)) {
    throw BadRequestError('Some selected units do not belong to the source subsidiary', 'ORG_COPY_UNKNOWN_UNIT');
  }

  const plan = planStructureCopy({
    sourceDirections,
    sourceServices,
    targetDirections,
    targetServices,
    usedDirectionCodes: directionCodes.map((r) => r.code),
    usedServiceCodes: serviceCodes.map((r) => r.code),
    codeSuffix: target.code,
    directionIds: options.directionIds,
    serviceIds: options.serviceIds,
  });
  const result: CopyStructureResult = {
    ...plan,
    dryRun: !!options.dryRun,
    source: { id: Number(source.id), name: source.name },
    target: { id: Number(target.id), name: target.name, enterpriseId: Number(target.enterprise_id) },
    createdDirectionIds: [],
    createdServiceIds: [],
  };
  if (options.dryRun) return result;
  if (plan.summary.directionsCreated + plan.summary.servicesCreated === 0) {
    throw BadRequestError('Nothing to copy: everything selected already exists in the target', 'ORG_COPY_NOTHING_TO_DO');
  }

  await DatabaseService.withTransaction(async (tx) => {
    // A direction merged into one created earlier in this same copy (two source
    // directions with the same name) finds its id here.
    const createdByKey = new Map<string, number>();
    for (const direction of plan.directions) {
      const key = unitNameKey(direction.name);
      if (direction.action === 'create') {
        direction.targetId = await insertReturningId(tx, 'directions', {
          tenant_id: tenantId,
          enterprise_id: Number(target.enterprise_id),
          subsidiary_id: Number(target.id),
          name: direction.name,
          code: direction.code,
        });
        createdByKey.set(key, direction.targetId);
        result.createdDirectionIds.push(direction.targetId);
      } else if (!direction.targetId) {
        direction.targetId = createdByKey.get(key);
      }
      for (const service of direction.services) {
        if (service.action !== 'create') continue;
        service.targetId = await insertReturningId(tx, 'services', {
          tenant_id: tenantId,
          direction_id: direction.targetId,
          name: service.name,
          code: service.code,
        });
        result.createdServiceIds.push(service.targetId);
      }
    }
  });
  return result;
}
