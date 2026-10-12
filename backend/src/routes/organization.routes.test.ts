import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import organizationRoutes from './organization.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/organizations', organizationRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 3, tenant_id: 10, email: 'agent@test.com', display_name: 'Agent',
    avatar_url: null, role: 'agent', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

const agentToken = tokenFor({ id: 3, tenantId: 10, email: 'agent@test.com', role: 'agent' });
const adminToken = tokenFor({ id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' });

describe('GET /organizations/enterprises', () => {
  it('lists enterprises scoped to the caller\'s tenant', async () => {
    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: params.id, role: params.id === 1 ? 'admin' : 'agent' })]);
      }
      if (query.startsWith('SELECT * FROM enterprises WHERE tenant_id')) {
        expect(params).toMatchObject({ tenantId: 10 });
        return Promise.resolve([{ id: 1, name: 'Acme' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/organizations/enterprises')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: 1, name: 'Acme' }]);
  });
});

describe('POST /organizations/enterprises', () => {
  it('rejects a non-admin', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/organizations/enterprises')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ name: 'New Co' });

    expect(response.status).toBe(403);
  });

  it('creates an enterprise for an admin', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup({ id: 1, role: 'admin' })]);
      if (query.startsWith('INSERT INTO enterprises')) return Promise.resolve([{ id: 9 }]);
      if (query.startsWith('SELECT * FROM enterprises WHERE id')) return Promise.resolve([{ id: 9, name: 'New Co' }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/organizations/enterprises')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Co' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: 9, name: 'New Co' });
  });
});

describe('DELETE /organizations/enterprises/:id', () => {
  it('rejects a non-admin', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .delete('/organizations/enterprises/9')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
    expect(mockedExecute).not.toHaveBeenCalled();
  });
});

describe('Partner theme (external participants)', () => {
  function mockAdminWithSettings(settings: Record<string, any> | null) {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup({ id: 1, role: 'admin' })]);
      if (query.startsWith('SELECT id, name, slug')) return Promise.resolve([{ id: 10, name: 'Acme', slug: 'acme' }]);
      if (query.startsWith('SELECT * FROM tenant_settings')) return Promise.resolve(settings ? [settings] : []);
      if (query.startsWith('SELECT id FROM tenant_settings')) return Promise.resolve(settings ? [{ id: 1 }] : []);
      if (query.includes('COUNT(*)')) return Promise.resolve([{ total_users: 0, total_courses: 0, total_enrollments: 0, active_users: 0 }]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(1);
  }

  beforeEach(() => {
    mockedQuery.mockReset();
    mockedExecute.mockReset();
  });

  it('GET returns the defaults when no partner colors were chosen', async () => {
    mockAdminWithSettings({ primary_color: '#3B82F6', external_accent_color: null, external_surface_color: null });
    const response = await request(makeApp()).get('/organizations/current').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ externalAccentColor: '#D97706', externalSurfaceColor: '#0F172A' });
  });

  it('GET returns the stored partner colors', async () => {
    mockAdminWithSettings({ primary_color: '#3B82F6', external_accent_color: '#0E7490', external_surface_color: '#1E293B' });
    const response = await request(makeApp()).get('/organizations/current').set('Authorization', `Bearer ${adminToken}`);
    expect(response.body.data).toMatchObject({ externalAccentColor: '#0E7490', externalSurfaceColor: '#1E293B' });
  });

  it.each(['red', '#FFF', '#12345G', '0E7490', '#0E749000', 42])('PUT rejects %p as a partner color', async (value) => {
    mockAdminWithSettings({ id: 1 });
    const response = await request(makeApp())
      .put('/organizations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ externalAccentColor: value });
    expect(response.status).toBe(400);
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('PUT stores valid partner colors', async () => {
    mockAdminWithSettings({ id: 1 });
    const response = await request(makeApp())
      .put('/organizations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Acme', externalAccentColor: '#0e7490', externalSurfaceColor: '#1E293B' });
    expect(response.status).toBe(200);
    const [sql, params] = mockedExecute.mock.calls.find(([q]) => q.includes('UPDATE tenant_settings'))!;
    expect(sql).toContain('external_accent_color = @externalAccentColor');
    expect(sql).toContain('external_surface_color = @externalSurfaceColor');
    expect(params).toMatchObject({ externalAccentColor: '#0E7490', externalSurfaceColor: '#1E293B' });
  });

  it('PUT resets the partner colors to the defaults with null or an empty string', async () => {
    mockAdminWithSettings({ id: 1 });
    const response = await request(makeApp())
      .put('/organizations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ externalAccentColor: null, externalSurfaceColor: '' });
    expect(response.status).toBe(200);
    const [, params] = mockedExecute.mock.calls.find(([q]) => q.includes('UPDATE tenant_settings'))!;
    expect(params).toMatchObject({ externalAccentColor: null, externalSurfaceColor: null });
  });

  it('PUT leaves the partner colors alone when they are not sent', async () => {
    mockAdminWithSettings({ id: 1 });
    await request(makeApp())
      .put('/organizations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Hello' });
    const [sql] = mockedExecute.mock.calls.find(([q]) => q.includes('UPDATE tenant_settings'))!;
    expect(sql).not.toContain('external_accent_color');
  });

  it('PUT creates the settings row with the partner colors', async () => {
    mockAdminWithSettings(null);
    await request(makeApp())
      .put('/organizations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ externalSurfaceColor: '#111827' });
    const [sql, params] = mockedExecute.mock.calls.find(([q]) => q.includes('INSERT INTO tenant_settings'))!;
    expect(sql).toContain('external_surface_color');
    expect(params).toMatchObject({ externalAccentColor: null, externalSurfaceColor: '#111827' });
  });
  it('GET returns sidebarColor null when no side menu color was chosen', async () => {
    mockAdminWithSettings({ primary_color: '#3B82F6', sidebar_color: null });
    const response = await request(makeApp()).get('/organizations/current').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.sidebarColor).toBeNull();
  });

  it('GET returns sidebarColor null for a tenant without a settings row', async () => {
    mockAdminWithSettings(null);
    const response = await request(makeApp()).get('/organizations/current').set('Authorization', `Bearer ${adminToken}`);
    expect(response.body.data.sidebarColor).toBeNull();
  });

  it('GET returns the stored side menu color', async () => {
    mockAdminWithSettings({ primary_color: '#3B82F6', sidebar_color: '#8b1e1e' });
    const response = await request(makeApp()).get('/organizations/current').set('Authorization', `Bearer ${adminToken}`);
    expect(response.body.data.sidebarColor).toBe('#8B1E1E');
  });

  it.each(['navy', '#FFF', '#12345G', '0F172A', '#0F172A00', 7])('PUT rejects %p as a side menu color', async (value) => {
    mockAdminWithSettings({ id: 1 });
    const response = await request(makeApp())
      .put('/organizations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sidebarColor: value });
    expect(response.status).toBe(400);
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('PUT stores a valid side menu color', async () => {
    mockAdminWithSettings({ id: 1 });
    const response = await request(makeApp())
      .put('/organizations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Acme', sidebarColor: '#0f172a' });
    expect(response.status).toBe(200);
    const [sql, params] = mockedExecute.mock.calls.find(([q]) => q.includes('UPDATE tenant_settings'))!;
    expect(sql).toContain('sidebar_color = @sidebarColor');
    expect(params).toMatchObject({ sidebarColor: '#0F172A' });
  });

  it.each([null, ''])('PUT resets the side menu color to the default with %p', async (value) => {
    mockAdminWithSettings({ id: 1 });
    const response = await request(makeApp())
      .put('/organizations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sidebarColor: value });
    expect(response.status).toBe(200);
    const [sql, params] = mockedExecute.mock.calls.find(([q]) => q.includes('UPDATE tenant_settings'))!;
    expect(sql).toContain('sidebar_color = @sidebarColor');
    expect(params).toMatchObject({ sidebarColor: null });
  });

  it('PUT leaves the side menu color alone when it is not sent', async () => {
    mockAdminWithSettings({ id: 1 });
    await request(makeApp())
      .put('/organizations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Hello', externalAccentColor: '#0E7490' });
    const [sql] = mockedExecute.mock.calls.find(([q]) => q.includes('UPDATE tenant_settings'))!;
    expect(sql).not.toContain('sidebar_color');
  });

  it('PUT creates the settings row with the side menu color', async () => {
    mockAdminWithSettings(null);
    await request(makeApp())
      .put('/organizations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sidebarColor: '#8B1E1E' });
    const [sql, params] = mockedExecute.mock.calls.find(([q]) => q.includes('INSERT INTO tenant_settings'))!;
    expect(sql).toContain('sidebar_color');
    expect(params).toMatchObject({ sidebarColor: '#8B1E1E' });
  });
});
