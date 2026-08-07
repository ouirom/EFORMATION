import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import analyticsRoutes from './analytics.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/analytics', analyticsRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1,
    tenant_id: 10,
    email: 'manager@test.com',
    display_name: 'Manager',
    avatar_url: null,
    role: 'manager',
    enterprise_id: null,
    direction_id: null,
    service_id: 5,
    is_active: true,
    ...overrides,
  };
}

describe('GET /analytics/my-team', () => {
  it('scopes a manager to their own service and excludes themselves', async () => {
    const token = tokenFor({ id: 1, tenantId: 10, email: 'manager@test.com', role: 'manager', serviceId: 5 });

    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM users u') && query.includes('LEFT JOIN')) {
        expect(params.serviceId).toBe(5);
        return Promise.resolve([
          {
            id: 2, display_name: 'Agent Un', email: 'agent1@test.com', role: 'agent', avatar_url: null,
            enrolled_count: 3, completed_count: 1, avg_progress: 40, last_activity: '2026-08-01T00:00:00.000Z', overdue_count: 2,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/analytics/my-team')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        id: 2, displayName: 'Agent Un', email: 'agent1@test.com', role: 'agent', avatarUrl: null,
        enrolledCount: 3, completedCount: 1, avgProgress: 40, lastActivity: '2026-08-01T00:00:00.000Z', overdueCount: 2,
      },
    ]);
  });

  it("passes the manager's role level so the query excludes peers/superiors in the same service", async () => {
    const token = tokenFor({ id: 1, tenantId: 10, email: 'manager@test.com', role: 'manager', serviceId: 5 });

    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM users u') && query.includes('LEFT JOIN')) {
        expect(params.requesterLevel).toBe(3); // manager's own level
        expect(query).toContain("WHEN 'manager' THEN 3");
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/analytics/my-team')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it("scopes a supervisor to only their explicitly assigned agents (supervisor_id), not the whole service", async () => {
    const token = tokenFor({ id: 17, tenantId: 10, email: 'supervisor@test.com', role: 'supervisor', serviceId: 5 });

    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 17, email: 'supervisor@test.com', role: 'supervisor' })]);
      }
      if (query.includes('FROM users u') && query.includes('LEFT JOIN')) {
        expect(query).toContain('u.supervisor_id = @requesterId');
        expect(query).not.toContain('u.service_id = @serviceId');
        expect(params.requesterId).toBe(17);
        return Promise.resolve([
          {
            id: 3, display_name: 'Agent Assigné', email: 'agent@test.com', role: 'agent', avatar_url: null,
            enrolled_count: 1, completed_count: 1, avg_progress: 100, last_activity: null, overdue_count: 0,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/analytics/my-team')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].displayName).toBe('Agent Assigné');
  });

  it('returns an empty team for a director with no direction assigned', async () => {
    const token = tokenFor({ id: 1, tenantId: 10, email: 'director@test.com', role: 'director' });

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ role: 'director', service_id: null, direction_id: null })]);
      }
      if (query.includes('FROM users u') && query.includes('LEFT JOIN')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/analytics/my-team')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('returns 403 for an agent', async () => {
    const token = tokenFor({ id: 3, tenantId: 10, email: 'agent@test.com', role: 'agent' });

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 3, email: 'agent@test.com', role: 'agent' })]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/analytics/my-team')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
