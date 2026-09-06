import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import webhookRoutes from './webhook.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/webhooks', webhookRoutes);
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

describe('GET /webhooks', () => {
  it('rejects a non-admin', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup({ id: 3, role: 'agent' })]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/webhooks')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
  });

  it('lists webhooks with their events parsed out of JSON', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT id, name, url, events')) {
        return Promise.resolve([{ id: 1, name: 'Slack', url: 'https://example.com', events: '["course.published"]', is_active: true }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/webhooks')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].events).toEqual(['course.published']);
  });
});

describe('GET /webhooks/events', () => {
  it('returns the list of supported event types', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/webhooks/events')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(expect.arrayContaining(['course.published', 'certificate.issued']));
  });
});

describe('POST /webhooks', () => {
  it('rejects an invalid event type', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', url: 'https://example.com/hook', events: ['not.a.real.event'] });

    expect(response.status).toBe(400);
  });

  it('creates a webhook and returns the generated secret', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('INSERT INTO webhooks')) return Promise.resolve([{ id: 5 }]);
      if (query.startsWith('SELECT * FROM webhooks WHERE id')) {
        return Promise.resolve([{ id: 5, name: 'Test', url: 'https://example.com/hook', events: '["course.published"]' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', url: 'https://example.com/hook', events: ['course.published'] });

    expect(response.status).toBe(201);
    expect(response.body.data.secret).toEqual(expect.any(String));
    expect(response.body.data.events).toEqual(['course.published']);
  });
});
