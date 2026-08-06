import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import analyticsRoutes from './analytics.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

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
    id: 1, tenant_id: 10, email: 'manager@test.com', display_name: 'Manager',
    avatar_url: null, role: 'manager', enterprise_id: null, direction_id: null, service_id: 5, is_active: true,
    ...overrides,
  };
}

const token = tokenFor({ id: 1, tenantId: 10, email: 'manager@test.com', role: 'manager', serviceId: 5 });

describe('GET /analytics/my-team/report-settings', () => {
  it('returns sensible defaults when no subscription exists yet', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM team_report_subscriptions')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/analytics/my-team/report-settings').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ isEnabled: false, frequency: 'weekly', weekday: 1, channelEmail: true, channelInApp: true, lastSentAt: null });
  });

  it('returns the stored subscription when one exists', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM team_report_subscriptions')) {
        return Promise.resolve([{ is_enabled: true, frequency: 'daily', weekday: null, channel_email: true, channel_in_app: false, last_sent_at: '2026-08-01T08:00:00.000Z' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/analytics/my-team/report-settings').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      isEnabled: true, frequency: 'daily', weekday: null, channelEmail: true, channelInApp: false, lastSentAt: '2026-08-01T08:00:00.000Z',
    });
  });
});

describe('PUT /analytics/my-team/report-settings', () => {
  it('inserts a new subscription', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id FROM team_report_subscriptions')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });

    const response = await request(makeApp())
      .put('/analytics/my-team/report-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ isEnabled: true, frequency: 'weekly', weekday: 3, channelEmail: true, channelInApp: false });

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO team_report_subscriptions'),
      expect.objectContaining({ isEnabled: true, frequency: 'weekly', weekday: 3, channelEmail: true, channelInApp: false })
    );
  });

  it('updates an existing subscription and forces weekday to null for daily', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id FROM team_report_subscriptions')) return Promise.resolve([{ id: 9 }]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });

    const response = await request(makeApp())
      .put('/analytics/my-team/report-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ isEnabled: true, frequency: 'daily', weekday: 3, channelEmail: true, channelInApp: true });

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE team_report_subscriptions'),
      expect.objectContaining({ frequency: 'daily', weekday: null })
    );
  });

  it('returns 400 for an invalid frequency', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/analytics/my-team/report-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ isEnabled: true, frequency: 'monthly', channelEmail: true, channelInApp: true });

    expect(response.status).toBe(400);
  });
});

describe('POST /analytics/my-team/report/run', () => {
  it('returns 403 for a non-admin', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).post('/analytics/my-team/report/run').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
