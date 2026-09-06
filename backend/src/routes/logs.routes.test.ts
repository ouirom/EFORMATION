import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import logsRoutes from './logs.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/logs', logsRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, tenant_id: 10, email: 'admin@test.com', display_name: 'Admin',
    avatar_url: null, role: 'admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

const adminToken = tokenFor({ id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' });
const agentToken = tokenFor({ id: 3, tenantId: 10, email: 'agent@test.com', role: 'agent' });

describe('GET /logs', () => {
  it('rejects a non-admin/director role', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup({ id: 3, role: 'agent' })]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/logs')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
  });

  it('lists tenant-scoped audit log entries for an admin', async () => {
    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT COUNT(*) as total FROM audit_logs')) {
        expect(params).toMatchObject({ tenantId: 10 });
        return Promise.resolve([{ total: 1 }]);
      }
      if (query.includes('FROM audit_logs a') && query.includes('ORDER BY a.created_at')) {
        return Promise.resolve([{ id: 1, action: 'USER_LOGIN', user_name: 'Agent' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: 1, action: 'USER_LOGIN', user_name: 'Agent' }]);
  });

  it('filters by a comma-separated actions list', async () => {
    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT COUNT(*) as total FROM audit_logs')) {
        expect(query).toContain('a.action IN (@actionIn0, @actionIn1)');
        expect(params).toMatchObject({ actionIn0: 'USER_LOGIN', actionIn1: 'USER_LOGOUT' });
        return Promise.resolve([{ total: 0 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/logs?actions=USER_LOGIN,USER_LOGOUT')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
  });
});

describe('GET /logs/actions', () => {
  it('returns the distinct action/entity values for this tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT DISTINCT action')) return Promise.resolve([{ action: 'USER_LOGIN' }]);
      if (query.startsWith('SELECT DISTINCT entity')) return Promise.resolve([{ entity: 'courses' }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/logs/actions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ actions: ['USER_LOGIN'], entities: ['courses'] });
  });
});
