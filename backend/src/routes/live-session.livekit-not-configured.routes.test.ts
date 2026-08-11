// Forces config.livekit.* empty regardless of what's in the real backend/.env
// (which may well have real credentials, e.g. for local dev) -- this test's
// whole point is the "not configured anywhere" fallback path: no tenant row
// in livekit_settings AND no global env fallback. Must fail with a clear
// message instead of throwing "api-key and api-secret must be set" from
// inside the SDK.
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../config', () => ({
  config: { ...jest.requireActual('../config').config, livekit: { url: '', apiKey: '', apiSecret: '' } },
}));
jest.mock('../services/database.service');

import liveSessionRoutes from './live-session.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/live-sessions', liveSessionRoutes);
  app.use(errorHandler);
  return app;
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 5, tenant_id: 10, email: 'attendee@test.com', display_name: 'Attendee Name',
    avatar_url: null, role: 'agent', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

it('returns a clear error instead of crashing when LiveKit has no credentials configured', async () => {
  expect(config.livekit.url).toBe('');
  expect(config.livekit.apiKey).toBe('');
  expect(config.livekit.apiSecret).toBe('');

  const token = jwt.sign({ id: 5, tenantId: 10, email: 'attendee@test.com', role: 'agent' }, config.jwt.secret);
  mockedQuery.mockImplementation((query: string) => {
    if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
    return Promise.resolve([]);
  });

  const response = await request(makeApp())
    .post('/live-sessions/1/livekit-token')
    .set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(500);
  expect(response.body.error.message).toMatch(/LiveKit/);
});
