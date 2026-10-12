import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { DatabaseService } from '../services/database.service';
import { AuditService } from '../services/audit.service';
import { SessionService, hashJti } from '../services/session.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/audit.service');
jest.mock('../services/notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedAudit = AuditService.log as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(tenantMiddleware);
  app.use('/auth', authRoutes);
  app.use('/users', userRoutes);
  app.use(errorHandler);
  return app;
}

const accessToken = (claims: Record<string, any>) => jwt.sign(claims, config.jwt.secret, { expiresIn: '1h' });
const refreshToken = (claims: Record<string, any>) =>
  jwt.sign({ type: 'refresh', tokenVersion: 0, authTime: Math.floor(Date.now() / 1000), ...claims }, config.jwt.refreshSecret, {
    expiresIn: '1h',
  });

function userRow(overrides: Record<string, any> = {}) {
  return {
    id: 42, tenant_id: 10, email: 'jane@test.com', display_name: 'Jane', avatar_url: null, role: 'agent',
    enterprise_id: null, subsidiary_id: null, direction_id: null, service_id: null, is_active: true, token_version: 0,
    ...overrides,
  };
}

/** DB stub: the users lookup of authenticate(), and whichever sessions are live. */
function mockDb({ liveSids = ['sid-1'], user = userRow(), extra }: { liveSids?: string[]; user?: any; extra?: (q: string, p: any) => any } = {}) {
  mockedQuery.mockImplementation((query: string, params: any) => {
    const custom = extra?.(query, params);
    if (custom !== undefined) return Promise.resolve(custom);
    if (query.includes('FROM user_sessions') && query.includes('WHERE sid = @sid AND revoked_at IS NULL')) {
      return Promise.resolve(liveSids.includes(params.sid) ? [{ user_id: user.id }] : []);
    }
    if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([user]);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  SessionService.clearCache();
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
});

describe('authenticate and sessions', () => {
  it('accepts an access token whose session is live', async () => {
    mockDb();
    const res = await request(makeApp())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken({ id: 42, tenantId: 10, email: 'jane@test.com', role: 'agent', sid: 'sid-1' })}`);
    expect(res.status).toBe(200);
  });

  it('rejects an access token whose session was revoked, with SESSION_REVOKED', async () => {
    mockDb({ liveSids: [] });
    const res = await request(makeApp())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken({ id: 42, tenantId: 10, email: 'jane@test.com', role: 'agent', sid: 'sid-1' })}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
  });

  it('never takes another kind of token signed with the same secret for an access token', async () => {
    mockDb();
    const resetToken = jwt.sign({ id: 42, userId: 42, tenantId: 10, type: 'password_reset', tokenVersion: 0 }, config.jwt.secret);
    const res = await request(makeApp()).get('/auth/me').set('Authorization', `Bearer ${resetToken}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token and returns the new one', async () => {
    mockDb();
    const res = await request(makeApp())
      .post('/auth/refresh')
      .send({ refreshToken: refreshToken({ id: 42, sid: 'sid-1', jti: 'jti-1' }) });

    expect(res.status).toBe(200);
    const newRefresh = jwt.verify(res.body.data.refreshToken, config.jwt.refreshSecret) as any;
    expect(newRefresh).toMatchObject({ id: 42, sid: 'sid-1', type: 'refresh' });
    expect(newRefresh.jti).not.toBe('jti-1');
    expect(jwt.verify(res.body.data.accessToken, config.jwt.secret)).toMatchObject({ id: 42, sid: 'sid-1' });
    const rotateCall = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('previous_jti_hash = refresh_jti_hash'));
    expect(rotateCall[1]).toMatchObject({ sid: 'sid-1', presentedHash: hashJti('jti-1') });
    expect(res.headers['set-cookie']?.[0]).toContain('refreshToken=');
  });

  it('refuses a replayed (already rotated) refresh token and revokes the session', async () => {
    mockedExecute.mockImplementation((query: string) =>
      Promise.resolve({ rowsAffected: query.includes('previous_jti_hash = refresh_jti_hash') ? 0 : 1 })
    );
    mockDb({
      extra: (query) =>
        query.includes('AS since_rotation')
          ? [{ tenant_id: 10, user_id: 42, previous_jti_hash: hashJti('jti-1'), revoked_at: null, alive: 1, since_rotation: 3600 }]
          : undefined,
    });

    const res = await request(makeApp())
      .post('/auth/refresh')
      .send({ refreshToken: refreshToken({ id: 42, sid: 'sid-1', jti: 'jti-1' }) });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('SET revoked_at'), { sid: 'sid-1', reason: 'reuse_detected' });
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, 'SESSION_REUSE_DETECTED', 'users', 42, expect.anything());
  });

  it('refuses a refresh token from before sessions existed (no sid)', async () => {
    mockDb();
    const legacy = jwt.sign({ id: 42, type: 'refresh', tokenVersion: 0 }, config.jwt.refreshSecret, { expiresIn: '1h' });
    const res = await request(makeApp()).post('/auth/refresh').send({ refreshToken: legacy });
    expect(res.status).toBe(401);
  });

  it('refuses a refresh token minted before a force-logout (token_version bumped)', async () => {
    mockDb({ user: userRow({ token_version: 1 }) });
    const res = await request(makeApp())
      .post('/auth/refresh')
      .send({ refreshToken: refreshToken({ id: 42, sid: 'sid-1', jti: 'jti-1', tokenVersion: 0 }) });
    expect(res.status).toBe(401);
    expect(mockedExecute).not.toHaveBeenCalledWith(expect.stringContaining('previous_jti_hash = refresh_jti_hash'), expect.anything());
  });
});

describe('POST /auth/logout', () => {
  it('revokes the session named by the refresh token, even without a valid access token', async () => {
    mockDb({ extra: (query) => (query.includes('SELECT tenant_id FROM users WHERE id = @userId') ? [{ tenant_id: 10 }] : undefined) });
    const res = await request(makeApp())
      .post('/auth/logout')
      .send({ refreshToken: refreshToken({ id: 42, sid: 'sid-1', jti: 'jti-1' }) });

    expect(res.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('SET revoked_at'), { sid: 'sid-1', reason: 'logout' });
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, 'USER_LOGOUT', 'users', 42, { sid: 'sid-1' });
  });

  it('revokes the session of the access token', async () => {
    mockDb();
    const res = await request(makeApp())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken({ id: 42, tenantId: 10, email: 'jane@test.com', role: 'agent', sid: 'sid-9' })}`);

    expect(res.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('SET revoked_at'), { sid: 'sid-9', reason: 'logout' });
  });
});

describe('my sessions', () => {
  const token = () => accessToken({ id: 42, tenantId: 10, email: 'jane@test.com', role: 'agent', sid: 'sid-1' });

  it('lists my live sessions and flags this device', async () => {
    mockDb({
      extra: (query, params) =>
        query.includes('ORDER BY last_used_at DESC')
          ? (expect(params).toEqual({ userId: 42 }),
            [
              { id: 5, sid: 'sid-1', auth_method: 'password', user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36', ip: '10.0.0.1', created_at: new Date(), last_used_at: new Date(), expires_at: new Date() },
              { id: 6, sid: 'sid-2', auth_method: 'password', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1', ip: '10.0.0.2', created_at: new Date(), last_used_at: new Date(), expires_at: new Date() },
            ])
          : undefined,
    });

    const res = await request(makeApp()).get('/auth/sessions').set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ id: 5, current: true, browser: 'Chrome', os: 'Windows', device: 'desktop' }),
      expect.objectContaining({ id: 6, current: false, browser: 'Safari', os: 'iOS', device: 'mobile' }),
    ]);
    expect(res.body.data[0].sid).toBeUndefined();
    // One session per user is on by default: the profile page says so.
    expect(res.body.meta).toEqual({ singleSessionPerUser: true });
  });

  it('signs out one of my own devices only', async () => {
    mockDb({ extra: (query, params) => (query.includes('WHERE id = @sessionId AND user_id = @userId') ? (params.sessionId === 6 ? [{ sid: 'sid-2' }] : []) : undefined) });

    const ok = await request(makeApp()).delete('/auth/sessions/6').set('Authorization', `Bearer ${token()}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.current).toBe(false);
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('SET revoked_at'), { sid: 'sid-2', reason: 'user_revoked' });

    const other = await request(makeApp()).delete('/auth/sessions/99').set('Authorization', `Bearer ${token()}`);
    expect(other.status).toBe(404);
  });

  it('signs out every other device but keeps this one', async () => {
    mockDb();
    const res = await request(makeApp()).post('/auth/sessions/revoke-others').set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    const call = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('sid <> @exceptSid'));
    expect(call[1]).toMatchObject({ userId: 42, exceptSid: 'sid-1', reason: 'others_revoked' });
  });
});

describe('POST /users/:id/force-logout', () => {
  const admin = userRow({ id: 1, role: 'admin', email: 'admin@test.com' });
  const adminToken = () => accessToken({ id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin', sid: 'sid-admin' });

  function mockTarget(target: Record<string, any> | null, requester = admin) {
    mockDb({
      liveSids: ['sid-admin', 'sid-agent'],
      user: requester,
      extra: (query) =>
        query.includes('supervisor_id') && query.includes('WHERE id = @userId AND tenant_id = @tenantId')
          ? (target ? [target] : [])
          : undefined,
    });
  }

  it('lets an admin close every session of a user and invalidate their tokens', async () => {
    mockTarget({ id: 42, role: 'agent', direction_id: null, service_id: null, supervisor_id: null });
    mockedExecute.mockResolvedValue({ rowsAffected: 2 });

    const res = await request(makeApp()).post('/users/42/force-logout').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.closedSessions).toBe(2);
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = @userId AND revoked_at IS NULL'), expect.objectContaining({ userId: 42, reason: 'admin_force_logout' }));
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('token_version = token_version + 1'), { userId: 42, tenantId: 10 });
    expect(mockedAudit).toHaveBeenCalledWith(10, 1, 'USER_FORCE_LOGOUT', 'users', 42, { closedSessions: 2 });
  });

  it('refuses a learner', async () => {
    mockTarget({ id: 43, role: 'agent', direction_id: null, service_id: null, supervisor_id: null }, userRow({ id: 42, role: 'agent' }));
    const res = await request(makeApp())
      .post('/users/43/force-logout')
      .set('Authorization', `Bearer ${accessToken({ id: 42, tenantId: 10, email: 'jane@test.com', role: 'agent', sid: 'sid-agent' })}`);
    expect(res.status).toBe(403);
  });

  it('refuses an admin acting on a super_admin', async () => {
    mockTarget({ id: 2, role: 'super_admin', direction_id: null, service_id: null, supervisor_id: null });
    const res = await request(makeApp()).post('/users/2/force-logout').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(403);
  });

  it('does not reach into another organization', async () => {
    mockTarget(null);
    const res = await request(makeApp()).post('/users/77/force-logout').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});
