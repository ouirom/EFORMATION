import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import settingsRoutes from './settings.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/settings', settingsRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

const adminToken = tokenFor({ id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' });

function mockAuthLookup() {
  return {
    id: 1, tenant_id: 10, email: 'admin@test.com', display_name: 'Admin',
    avatar_url: null, role: 'admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
  };
}

describe('GET /settings/inactivity-policies', () => {
  it('returns the configured policies', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM inactivity_policies')) {
        return Promise.resolve([{ role: 'agent', max_inactive_days: 90 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/settings/inactivity-policies').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ role: 'agent', maxInactiveDays: 90 }]);
  });

  it('returns 403 for a non-admin', async () => {
    const managerToken = tokenFor({ id: 2, tenantId: 10, email: 'manager@test.com', role: 'manager' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([{ ...mockAuthLookup(), id: 2, email: 'manager@test.com', role: 'manager' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/settings/inactivity-policies').set('Authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(403);
  });
});

describe('PUT /settings/inactivity-policies', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  });

  it('sets a policy for a valid role', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id FROM inactivity_policies')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/settings/inactivity-policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'agent', maxInactiveDays: 90 });

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inactivity_policies'),
      expect.objectContaining({ role: 'agent', maxInactiveDays: 90 })
    );
  });

  it('rejects admin/super_admin as a policy target', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/settings/inactivity-policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin', maxInactiveDays: 90 });

    expect(response.status).toBe(400);
  });

  it('removes the policy when maxInactiveDays is null', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/settings/inactivity-policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'agent', maxInactiveDays: null });

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM inactivity_policies'),
      expect.objectContaining({ role: 'agent' })
    );
  });
});
