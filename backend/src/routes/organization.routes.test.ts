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
