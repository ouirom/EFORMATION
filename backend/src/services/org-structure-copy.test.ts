import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DatabaseService } from './database.service';
import { AuditService } from './audit.service';
import { planStructureCopy, unitNameKey } from './org-structure.service';
import organizationRoutes from '../routes/organization.routes';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('./database.service');
jest.mock('./audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedTransaction = DatabaseService.withTransaction as jest.Mock;
const mockedAudit = AuditService.log as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/organizations', organizationRoutes);
  app.use(errorHandler);
  return app;
}

const token = (role = 'admin') => jwt.sign({ id: 3, tenantId: 10, email: 'a@test.com', role }, config.jwt.secret);

// Tenant 10: subsidiary 5 (source) and 6 (target, code SN) of enterprise 1, and 4
// of enterprise 2. Subsidiary 20 belongs to tenant 99. The target already has a
// "ressources  humaines" direction with a "paie" service.
const SUBSIDIARIES: Record<number, any> = {
  4: { id: 4, tenant_id: 10, enterprise_id: 2, name: 'Filiale GA', code: null },
  5: { id: 5, tenant_id: 10, enterprise_id: 1, name: 'Filiale CI', code: 'CI' },
  6: { id: 6, tenant_id: 10, enterprise_id: 1, name: 'Filiale SN', code: 'SN' },
  20: { id: 20, tenant_id: 99, enterprise_id: 9, name: 'Autre tenant', code: null },
};
const DIRECTIONS: Record<number, any[]> = {
  5: [
    { id: 7, name: 'Commerciale', code: 'COM' },
    { id: 8, name: 'Ressources Humaines', code: null },
  ],
  6: [{ id: 30, name: 'ressources  humaines', code: 'RH' }],
  20: [{ id: 40, name: 'Secrète', code: null }],
};
const SERVICES: Record<number, any[]> = {
  5: [
    { id: 9, name: 'Ventes', code: 'VTE', direction_id: 7 },
    { id: 10, name: 'Marketing', code: null, direction_id: 7 },
    { id: 11, name: 'Paie', code: 'PAIE', direction_id: 8 },
    { id: 12, name: 'Formation', code: null, direction_id: 8 },
  ],
  6: [{ id: 31, name: 'paie', code: null, direction_id: 30 }],
  20: [],
};

let txQuery: jest.Mock;
let rolledBack: boolean;

function mockDb(role = 'admin') {
  mockedQuery.mockImplementation((query: string, params: any) => {
    if (query.match(/^SELECT \* FROM subsidiaries WHERE id = @id AND tenant_id = @tenantId/)) {
      const row = SUBSIDIARIES[params.id];
      return Promise.resolve(row && row.tenant_id === params.tenantId ? [row] : []);
    }
    if (query.includes('FROM users WHERE id = @id AND deleted_at IS NULL')) {
      return Promise.resolve([{ id: 3, tenant_id: 10, email: 'a@test.com', role, is_active: true }]);
    }
    const subsidiaryId = query.includes('@sourceId') ? params.sourceId : params.targetId;
    if (query.startsWith('SELECT id, name, code FROM directions')) return Promise.resolve(DIRECTIONS[subsidiaryId] ?? []);
    if (query.includes('FROM services s JOIN directions d')) return Promise.resolve(SERVICES[subsidiaryId] ?? []);
    if (query.startsWith('SELECT code FROM directions')) return Promise.resolve([{ code: 'COM' }, { code: 'RH' }, { code: 'COM-SN' }]);
    if (query.startsWith('SELECT code FROM services')) return Promise.resolve([{ code: 'VTE' }, { code: 'PAIE' }]);
    return Promise.resolve([]);
  });
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });

  let nextId = 100;
  txQuery = jest.fn(() => Promise.resolve([{ id: nextId++ }]));
  rolledBack = false;
  mockedTransaction.mockImplementation(async (callback: any) => {
    try {
      return await callback({ query: txQuery, execute: jest.fn() });
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  });
}

const copy = (body: any, role = 'admin', source = 5) =>
  request(makeApp()).post(`/organizations/subsidiaries/${source}/copy-structure`).set('Authorization', `Bearer ${token(role)}`).send(body);

const inserts = (table: string) => txQuery.mock.calls.filter(([q]: [string]) => q.includes(`INSERT INTO ${table}`)).map(([, p]: [string, any]) => p);

beforeEach(() => {
  mockedQuery.mockReset();
  mockedExecute.mockReset();
  mockedTransaction.mockReset();
  mockedAudit.mockReset();
});

describe('planStructureCopy', () => {
  const base = {
    sourceDirections: DIRECTIONS[5],
    sourceServices: SERVICES[5],
    targetDirections: DIRECTIONS[6],
    targetServices: SERVICES[6],
    usedDirectionCodes: ['COM', 'RH'],
    usedServiceCodes: ['VTE', 'PAIE'],
    codeSuffix: 'SN',
  };

  it('merges same-name directions and skips the services the target already has', () => {
    const plan = planStructureCopy(base);
    expect(plan.summary).toEqual({ directionsCreated: 1, directionsMerged: 1, servicesCreated: 3, servicesSkipped: 1 });
    expect(plan.directions[1]).toMatchObject({ action: 'merge', targetId: 30 });
    expect(plan.directions[1].services.map((s) => [s.name, s.action])).toEqual([['Paie', 'skip'], ['Formation', 'create']]);
  });

  it('never reuses a code already taken in the tenant', () => {
    const plan = planStructureCopy({ ...base, usedDirectionCodes: ['COM', 'COM-SN'] });
    expect(plan.directions[0].code).toBe('COM-2');
    expect(plan.directions[0].services[0].code).toBe('VTE-SN');
    expect(planStructureCopy({ ...base, codeSuffix: null }).directions[0].code).toBe('COM-2');
    expect(planStructureCopy({ ...base, usedDirectionCodes: [] }).directions[0].code).toBe('COM');
  });

  it('copies only the ticked directions and services', () => {
    const plan = planStructureCopy({ ...base, directionIds: [7], serviceIds: [10, 11] });
    expect(plan.directions).toHaveLength(1);
    expect(plan.directions[0].services.map((s) => s.name)).toEqual(['Marketing']);
    expect(plan.summary).toEqual({ directionsCreated: 1, directionsMerged: 0, servicesCreated: 1, servicesSkipped: 0 });
  });

  it('folds two source directions with the same name into one', () => {
    const plan = planStructureCopy({
      ...base,
      sourceDirections: [{ id: 1, name: 'Achats', code: null }, { id: 2, name: ' ACHATS ', code: null }],
      sourceServices: [{ id: 3, name: 'Fournisseurs', code: null, direction_id: 1 }, { id: 4, name: 'fournisseurs', code: null, direction_id: 2 }],
    });
    expect(plan.summary).toEqual({ directionsCreated: 1, directionsMerged: 1, servicesCreated: 1, servicesSkipped: 1 });
  });

  it('matches names whatever their case and spacing', () => {
    expect(unitNameKey('  Ressources   HUMAINES ')).toBe(unitNameKey('ressources humaines'));
  });
});

describe('POST /organizations/subsidiaries/:id/copy-structure', () => {
  it('previews without writing anything (dry run)', async () => {
    mockDb();
    const response = await copy({ targetSubsidiaryId: 6, dryRun: true });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      dryRun: true,
      summary: { directionsCreated: 1, directionsMerged: 1, servicesCreated: 3, servicesSkipped: 1 },
      createdDirectionIds: [],
    });
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('creates the structure in one transaction, under the target subsidiary, and audits it', async () => {
    mockDb();
    const response = await copy({ targetSubsidiaryId: 6 });
    expect(response.status).toBe(201);
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(inserts('directions')).toEqual([
      { tenant_id: 10, enterprise_id: 1, subsidiary_id: 6, name: 'Commerciale', code: 'COM-2' },
    ]);
    // Merged direction 30 gets only Formation; Paie is already there.
    expect(inserts('services')).toEqual([
      { tenant_id: 10, direction_id: 100, name: 'Ventes', code: 'VTE-SN' },
      { tenant_id: 10, direction_id: 100, name: 'Marketing', code: null },
      { tenant_id: 10, direction_id: 30, name: 'Formation', code: null },
    ]);
    // Nothing about people is copied.
    expect(txQuery.mock.calls.every(([q]: [string]) => !/users|assignment|team/i.test(q))).toBe(true);
    expect(response.body.data).toMatchObject({ createdDirectionIds: [100], createdServiceIds: [101, 102, 103] });
    expect(mockedAudit).toHaveBeenCalledWith(10, 3, 'ORG_STRUCTURE_COPIED', 'subsidiaries', 6, expect.objectContaining({
      sourceId: 5, targetId: 6, directionsCreated: 1, directionsMerged: 1, servicesCreated: 3, servicesSkipped: 1,
    }));
  });

  it('copies only the selected subset, also into another enterprise', async () => {
    mockDb();
    const response = await copy({ targetSubsidiaryId: 4, directionIds: [8], serviceIds: [12] });
    expect(response.status).toBe(201);
    expect(inserts('directions')).toEqual([{ tenant_id: 10, enterprise_id: 2, subsidiary_id: 4, name: 'Ressources Humaines', code: null }]);
    expect(inserts('services').map((p: any) => p.name)).toEqual(['Formation']);
  });

  it('rolls everything back when an insert fails', async () => {
    mockDb();
    txQuery.mockResolvedValueOnce([{ id: 100 }]).mockRejectedValueOnce(new Error('boom'));
    const response = await copy({ targetSubsidiaryId: 6 });
    expect(response.status).toBe(500);
    expect(rolledBack).toBe(true);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("refuses another tenant's subsidiary or units, and the same subsidiary twice", async () => {
    mockDb();
    expect((await copy({ targetSubsidiaryId: 20, dryRun: true })).status).toBe(404);
    expect((await copy({ targetSubsidiaryId: 6, dryRun: true }, 'admin', 20)).status).toBe(404);
    const foreignUnit = await copy({ targetSubsidiaryId: 6, directionIds: [40] });
    expect(foreignUnit.status).toBe(400);
    expect(foreignUnit.body.error.code).toBe('ORG_COPY_UNKNOWN_UNIT');
    const same = await copy({ targetSubsidiaryId: 5 });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('ORG_COPY_SAME_SUBSIDIARY');
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it('refuses a copy that would create nothing', async () => {
    mockDb();
    const response = await copy({ targetSubsidiaryId: 6, directionIds: [8], serviceIds: [11] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORG_COPY_NOTHING_TO_DO');
  });

  it('validates the body and is admin only', async () => {
    mockDb();
    expect((await copy({ targetSubsidiaryId: 'x' })).status).toBe(400);
    expect((await copy({ targetSubsidiaryId: 6, directionIds: ['a'] })).status).toBe(400);
    mockDb('director');
    expect((await copy({ targetSubsidiaryId: 6, dryRun: true }, 'director')).status).toBe(403);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });
});
