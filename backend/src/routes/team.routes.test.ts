import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import teamRoutes from './team.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/teams', teamRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 2, tenant_id: 10, email: 'admin@test.com', display_name: 'Admin User',
    avatar_url: null, role: 'admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

const adminToken = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });
const agentToken = tokenFor({ id: 5, tenantId: 10, email: 'agent@test.com', role: 'agent' });
const managerToken = tokenFor({ id: 8, tenantId: 10, email: 'manager@test.com', role: 'manager' });

describe('GET /teams', () => {
  it('lists teams scoped to the caller tenant with resolved counts', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM teams t')) {
        return Promise.resolve([
          { id: 1, name: 'Equipe Nord', description: null, created_by: 2, created_by_name: 'Admin User', member_entry_count: 3, resolved_user_count: 12, created_at: '2026-01-01', updated_at: null },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/teams').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ id: 1, name: 'Equipe Nord', resolvedUserCount: 12, memberEntryCount: 3 });
  });

  it('rejects a caller without admin/director/manager role', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup({ id: 5, role: 'agent' })]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/teams').set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
  });
});

describe('GET /teams/:id', () => {
  it('returns raw member entries with resolved names and a distinct resolved user list', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM teams WHERE id = @id')) return Promise.resolve([{ id: 1, name: 'Equipe Nord', description: 'desc', created_at: '2026-01-01', updated_at: null }]);
      if (query.includes('FROM team_members tm') && query.includes('target_name')) {
        return Promise.resolve([
          { id: 100, member_type: 'service', target_id: 7, target_name: 'Support' },
          { id: 101, member_type: 'user', target_id: 42, target_name: 'Jean Dupont' },
        ]);
      }
      if (query.includes('DISTINCT u.id')) {
        return Promise.resolve([
          { id: 42, display_name: 'Jean Dupont', email: 'jean@test.com' },
          { id: 43, display_name: 'Marie Curie', email: 'marie@test.com' },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/teams/1').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.members).toHaveLength(2);
    expect(response.body.data.members[0]).toMatchObject({ memberType: 'service', targetId: 7, targetName: 'Support' });
    expect(response.body.data.resolvedUsers).toHaveLength(2);
    expect(response.body.data.resolvedUsers[0]).toMatchObject({ displayName: 'Jean Dupont' });
  });

  it('404s when the team does not exist in the caller tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM teams WHERE id = @id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/teams/999').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});

describe('POST /teams', () => {
  it('creates a team and inserts a mixed-type member selection', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('WHERE id = @targetId AND tenant_id = @tenantId')) return Promise.resolve([{ id: 1 }]);
      if (query.includes('INSERT INTO teams')) return Promise.resolve([{ id: 55 }]);
      if (query.startsWith('SELECT id FROM team_members WHERE')) return Promise.resolve([]);
      if (query === 'SELECT * FROM teams WHERE id = @id') return Promise.resolve([{ id: 55, name: 'Nouvelle equipe' }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Nouvelle equipe',
        description: 'Une equipe test',
        members: [
          { memberType: 'direction', targetId: 3 },
          { memberType: 'service', targetId: 7 },
          { memberType: 'user', targetId: 42 },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: 55 });
    const insertCalls = mockedExecute.mock.calls.filter(([q]: [string]) => q.includes('INSERT INTO team_members'));
    expect(insertCalls).toHaveLength(3);
  });

  it('rejects a member target that does not belong to the caller tenant', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('INSERT INTO teams')) return Promise.resolve([{ id: 55 }]);
      // Target user id 999 does not exist in this tenant.
      if (query.includes('WHERE id = @targetId AND tenant_id = @tenantId')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X', members: [{ memberType: 'user', targetId: 999 }] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_TARGET');
  });

  it('rejects an invalid memberType', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X', members: [{ memberType: 'role', targetId: 1 }] });

    expect(response.status).toBe(400);
  });
});

describe('PUT /teams/:id', () => {
  it('fully replaces the member set when members is provided', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM teams WHERE id = @id AND tenant_id = @tenantId') return Promise.resolve([{ id: 1 }]);
      if (query.includes('WHERE id = @targetId AND tenant_id = @tenantId')) return Promise.resolve([{ id: 1 }]);
      if (query.startsWith('SELECT id FROM team_members WHERE')) return Promise.resolve([]);
      if (query === 'SELECT * FROM teams WHERE id = @id') return Promise.resolve([{ id: 1, name: 'Renamed' }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/teams/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed', members: [{ memberType: 'user', targetId: 9 }] });

    expect(response.status).toBe(200);
    const deleteCall = mockedExecute.mock.calls.find(([q]: [string]) => q === 'DELETE FROM team_members WHERE team_id = @id');
    expect(deleteCall).toBeTruthy();
    const insertCall = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO team_members'));
    expect(insertCall).toBeTruthy();
  });
});

describe('DELETE /teams/:id', () => {
  it('deletes the team and its members', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM teams WHERE id = @id AND tenant_id = @tenantId') return Promise.resolve([{ id: 1 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).delete('/teams/1').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith('DELETE FROM team_members WHERE team_id = @id', { id: 1 });
  });

  it('404s for a team outside the caller tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM teams WHERE id = @id AND tenant_id = @tenantId') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).delete('/teams/1').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });

  it('404s for a manager trying to delete a team created by a different manager', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup({ id: 8, role: 'manager' })]);
      // The route now appends "AND created_by = @requesterId" for managers -- a team
      // this manager didn't create never matches, regardless of tenant.
      if (query.startsWith('SELECT id FROM teams WHERE id = @id AND tenant_id = @tenantId')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).delete('/teams/1').set('Authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(404);
  });
});
