import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import notificationRoutes from './notification.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/notifications', notificationRoutes);
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

describe('GET /notifications', () => {
  it('returns the caller\'s own notifications with an unread count', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT COUNT(*) as total')) return Promise.resolve([{ total: 2 }]);
      if (query.startsWith('SELECT COUNT(*) as count')) return Promise.resolve([{ count: 1 }]);
      if (query.includes('FROM notifications') && query.includes('ORDER BY created_at')) {
        return Promise.resolve([{ id: 1, user_id: 3, read_at: null }, { id: 2, user_id: 3, read_at: '2026-08-01' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/notifications')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta.unreadCount).toBe(1);
  });
});

describe('PUT /notifications/:id/read', () => {
  it('marks a notification as read, scoped to the caller', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .put('/notifications/5/read')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    const updateCall = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('UPDATE notifications SET read_at'));
    expect(updateCall[1]).toMatchObject({ notificationId: 5, userId: 3 });
  });
});

describe('DELETE /notifications/:id', () => {
  it('only deletes the caller\'s own notification', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .delete('/notifications/7')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    const deleteCall = mockedExecute.mock.calls.find(([q]: [string]) => q.startsWith('DELETE FROM notifications'));
    expect(deleteCall[1]).toMatchObject({ notificationId: 7, userId: 3 });
  });
});

describe('GET /notifications/preferences', () => {
  it('returns real, sensible defaults when the user has none saved yet', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT * FROM notification_preferences')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/notifications/preferences')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ email: true, sms: false, push_web: true });
  });
});
