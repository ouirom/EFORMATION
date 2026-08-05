import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import userRoutes from './user.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/notification.service');
jest.mock('../services/audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

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

const adminUser = { id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' };
const adminToken = tokenFor(adminUser);

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1,
    tenant_id: 10,
    email: 'admin@test.com',
    display_name: 'Admin',
    avatar_url: null,
    role: 'admin',
    enterprise_id: null,
    direction_id: null,
    service_id: null,
    is_active: true,
    ...overrides,
  };
}

describe('POST /users/import', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  });

  it('creates valid rows, skips duplicates, and reports invalid rows', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup()]);
      }
      if (query.startsWith('SELECT id, code FROM enterprises')) return Promise.resolve([]);
      if (query.startsWith('SELECT id, code FROM directions')) return Promise.resolve([]);
      if (query.startsWith('SELECT id, code FROM services')) return Promise.resolve([]);
      if (query.includes('SELECT email FROM users WHERE tenant_id')) {
        return Promise.resolve([{ email: 'existing@test.com' }]);
      }
      if (query.includes('INSERT INTO users')) {
        return Promise.resolve([{ id: 999 }]);
      }
      return Promise.resolve([]);
    });

    const csv =
      'email,displayName,role\n' +
      'new@test.com,New User,agent\n' +
      'existing@test.com,Dup,agent\n' +
      'bad-email,No Email,agent\n' +
      ',No Anything,agent\n';

    const response = await request(makeApp())
      .post('/users/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(csv), 'users.csv');

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      totalRows: 4,
      created: 1,
      skipped: 1,
      errors: 2,
    });
    expect(
      response.body.data.results.find((r: any) => r.email === 'new@test.com').status
    ).toBe('created');
    expect(
      response.body.data.results.find((r: any) => r.email === 'existing@test.com').status
    ).toBe('skipped');
  });

  it('rejects a row that tries to create an admin when the requester is a director', async () => {
    const directorUser = { id: 2, tenantId: 10, email: 'director@test.com', role: 'director' };
    const directorToken = tokenFor(directorUser);

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'director@test.com', role: 'director' })]);
      }
      if (query.startsWith('SELECT id, code FROM enterprises')) return Promise.resolve([]);
      if (query.startsWith('SELECT id, code FROM directions')) return Promise.resolve([]);
      if (query.startsWith('SELECT id, code FROM services')) return Promise.resolve([]);
      if (query.includes('SELECT email FROM users WHERE tenant_id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const csv = 'email,displayName,role\nnew-admin@test.com,New Admin,admin\n';

    const response = await request(makeApp())
      .post('/users/import')
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', Buffer.from(csv), 'users.csv');

    expect(response.status).toBe(201);
    expect(response.body.data.errors).toBe(1);
    expect(response.body.data.results[0].status).toBe('error');
  });

  it('returns 400 when no file is attached', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup()]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/users/import')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
  });

  it('returns 403 for a non-admin/director role', async () => {
    const agentUser = { id: 3, tenantId: 10, email: 'agent@test.com', role: 'agent' };
    const agentToken = tokenFor(agentUser);

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 3, email: 'agent@test.com', role: 'agent' })]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/users/import')
      .set('Authorization', `Bearer ${agentToken}`)
      .attach('file', Buffer.from('email,displayName,role\na@test.com,A,agent\n'), 'users.csv');

    expect(response.status).toBe(403);
  });
});
