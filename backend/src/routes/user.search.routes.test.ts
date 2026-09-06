import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import userRoutes from './user.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', userRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 3, tenant_id: 10, email: 'agent@test.com', display_name: 'Agent',
    avatar_url: null, role: 'agent', enterprise_id: null, direction_id: 5, service_id: 7, is_active: true,
    ...overrides,
  };
}

describe('GET /users/search', () => {
  it("scopes a non-admin-tier caller's search to their own direction/service, not the whole tenant", async () => {
    const agentToken = tokenFor({ id: 3, tenantId: 10, email: 'agent@test.com', role: 'agent', directionId: 5, serviceId: 7 });
    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('id, display_name, email, avatar_url, role') && query.includes('FROM users u')) {
        expect(query).toContain('u.direction_id = @userDirectionId');
        expect(query).toContain('u.service_id = @userServiceId');
        expect(params).toMatchObject({ selfId: 3, userDirectionId: 5, userServiceId: 7 });
        return Promise.resolve([{ id: 8, display_name: 'Bob', email: 'bob@test.com', role: 'agent' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/users/search?q=bob')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: 8, display_name: 'Bob', email: 'bob@test.com', role: 'agent' }]);
  });

  it('excludes the caller themself from the results', async () => {
    const agentToken = tokenFor({ id: 3, tenantId: 10, email: 'agent@test.com', role: 'agent', directionId: 5 });
    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('id, display_name, email, avatar_url, role') && query.includes('FROM users u')) {
        expect(query).toContain('u.id != @selfId');
        expect(params.selfId).toBe(3);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/users/search')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
  });

  it('lets a manager-tier caller search the whole tenant, with no org-unit restriction', async () => {
    const directorToken = tokenFor({ id: 1, tenantId: 10, email: 'director@test.com', role: 'director' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 1, role: 'director', direction_id: null })]);
      }
      if (query.includes('id, display_name, email, avatar_url, role') && query.includes('FROM users u')) {
        expect(query).not.toContain('direction_id = @userDirectionId');
        expect(query).not.toContain('service_id = @userServiceId');
        return Promise.resolve([{ id: 8, display_name: 'Bob', email: 'bob@test.com', role: 'agent' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/users/search')
      .set('Authorization', `Bearer ${directorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it('returns no results (rather than the whole tenant) for a non-admin caller with no org unit at all', async () => {
    const agentToken = tokenFor({ id: 3, tenantId: 10, email: 'agent@test.com', role: 'agent' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ direction_id: null, service_id: null, enterprise_id: null })]);
      }
      if (query.includes('id, display_name, email, avatar_url, role') && query.includes('FROM users u')) {
        expect(query).toContain('1=0');
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/users/search')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});
