import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import authRoutes from './auth.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

describe('POST /auth/switch-tenant', () => {
  it('issues a token scoped to the target tenant for a super_admin', async () => {
    const token = tokenFor({ id: 1, tenantId: 10, email: 'super@platform.local', role: 'super_admin' });

    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id AND deleted_at IS NULL AND')) {
        // authenticateHandler's own lookup
        return Promise.resolve([{
          id: 1, tenant_id: 10, email: 'super@platform.local', display_name: 'Super',
          avatar_url: null, role: 'super_admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
        }]);
      }
      if (query.includes('FROM tenants WHERE id = @targetTenantId')) {
        expect(params.targetTenantId).toBe(99);
        return Promise.resolve([{ id: 99, name: 'Acme Corp' }]);
      }
      if (query.includes("role = 'super_admin'") && query.includes('SELECT id, email')) {
        return Promise.resolve([{ id: 1, email: 'super@platform.local' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/auth/switch-tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ tenantId: 99 });

    expect(response.status).toBe(200);
    expect(response.body.data.tenant).toEqual({ id: 99, name: 'Acme Corp' });
    expect(response.body.data.accessToken).toBeTruthy();

    const decoded = jwt.verify(response.body.data.accessToken, config.jwt.secret) as any;
    expect(decoded.tenantId).toBe(99);
    expect(decoded.role).toBe('super_admin');
    expect(decoded.id).toBe(1);
  });

  it('rejects a non-super_admin', async () => {
    const token = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id AND deleted_at IS NULL AND')) {
        return Promise.resolve([{
          id: 2, tenant_id: 10, email: 'admin@test.com', display_name: 'Admin',
          avatar_url: null, role: 'admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/auth/switch-tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ tenantId: 99 });

    expect(response.status).toBe(401);
  });

  it('returns 404 for a tenant that does not exist', async () => {
    const token = tokenFor({ id: 1, tenantId: 10, email: 'super@platform.local', role: 'super_admin' });

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id AND deleted_at IS NULL AND')) {
        return Promise.resolve([{
          id: 1, tenant_id: 10, email: 'super@platform.local', display_name: 'Super',
          avatar_url: null, role: 'super_admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
        }]);
      }
      if (query.includes('FROM tenants WHERE id = @targetTenantId')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/auth/switch-tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ tenantId: 999 });

    expect(response.status).toBe(404);
  });
});

describe('authenticate middleware, cross-tenant super_admin token', () => {
  it("accepts a super_admin token whose tenantId differs from the user's stored home tenant", async () => {
    // Home tenant is 10, but the token claims to be acting in tenant 99 (post switch-tenant).
    const token = tokenFor({ id: 1, tenantId: 99, email: 'super@platform.local', role: 'super_admin' });

    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id AND deleted_at IS NULL AND')) {
        expect(params.tenantId).toBe(99);
        // Row's real tenant_id (10) differs from params.tenantId (99) — only matched
        // because the query ORs in `role = 'super_admin'`.
        return Promise.resolve([{
          id: 1, tenant_id: 10, email: 'super@platform.local', display_name: 'Super',
          avatar_url: null, role: 'super_admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.tenantId).toBe(99);
  });
});
