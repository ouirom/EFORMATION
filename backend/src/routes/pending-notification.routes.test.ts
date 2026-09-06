import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import pendingNotificationRoutes from './pending-notification.routes';
import { DatabaseService } from '../services/database.service';
import { NotificationService } from '../services/notification.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedSend = NotificationService.send as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/notifications/pending', pendingNotificationRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

const adminPayload = { id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' };
const adminToken = tokenFor(adminPayload);

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, tenant_id: 10, email: 'admin@test.com', display_name: 'Admin',
    avatar_url: null, role: 'admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

function pendingRow(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    tenant_id: 10,
    user_id: 42,
    event_type: 'account_created',
    channel: 'email',
    subject: 'Subject',
    body: 'Body',
    action_url: null,
    metadata: null,
    status: 'pending',
    triggered_by: 1,
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  mockedSend.mockResolvedValue({ id: 1, status: 'sent', channel: 'email' });
});

describe('GET /notifications/pending', () => {
  it('lists pending items scoped to the caller\'s tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM pending_notifications')) {
        return Promise.resolve([
          { ...pendingRow(), recipient_name: 'Jane', recipient_email: 'jane@example.com', triggered_by_name: 'Admin' },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/notifications/pending').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ id: 1, recipientEmail: 'jane@example.com' });
  });
});

describe('PUT /notifications/pending/:id/approve', () => {
  it('sends the queued notification and marks it approved', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM pending_notifications WHERE id')) return Promise.resolve([pendingRow()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/notifications/pending/1/approve')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(mockedSend).toHaveBeenCalledWith(expect.objectContaining({ userId: 42 }));
  });

  it('rejects with 403 when a non-admin, non-triggering user tries to approve', async () => {
    const agentToken = tokenFor({ id: 77, tenantId: 10, email: 'agent@test.com', role: 'agent' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 77, role: 'agent', email: 'agent@test.com' })]);
      }
      if (query.includes('FROM pending_notifications WHERE id')) return Promise.resolve([pendingRow({ triggered_by: 1 })]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/notifications/pending/1/approve')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
    expect(mockedSend).not.toHaveBeenCalled();
  });
});

describe('PUT /notifications/pending/:id/reject', () => {
  it('marks the notification rejected without sending it', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM pending_notifications WHERE id')) return Promise.resolve([pendingRow()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/notifications/pending/1/reject')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining("status = 'rejected'"), expect.anything());
  });
});
