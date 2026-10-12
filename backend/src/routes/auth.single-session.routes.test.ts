import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import authRoutes from './auth.routes';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { DatabaseService } from '../services/database.service';
import { AuditService } from '../services/audit.service';
import { NotificationService } from '../services/notification.service';
import { TenantSettingsService } from '../services/tenant-settings.service';
import { SessionService, hashJti } from '../services/session.service';
import { emitSessionsRevoked } from '../socket/sessionEvents';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/audit.service');
jest.mock('../services/notification.service');
jest.mock('../services/ldap.service');
jest.mock('../services/sso-config.service');
// Each test signs in several times: the per-IP login limiter would get in the way.
jest.mock('express-rate-limit', () => () => (_req: any, _res: any, next: any) => next());
jest.mock('../socket/sessionEvents', () => ({ emitSessionsRevoked: jest.fn(), sessionRoom: (sid: string) => `session:${sid}` }));

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedAudit = AuditService.log as jest.Mock;
const mockedSecurityEmail = NotificationService.sendSecurityEmail as jest.Mock;
const mockedEmit = emitSessionsRevoked as jest.Mock;

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await bcrypt.hash('Correct-Passw0rd', 4);
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(tenantMiddleware);
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

function userRow(overrides: Record<string, any> = {}) {
  return {
    id: 42, tenant_id: 10, email: 'jane@test.com', password_hash: passwordHash, display_name: 'Jane', avatar_url: null,
    role: 'agent', enterprise_id: null, subsidiary_id: null, direction_id: null, service_id: null, is_active: true,
    status: 'active', token_version: 0, failed_login_attempts: 0, locked_until: null, external_company: null,
    two_factor_enabled: false, password_set_at: new Date(), db_now: new Date(), ...overrides,
  };
}

interface SessionRecord {
  id: number;
  sid: string;
  user_id: number;
  tenant_id: number;
  refresh_jti_hash: string;
  previous_jti_hash: string | null;
  revoked_at: Date | null;
  revoked_reason: string | null;
  ip: string | null;
  user_agent: string | null;
}

let sessions: SessionRecord[] = [];
let challenges: Record<string, any>[] = [];

/**
 * DB stub with small in-memory user_sessions and two_factor_challenges tables,
 * so whole sign-ins run through the real AuthService / SessionService.
 */
function mockDb({ single = true, twoFactor = 'off', user = userRow() }: { single?: boolean; twoFactor?: string; user?: any } = {}) {
  mockedQuery.mockImplementation((query: string, params: any) => {
    if (query.includes('FROM tenant_settings')) {
      return Promise.resolve([{ single_session_per_user: single, two_factor_mode: twoFactor, new_device_alerts: false }]);
    }
    if (query.includes('FROM tenants')) return Promise.resolve([{ id: params.targetTenantId, name: 'Other org' }]);
    if (query.includes('FROM two_factor_challenges')) {
      return Promise.resolve(
        challenges
          .filter((c) => c.token_hash === params.tokenHash && (!params.purpose || c.purpose === params.purpose))
          .map((c) => ({ ...c, alive: 1, since_sent: 120, email: user.email, display_name: user.display_name }))
      );
    }
    if (query.includes('FROM user_sessions')) {
      if (query.includes('AND id < (SELECT id')) {
        const keep = sessions.find((s) => s.sid === params.keepSid)!;
        return Promise.resolve(
          sessions.filter((s) => s.user_id === params.userId && !s.revoked_at && s.sid !== keep.sid && s.id < keep.id)
        );
      }
      if (query.includes('AS since_rotation')) {
        return Promise.resolve(
          sessions.filter((s) => s.sid === params.sid).map((s) => ({ ...s, alive: 1, since_rotation: 3600 }))
        );
      }
      if (query.includes('revoked_at IS NOT NULL')) {
        return Promise.resolve(sessions.filter((s) => s.sid === params.sid && s.revoked_at));
      }
      if (query.includes('WHERE sid = @sid AND revoked_at IS NULL')) {
        return Promise.resolve(sessions.filter((s) => s.sid === params.sid && !s.revoked_at));
      }
      return Promise.resolve([]);
    }
    if (query.includes('FROM users')) return Promise.resolve([user]);
    return Promise.resolve([]);
  });

  mockedExecute.mockImplementation((query: string, params: any) => {
    if (query.includes('INSERT INTO user_sessions')) {
      sessions.push({
        id: sessions.length + 1, sid: params.sid, user_id: params.userId, tenant_id: params.tenantId,
        refresh_jti_hash: params.jtiHash, previous_jti_hash: null, revoked_at: null, revoked_reason: null,
        ip: params.ip, user_agent: params.userAgent,
      });
      return Promise.resolve({ rowsAffected: 1 });
    }
    if (query.includes('UPDATE user_sessions') && query.includes('SET revoked_at') && params.sid) {
      const session = sessions.find((s) => s.sid === params.sid && !s.revoked_at);
      if (!session) return Promise.resolve({ rowsAffected: 0 });
      session.revoked_at = new Date();
      session.revoked_reason = params.reason;
      return Promise.resolve({ rowsAffected: 1 });
    }
    if (query.includes('previous_jti_hash = refresh_jti_hash')) {
      const session = sessions.find(
        (s) => s.sid === params.sid && !s.revoked_at && (!params.presentedHash || s.refresh_jti_hash === params.presentedHash)
      );
      if (!session) return Promise.resolve({ rowsAffected: 0 });
      session.previous_jti_hash = session.refresh_jti_hash;
      session.refresh_jti_hash = params.newHash;
      return Promise.resolve({ rowsAffected: 1 });
    }
    if (query.includes('INSERT INTO two_factor_challenges')) {
      challenges.push({
        id: challenges.length + 1, token_hash: params.tokenHash, tenant_id: params.tenantId, user_id: params.userId,
        purpose: params.purpose, auth_method: params.authMethod, portal: params.portal, code_hash: params.codeHash,
        attempts: 0, send_count: 1, consumed_at: null,
      });
    }
    const challenge = challenges.find((c) => c.id === params?.id);
    if (challenge && query.includes('SET consumed_at')) challenge.consumed_at = new Date();
    return Promise.resolve({ rowsAffected: 1 });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  TenantSettingsService.clearCache();
  SessionService.clearCache();
  sessions = [];
  challenges = [];
  mockedSecurityEmail.mockResolvedValue('id');
});

const login = (userAgent = 'Mozilla/5.0 Firefox/130.0') =>
  request(makeApp())
    .post('/auth/login')
    .set('X-Tenant-Id', '10')
    .set('User-Agent', userAgent)
    .send({ email: 'jane@test.com', password: 'Correct-Passw0rd' });

const me = (accessToken: string) => request(makeApp()).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
const sidOf = (accessToken: string) => (jwt.verify(accessToken, config.jwt.secret) as any).sid as string;

describe('one active session per user', () => {
  it('a new login signs the other device out, which then gets 401 SESSION_REPLACED', async () => {
    mockDb({ single: true });
    const first = await login('Device A');
    const second = await login('Device B');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const firstSid = sidOf(first.body.data.accessToken);
    expect(sessions.find((s) => s.sid === firstSid)).toMatchObject({ revoked_reason: 'replaced_by_new_login' });

    SessionService.clearCache();
    const kicked = await me(first.body.data.accessToken);
    expect(kicked.status).toBe(401);
    expect(kicked.body.error.code).toBe('SESSION_REPLACED');
    expect((await me(second.body.data.accessToken)).status).toBe(200);

    // The kicked device can't come back with its refresh token either.
    const refresh = await request(makeApp()).post('/auth/refresh').send({ refreshToken: first.body.data.refreshToken });
    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe('SESSION_REPLACED');
  });

  it('closes the other session even while it is cached as live in this process', async () => {
    mockDb({ single: true });
    const first = await login('Device A');
    expect((await me(first.body.data.accessToken)).status).toBe(200); // now cached
    await login('Device B');
    expect((await me(first.body.data.accessToken)).body.error.code).toBe('SESSION_REPLACED');
  });

  it('audits the replacement with the new device, and pushes it to the old session over the socket', async () => {
    mockDb({ single: true });
    const first = await login('Device A');
    await login('Device B');
    const firstSid = sidOf(first.body.data.accessToken);

    expect(mockedAudit).toHaveBeenCalledWith(
      10,
      42,
      'SESSION_REPLACED',
      'users',
      42,
      expect.objectContaining({ userAgent: 'Device B', closedSessions: 1 })
    );
    expect(mockedEmit).toHaveBeenCalledWith([firstSid], { reason: 'replaced_by_new_login' });
  });

  it('keeps every session when the organization turned the rule off', async () => {
    mockDb({ single: false });
    const first = await login('Device A');
    const second = await login('Device B');

    expect(sessions.every((s) => !s.revoked_at)).toBe(true);
    expect((await me(first.body.data.accessToken)).status).toBe(200);
    expect((await me(second.body.data.accessToken)).status).toBe(200);
    expect(mockedAudit).not.toHaveBeenCalledWith(10, 42, 'SESSION_REPLACED', expect.anything(), expect.anything(), expect.anything());
    expect(mockedEmit).not.toHaveBeenCalled();
  });

  it('does not treat a token refresh as a new login', async () => {
    mockDb({ single: true });
    const first = await login('Device A');
    const refreshed = await request(makeApp()).post('/auth/refresh').send({ refreshToken: first.body.data.refreshToken });

    expect(refreshed.status).toBe(200);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].revoked_at).toBeNull();
    expect(sessions[0].refresh_jti_hash).toBe(hashJti((jwt.verify(refreshed.body.data.refreshToken, config.jwt.refreshSecret) as any).jti));
    SessionService.clearCache();
    expect((await me(refreshed.body.data.accessToken)).status).toBe(200);
    expect((await me(first.body.data.accessToken)).status).toBe(200); // same session: the other tabs keep working
    expect(mockedEmit).not.toHaveBeenCalled();
  });

  it('with two-step sign-in, signs the other device out only once the code is entered', async () => {
    // Device A already has a session (e.g. from before 2FA was required).
    mockDb({ single: true, twoFactor: 'off' });
    const first = await login('Device A');
    TenantSettingsService.clearCache();
    mockDb({ single: true, twoFactor: 'required' });

    const challenge = await login('Device B');
    expect(challenge.body.data.twoFactorRequired).toBe(true);
    expect(sessions.every((s) => !s.revoked_at)).toBe(true);

    const code = (mockedSecurityEmail.mock.calls.at(-1)![3] as string).match(/\b(\d{6})\b/)![1];
    const wrong = code === '000000' ? '111111' : '000000';
    await request(makeApp()).post('/auth/2fa/verify').send({ challengeToken: challenge.body.data.challengeToken, code: wrong });
    expect(sessions.every((s) => !s.revoked_at)).toBe(true);

    const verified = await request(makeApp())
      .post('/auth/2fa/verify')
      .send({ challengeToken: challenge.body.data.challengeToken, code });
    expect(verified.status).toBe(200);
    SessionService.clearCache();
    expect((await me(first.body.data.accessToken)).body.error.code).toBe('SESSION_REPLACED');
    expect((await me(verified.body.data.accessToken)).status).toBe(200);
  });

  it('keeps the session a super_admin switches tenant from (not a new login)', async () => {
    const admin = userRow({ id: 7, role: 'super_admin', email: 'root@test.com' });
    mockDb({ single: true, user: admin });
    const first = await request(makeApp())
      .post('/auth/login')
      .set('X-Tenant-Id', '10')
      .send({ email: 'root@test.com', password: 'Correct-Passw0rd' });
    expect(first.status).toBe(200);

    const switched = await request(makeApp())
      .post('/auth/switch-tenant')
      .set('Authorization', `Bearer ${first.body.data.accessToken}`)
      .send({ tenantId: 99 });

    expect(switched.status).toBe(200);
    expect(sidOf(switched.body.data.accessToken)).toBe(sidOf(first.body.data.accessToken));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].revoked_at).toBeNull();
    SessionService.clearCache();
    expect((await me(first.body.data.accessToken)).status).toBe(200);
    expect(mockedEmit).not.toHaveBeenCalled();
  });

  it('a session revoked for another reason still answers SESSION_REVOKED', async () => {
    mockDb({ single: true });
    const first = await login('Device A');
    await SessionService.revoke(sidOf(first.body.data.accessToken), 'user_revoked');
    expect((await me(first.body.data.accessToken)).body.error.code).toBe('SESSION_REVOKED');
  });
});
