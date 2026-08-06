import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import userRoutes from './user.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

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

const directorPayload = { id: 1, tenantId: 10, email: 'director@test.com', role: 'director', directionId: 5 };
const directorToken = tokenFor(directorPayload);

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, tenant_id: 10, email: 'director@test.com', display_name: 'Director',
    avatar_url: null, role: 'director', enterprise_id: null, direction_id: 5, service_id: null, is_active: true,
    ...overrides,
  };
}

describe('GET /users list scoping', () => {
  it('excludes peers/superiors from the WHERE clause a director-scoped query builds', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT COUNT(*) as total')) return Promise.resolve([{ total: 0 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users').set('Authorization', `Bearer ${directorToken}`);

    expect(response.status).toBe(200);
    const [, countParams] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT COUNT(*) as total'));
    expect(countParams.requesterLevel).toBe(4); // director's own level — only rows below it match
    expect(countParams.userDirectionId).toBe(5);
  });
});

describe('GET /users/:id scoping', () => {
  it('allows a director to view a subordinate (manager) in their own direction', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('WHERE u.id = @userId')) {
        return Promise.resolve([{
          id: 42, email: 'manager@test.com', role: 'manager', direction_id: 5, service_id: 7, tenant_id: 10,
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/42').set('Authorization', `Bearer ${directorToken}`);
    expect(response.status).toBe(200);
  });

  it('blocks a director from viewing a peer (another director) even in the same direction', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('WHERE u.id = @userId')) {
        return Promise.resolve([{
          id: 43, email: 'other-director@test.com', role: 'director', direction_id: 5, service_id: null, tenant_id: 10,
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/43').set('Authorization', `Bearer ${directorToken}`);
    expect(response.status).toBe(403);
  });

  it('blocks a director from viewing a subordinate outside their direction', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('WHERE u.id = @userId')) {
        return Promise.resolve([{
          id: 44, email: 'other-manager@test.com', role: 'manager', direction_id: 99, service_id: 7, tenant_id: 10,
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/44').set('Authorization', `Bearer ${directorToken}`);
    expect(response.status).toBe(403);
  });

  it('always allows a user to view their own record', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('WHERE u.id = @userId')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/1').set('Authorization', `Bearer ${directorToken}`);
    expect(response.status).toBe(200);
  });

  it('lets an admin view anyone regardless of scope', async () => {
    const adminToken = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      if (query.includes('WHERE u.id = @userId')) {
        return Promise.resolve([{ id: 44, email: 'x@test.com', role: 'director', direction_id: 99, service_id: null, tenant_id: 10 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/44').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
  });
});
