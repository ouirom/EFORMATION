import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import platformRoutes from './platform.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/platform', platformRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockSuperAdminAuth() {
  return {
    id: 1, tenant_id: 10, email: 'super@platform.local', display_name: 'Super',
    avatar_url: null, role: 'super_admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
  };
}

describe('GET /platform/tenants', () => {
  it('lists tenants for a super_admin', async () => {
    const token = tokenFor({ id: 1, tenantId: 10, email: 'super@platform.local', role: 'super_admin' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockSuperAdminAuth()]);
      if (query.includes('FROM tenants t')) {
        return Promise.resolve([{ id: 1, name: 'Demo Enterprise', slug: 'demo', created_at: '2026-01-01', user_count: 12, course_count: 6 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/platform/tenants').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { id: 1, name: 'Demo Enterprise', slug: 'demo', createdAt: '2026-01-01', userCount: 12, courseCount: 6 },
    ]);
  });

  it('returns 403 for a regular admin', async () => {
    const token = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([{ ...mockSuperAdminAuth(), id: 2, role: 'admin' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/platform/tenants').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});

describe('POST /platform/tenants', () => {
  it('creates a tenant with a slugified name', async () => {
    const token = tokenFor({ id: 1, tenantId: 10, email: 'super@platform.local', role: 'super_admin' });
    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockSuperAdminAuth()]);
      if (query.includes('SELECT id FROM tenants WHERE name')) return Promise.resolve([]);
      if (query.includes('INSERT INTO tenants')) {
        expect(params.name).toBe('Globex Corp');
        expect(params.slug).toBe('globex-corp');
        return Promise.resolve([{ id: 42 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/platform/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Globex Corp' });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(42);
  });

  it('rejects a duplicate name', async () => {
    const token = tokenFor({ id: 1, tenantId: 10, email: 'super@platform.local', role: 'super_admin' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockSuperAdminAuth()]);
      if (query.includes('SELECT id FROM tenants WHERE name')) return Promise.resolve([{ id: 5 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/platform/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Demo Enterprise' });

    expect(response.status).toBe(409);
  });
});
