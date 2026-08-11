// Must be set before config/index.ts is first imported (by any module below) --
// config reads process.env once at module load time.
process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
process.env.LIVEKIT_API_KEY = 'test-api-key';
process.env.LIVEKIT_API_SECRET = 'test-api-secret-thats-long-enough';

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import liveSessionRoutes from './live-session.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/live-sessions', liveSessionRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

// authenticate() looks the caller up by id/tenant on every request (this is
// where req.user.displayName actually comes from -- the JWT payload itself
// doesn't carry it) -- every test needs this branch mocked or auth 401s first.
function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 5, tenant_id: 10, email: 'attendee@test.com', display_name: 'Attendee Name',
    avatar_url: null, role: 'agent', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

const attendeeToken = tokenFor({ id: 5, tenantId: 10, email: 'attendee@test.com', role: 'agent' });
const organizerToken = tokenFor({ id: 2, tenantId: 10, email: 'organizer@test.com', role: 'manager' });

describe('POST /live-sessions/:id/livekit-token', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  });

  it('returns 404 when the session does not exist in the caller\'s tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/live-sessions/1/livekit-token')
      .set('Authorization', `Bearer ${attendeeToken}`);

    expect(response.status).toBe(404);
  });

  it('rejects when the session is not currently live', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id, status, organizer_id')) {
        return Promise.resolve([{ id: 1, status: 'scheduled', organizer_id: 2 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/live-sessions/1/livekit-token')
      .set('Authorization', `Bearer ${attendeeToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SESSION_NOT_LIVE');
  });

  it('mints a token for a new attendee and registers them as a participant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id, status, organizer_id')) {
        return Promise.resolve([{ id: 1, status: 'live', organizer_id: 2 }]);
      }
      if (query.includes('SELECT session_id FROM live_participants')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/live-sessions/1/livekit-token')
      .set('Authorization', `Bearer ${attendeeToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.url).toBe('wss://test.livekit.cloud');
    expect(response.body.data.roomName).toBe('session-10-1');
    expect(typeof response.body.data.token).toBe('string');

    const decoded: any = jwt.decode(response.body.data.token);
    expect(decoded.video.room).toBe('session-10-1');
    expect(decoded.video.roomJoin).toBe(true);
    expect(decoded.video.roomAdmin).toBe(false);
    expect(decoded.sub).toBe('5');
    expect(decoded.name).toBe('Attendee Name');

    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO live_participants'),
      expect.objectContaining({ userId: 5, role: 'attendee' })
    );
  });

  it('grants roomAdmin to the organizer and refreshes their existing participant row', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'organizer@test.com', role: 'manager', display_name: 'Organizer Name' })]);
      }
      if (query.includes('SELECT id, status, organizer_id')) {
        return Promise.resolve([{ id: 1, status: 'live', organizer_id: 2 }]);
      }
      // Already a participant -- the host row inserted at session creation.
      if (query.includes('SELECT session_id FROM live_participants')) return Promise.resolve([{ session_id: 1 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/live-sessions/1/livekit-token')
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(response.status).toBe(200);
    const decoded: any = jwt.decode(response.body.data.token);
    expect(decoded.video.roomAdmin).toBe(true);
    expect(decoded.sub).toBe('2');

    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE live_participants'),
      expect.objectContaining({ userId: 2 })
    );
  });

  it('namespaces the room name by tenant so two tenants can never collide', async () => {
    const otherTenantToken = tokenFor({ id: 9, tenantId: 99, email: 'other@test.com', role: 'agent' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 9, tenant_id: 99, email: 'other@test.com', display_name: 'Other Tenant User' })]);
      }
      if (query.includes('SELECT id, status, organizer_id')) {
        return Promise.resolve([{ id: 1, status: 'live', organizer_id: 9 }]);
      }
      if (query.includes('SELECT session_id FROM live_participants')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/live-sessions/1/livekit-token')
      .set('Authorization', `Bearer ${otherTenantToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.roomName).toBe('session-99-1');
  });

  it("prefers the tenant's own enabled livekit_settings row over the global env fallback", async () => {
    // A tenant id never used by an earlier test in this file -- LiveKitService caches its
    // resolved config per tenant in a module-level Map that Jest's clearMocks doesn't
    // reset, so reusing tenant 10 here would silently return an already-cached result.
    const overrideTenantToken = tokenFor({ id: 20, tenantId: 55, email: 'override@test.com', role: 'agent' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 20, tenant_id: 55, email: 'override@test.com', display_name: 'Override Tenant User' })]);
      }
      if (query.includes('SELECT id, status, organizer_id')) {
        return Promise.resolve([{ id: 1, status: 'live', organizer_id: 2 }]);
      }
      if (query.includes('SELECT * FROM livekit_settings')) {
        return Promise.resolve([{
          enabled: true,
          url: 'wss://tenant-override.livekit.cloud',
          api_key: 'tenant-api-key',
          api_secret: 'tenant-api-secret-thats-long-enough',
        }]);
      }
      if (query.includes('SELECT session_id FROM live_participants')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/live-sessions/1/livekit-token')
      .set('Authorization', `Bearer ${overrideTenantToken}`);

    expect(response.status).toBe(200);
    // Tenant row wins, not the process.env.LIVEKIT_URL set at the top of this file.
    expect(response.body.data.url).toBe('wss://tenant-override.livekit.cloud');
  });
});
