import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DatabaseService } from './database.service';
import { OrgStructureService } from './org-structure.service';
import organizationRoutes from '../routes/organization.routes';
import userRoutes from '../routes/user.routes';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';
import { teamAssignmentClause, teamAssignmentClauseForUserRow } from '../utils/teamAssignment';

jest.mock('./database.service');
jest.mock('./audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/organizations', organizationRoutes);
  app.use('/users', userRoutes);
  app.use(errorHandler);
  return app;
}

const token = (role = 'admin', id = 3) => jwt.sign({ id, tenantId: 10, email: 'a@test.com', role }, config.jwt.secret);

// Tenant 10: enterprise 1 with subsidiary 5; direction 7 under subsidiary 5, direction 8
// directly under enterprise 1; service 9 in direction 7. Enterprise 2 is another tenant's.
const UNITS: Record<string, Record<number, any>> = {
  enterprises: { 1: { id: 1, tenant_id: 10, name: 'Groupe' } },
  subsidiaries: { 5: { id: 5, tenant_id: 10, enterprise_id: 1, name: 'Filiale CI' }, 6: { id: 6, tenant_id: 10, enterprise_id: 3, name: 'Autre' } },
  directions: {
    7: { id: 7, tenant_id: 10, enterprise_id: 1, subsidiary_id: 5, name: 'Commerciale' },
    8: { id: 8, tenant_id: 10, enterprise_id: 1, subsidiary_id: null, name: 'Finance' },
  },
  services: { 9: { id: 9, tenant_id: 10, direction_id: 7, name: 'Ventes' } },
};

function mockDb(extra: (q: string, p: any) => any = () => undefined, role = 'admin') {
  mockedQuery.mockImplementation((query: string, params: any) => {
    const unit = query.match(/^SELECT \* FROM (enterprises|subsidiaries|directions|services) WHERE id = @id AND tenant_id = @tenantId/);
    if (unit) {
      const row = UNITS[unit[1]][params.id];
      return Promise.resolve(row && row.tenant_id === params.tenantId ? [row] : []);
    }
    if (query.includes('FROM users WHERE id = @id AND deleted_at IS NULL')) {
      return Promise.resolve([{ id: 3, tenant_id: 10, email: 'a@test.com', role, is_active: true }]);
    }
    return Promise.resolve(extra(query, params) ?? []);
  });
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
}

beforeEach(() => {
  mockedQuery.mockReset();
  mockedExecute.mockReset();
});

describe('OrgStructureService.resolvePlacement', () => {
  it('fills the parents from the lowest level given', async () => {
    mockDb();
    expect(await OrgStructureService.resolvePlacement(10, { serviceId: 9 })).toEqual({
      enterpriseId: 1, subsidiaryId: 5, directionId: 7, serviceId: 9,
    });
    expect(await OrgStructureService.resolvePlacement(10, { directionId: '8' })).toEqual({
      enterpriseId: 1, subsidiaryId: null, directionId: 8, serviceId: null,
    });
    expect(await OrgStructureService.resolvePlacement(10, { subsidiaryId: 5 })).toMatchObject({ enterpriseId: 1, subsidiaryId: 5 });
    expect(await OrgStructureService.resolvePlacement(10, {})).toEqual({ enterpriseId: null, subsidiaryId: null, directionId: null, serviceId: null });
  });

  it('refuses combinations that contradict the structure', async () => {
    mockDb();
    await expect(OrgStructureService.resolvePlacement(10, { directionId: 8, serviceId: 9 })).rejects.toMatchObject({ code: 'ORG_PLACEMENT_MISMATCH' });
    await expect(OrgStructureService.resolvePlacement(10, { subsidiaryId: 5, directionId: 8 })).rejects.toMatchObject({ code: 'ORG_PLACEMENT_MISMATCH' });
  });

  it("never accepts another tenant's unit", async () => {
    mockDb();
    await expect(OrgStructureService.resolvePlacement(99, { directionId: 7 })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('subsidiaries and directions', () => {
  it('creates a subsidiary under an enterprise of the tenant only', async () => {
    mockDb((q) => (q.includes('INSERT INTO subsidiaries') ? [{ id: 11 }] : q.includes('SELECT * FROM subsidiaries WHERE id = @id') ? [{ id: 11 }] : undefined));
    const ok = await request(makeApp()).post('/organizations/subsidiaries').set('Authorization', `Bearer ${token()}`).send({ enterpriseId: 1, name: 'Filiale SN' });
    expect(ok.status).toBe(201);
    const foreign = await request(makeApp()).post('/organizations/subsidiaries').set('Authorization', `Bearer ${token()}`).send({ enterpriseId: 2, name: 'X' });
    expect(foreign.status).toBe(404);
  });

  it('creates a direction in a subsidiary, inheriting its enterprise', async () => {
    mockDb((q) => (q.includes('INSERT INTO directions') ? [{ id: 12 }] : q.includes('SELECT * FROM directions WHERE id = @id') ? [{ id: 12 }] : undefined));
    const response = await request(makeApp()).post('/organizations/directions').set('Authorization', `Bearer ${token()}`).send({ subsidiaryId: 5, name: 'RH CI' });
    expect(response.status).toBe(201);
    const [, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO directions'));
    expect(params).toMatchObject({ enterprise_id: 1, subsidiary_id: 5 });
  });

  it('moves a direction between subsidiaries and brings its members along', async () => {
    mockDb();
    const response = await request(makeApp()).put('/organizations/directions/8').set('Authorization', `Bearer ${token()}`).send({ subsidiaryId: 5 });
    expect(response.status).toBe(200);
    expect(mockedExecute.mock.calls.some(([q]: [string]) => q.includes('UPDATE users SET') && q.includes('subsidiary_id'))).toBe(true);
  });

  it("refuses to move a direction to another enterprise's subsidiary", async () => {
    mockDb();
    const response = await request(makeApp()).put('/organizations/directions/8').set('Authorization', `Bearer ${token()}`).send({ subsidiaryId: 6 });
    expect(response.status).toBe(400);
  });

  it('refuses to delete a unit that is still used, saying why', async () => {
    mockDb((q) => (q.includes('FROM directions WHERE subsidiary_id') ? [{ n: '2' }] : q.includes('COUNT(*)') ? [{ n: 0 }] : undefined));
    const response = await request(makeApp()).delete('/organizations/subsidiaries/5').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'ORG_UNIT_IN_USE', message: expect.stringContaining('2 directions') });
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('deletes an unused unit', async () => {
    mockDb((q) => (q.includes('COUNT(*)') ? [{ n: 0 }] : undefined));
    const response = await request(makeApp()).delete('/organizations/services/9').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(200);
  });

  it('returns the tree with subsidiaries and member counts', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([{ id: 3, tenant_id: 10, role: 'admin', is_active: true }]);
      if (query.startsWith('SELECT * FROM enterprises')) return Promise.resolve([UNITS.enterprises[1]]);
      if (query.startsWith('SELECT * FROM subsidiaries')) return Promise.resolve([UNITS.subsidiaries[5]]);
      if (query.startsWith('SELECT * FROM directions')) return Promise.resolve(Object.values(UNITS.directions));
      if (query.startsWith('SELECT * FROM services')) return Promise.resolve(Object.values(UNITS.services));
      if (query.includes('GROUP BY enterprise_id')) return Promise.resolve([{ enterprise_id: 1, subsidiary_id: 5, direction_id: 7, service_id: 9, n: '4' }]);
      return Promise.resolve([]);
    });
    const response = await request(makeApp()).get('/organizations/tree').set('Authorization', `Bearer ${token()}`);
    const [enterprise] = response.body.data;
    expect(enterprise.member_count).toBe(4);
    expect(enterprise.subsidiaries[0]).toMatchObject({ name: 'Filiale CI', member_count: 4 });
    expect(enterprise.subsidiaries[0].directions[0]).toMatchObject({ name: 'Commerciale', services: [expect.objectContaining({ name: 'Ventes', member_count: 4 })] });
    expect(enterprise.directions.map((d: any) => d.name)).toEqual(['Finance']);
  });
});

describe('user placement', () => {
  it('stores the subsidiary derived from the chosen service', async () => {
    mockDb((q) => (q.includes('INSERT INTO users') ? [{ id: 50 }] : undefined));
    await request(makeApp())
      .post('/users')
      .set('Authorization', `Bearer ${token()}`)
      .send({ email: 'n@test.com', password: 'Strong-Passw0rd', displayName: 'N', role: 'agent', serviceId: 9 });
    const [, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO users'));
    expect(params).toMatchObject({ enterpriseId: 1, subsidiaryId: 5, directionId: 7, serviceId: 9 });
  });

  it('no longer lets users move themselves in the organization', async () => {
    mockDb(undefined, 'agent');
    const response = await request(makeApp()).put('/users/me').set('Authorization', `Bearer ${token('agent')}`).send({ directionId: 7 });
    expect(response.status).toBe(403);
    expect(mockedExecute).not.toHaveBeenCalled();
  });
});

describe('targeting a subsidiary', () => {
  it('is understood by team membership checks', () => {
    expect(teamAssignmentClause('ca', 'userId', null, null, null, 'subsidiaryId')).toContain("tm.member_type = 'subsidiary' AND tm.target_id = @subsidiaryId");
    expect(teamAssignmentClauseForUserRow('ca', 'u')).toContain("tm.member_type = 'subsidiary' AND tm.target_id = u.subsidiary_id");
  });
});
