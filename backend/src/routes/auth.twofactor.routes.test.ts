import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import authRoutes from './auth.routes';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { DatabaseService } from '../services/database.service';
import { AuditService } from '../services/audit.service';
import { NotificationService } from '../services/notification.service';
import { LdapService } from '../services/ldap.service';
import { SsoConfigService } from '../services/sso-config.service';
import { TenantSettingsService } from '../services/tenant-settings.service';
import { SessionService } from '../services/session.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/audit.service');
jest.mock('../services/notification.service');
jest.mock('../services/ldap.service');
jest.mock('../services/sso-config.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedAudit = AuditService.log as jest.Mock;
const mockedSecurityEmail = NotificationService.sendSecurityEmail as jest.Mock;

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await bcrypt.hash('Correct-Passw0rd', 4);
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantMiddleware);
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

function loginRow(overrides: Record<string, any> = {}) {
  return {
    id: 42, tenant_id: 10, email: 'jane@test.com', password_hash: passwordHash, display_name: 'Jane', avatar_url: null,
    role: 'agent', enterprise_id: null, direction_id: null, service_id: null, is_active: true, status: 'active',
    token_version: 0, failed_login_attempts: 0, locked_until: null, external_company: null, two_factor_enabled: false,
    password_set_at: new Date(), db_now: new Date(), ...overrides,
  };
}

let challenges: Record<string, any>[] = [];

/**
 * DB stub with a tiny in-memory two_factor_challenges table, so a whole sign-in
 * (password -> emailed code -> session) runs through the real services.
 */
function mockDb({ mode = 'required', user = loginRow() }: { mode?: string; user?: Record<string, any> } = {}) {
  mockedQuery.mockImplementation((query: string, params: any) => {
    if (query.includes('FROM tenant_settings')) return Promise.resolve([{ two_factor_mode: mode }]);
    if (query.includes('FROM two_factor_challenges')) {
      return Promise.resolve(
        challenges
          .filter((c) => c.token_hash === params.tokenHash && (!params.purpose || c.purpose === params.purpose))
          .map((c) => ({ ...c, alive: 1, since_sent: 120, email: user.email, display_name: user.display_name }))
      );
    }
    if (query.includes('FROM user_sessions')) return Promise.resolve([{ user_id: user.id }]);
    if (query.includes('FROM users')) return Promise.resolve([user]);
    return Promise.resolve([]);
  });
  mockedExecute.mockImplementation((query: string, params: any) => {
    if (query.includes('INSERT INTO two_factor_challenges')) {
      challenges.push({
        id: challenges.length + 1, token_hash: params.tokenHash, tenant_id: params.tenantId, user_id: params.userId,
        purpose: params.purpose, auth_method: params.authMethod, portal: params.portal, code_hash: params.codeHash,
        attempts: 0, send_count: 1, consumed_at: null,
      });
    }
    const challenge = challenges.find((c) => c.id === params?.id);
    if (challenge && query.includes('attempts = attempts + 1')) challenge.attempts += 1;
    if (challenge && query.includes('SET consumed_at')) {
      if (challenge.consumed_at) return Promise.resolve({ rowsAffected: 0 });
      challenge.consumed_at = new Date();
    }
    return Promise.resolve({ rowsAffected: 1 });
  });
}

const emailedCode = () => (mockedSecurityEmail.mock.calls.at(-1)![3] as string).match(/\b(\d{6})\b/)![1];
const sessionInserts = () => mockedExecute.mock.calls.filter(([q]: [string]) => q.includes('INSERT INTO user_sessions'));

beforeEach(() => {
  jest.clearAllMocks();
  TenantSettingsService.clearCache();
  SessionService.clearCache();
  challenges = [];
  mockedSecurityEmail.mockResolvedValue('id');
});

const login = (body: Record<string, any>) =>
  request(makeApp()).post('/auth/login').set('X-Tenant-Id', '10').send({ email: 'jane@test.com', password: 'Correct-Passw0rd', ...body });

describe('sign-in with two-step verification', () => {
  it('answers with a challenge and no tokens when the organization requires it', async () => {
    mockDb({ mode: 'required' });
    const res = await login({});

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ twoFactorRequired: true, emailHint: 'j***@test.com', challengeToken: expect.any(String) });
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(sessionInserts()).toHaveLength(0);
    expect(mockedSecurityEmail).toHaveBeenCalledWith(10, 'jane@test.com', expect.any(String), expect.stringMatching(/\d{6}/));
  });

  it('opens the session once the emailed code is entered', async () => {
    mockDb({ mode: 'required' });
    const first = await login({});

    const res = await request(makeApp())
      .post('/auth/2fa/verify')
      .send({ challengeToken: first.body.data.challengeToken, code: emailedCode() });

    expect(res.status).toBe(200);
    expect(jwt.verify(res.body.data.accessToken, config.jwt.secret)).toMatchObject({ id: 42, sid: expect.any(String) });
    expect(sessionInserts()).toHaveLength(1);
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, '2FA_SUCCESS', 'users', 42, expect.anything());
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, 'USER_LOGIN', 'users', 42, expect.objectContaining({ twoFactor: true }));

    // The same code can't open a second session.
    const replay = await request(makeApp())
      .post('/auth/2fa/verify')
      .send({ challengeToken: first.body.data.challengeToken, code: emailedCode() });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('TWO_FACTOR_INVALID_CHALLENGE');
  });

  it('refuses a wrong code without opening a session', async () => {
    mockDb({ mode: 'required' });
    const first = await login({});
    const wrong = emailedCode() === '000000' ? '111111' : '000000';

    const res = await request(makeApp()).post('/auth/2fa/verify').send({ challengeToken: first.body.data.challengeToken, code: wrong });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TWO_FACTOR_INVALID_CODE');
    expect(sessionInserts()).toHaveLength(0);
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, '2FA_FAILED', 'users', 42, expect.anything());
  });

  it('still refuses staff on the external portal, before sending any code', async () => {
    mockDb({ mode: 'required', user: loginRow({ role: 'agent' }) });
    const res = await login({ portal: 'external' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WRONG_PORTAL');
    expect(mockedSecurityEmail).not.toHaveBeenCalled();
  });

  it('re-checks the portal when the code is entered (role changed meanwhile)', async () => {
    mockDb({ mode: 'required', user: loginRow({ role: 'externe' }) });
    const first = await login({ portal: 'external' });
    expect(first.body.data.twoFactorRequired).toBe(true);

    mockDb({ mode: 'required', user: loginRow({ role: 'agent' }) });
    const res = await request(makeApp()).post('/auth/2fa/verify').send({ challengeToken: first.body.data.challengeToken, code: emailedCode() });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WRONG_PORTAL');
    expect(sessionInserts()).toHaveLength(0);
  });

  it('refuses a code once the account was suspended in between', async () => {
    mockDb({ mode: 'required' });
    const first = await login({});
    mockDb({ mode: 'required', user: loginRow({ status: 'suspended', is_active: false }) });

    const res = await request(makeApp()).post('/auth/2fa/verify').send({ challengeToken: first.body.data.challengeToken, code: emailedCode() });
    expect(res.status).toBe(401);
  });

  it("follows each user's choice in optional mode", async () => {
    mockDb({ mode: 'optional', user: loginRow({ two_factor_enabled: false }) });
    expect((await login({})).body.data.accessToken).toEqual(expect.any(String));

    TenantSettingsService.clearCache();
    mockDb({ mode: 'optional', user: loginRow({ two_factor_enabled: true }) });
    expect((await login({})).body.data.twoFactorRequired).toBe(true);
  });

  it('is skipped entirely when off (the default)', async () => {
    mockDb({ mode: 'off', user: loginRow({ two_factor_enabled: true }) });
    expect((await login({})).body.data.accessToken).toEqual(expect.any(String));
    expect(mockedSecurityEmail).not.toHaveBeenCalled();
  });

  it('also applies to directory (LDAP) sign-ins', async () => {
    (SsoConfigService.get as jest.Mock).mockResolvedValue({ ldap: { url: 'ldap://x' } });
    (LdapService.authenticate as jest.Mock).mockResolvedValue({ email: 'jane@test.com', displayName: 'Jane' });
    mockDb({ mode: 'required' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM tenant_settings')) return Promise.resolve([{ two_factor_mode: 'required' }]);
      if (query.includes('SELECT id, tenant_id, is_active FROM users')) return Promise.resolve([{ id: 42, tenant_id: 10, is_active: true }]);
      if (query.includes('FROM users WHERE id = @userId')) return Promise.resolve([loginRow()]);
      return Promise.resolve([]);
    });

    const res = await request(makeApp()).post('/auth/ldap/login').set('X-Tenant-Id', '10').send({ username: 'jane', password: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.data.twoFactorRequired).toBe(true);
    expect(res.body.data.accessToken).toBeUndefined();
    expect(challenges[0]).toMatchObject({ auth_method: 'ldap' });
  });
});

describe('POST /auth/2fa/resend', () => {
  it('throttles to one email a minute', async () => {
    mockDb({ mode: 'required' });
    const first = await login({});
    // The stub reports the last email as sent 120 s ago; make it recent.
    const original = mockedQuery.getMockImplementation()!;
    mockedQuery.mockImplementation((q: string, p: any) =>
      q.includes('since_sent') ? Promise.resolve([{ ...challenges[0], since_sent: 5, email: 'jane@test.com' }]) : original(q, p)
    );

    const res = await request(makeApp()).post('/auth/2fa/resend').send({ challengeToken: first.body.data.challengeToken });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TWO_FACTOR_RESEND_TOO_SOON');
  });
});

describe('turning two-step sign-in on and off (optional mode)', () => {
  const token = () => jwt.sign({ id: 42, tenantId: 10, email: 'jane@test.com', role: 'agent', sid: 'sid-1' }, config.jwt.secret);
  const authUser = loginRow();

  it('turns it on only with the code emailed to the user', async () => {
    mockDb({ mode: 'optional', user: authUser });
    const start = await request(makeApp()).post('/auth/2fa/enable/start').set('Authorization', `Bearer ${token()}`);
    expect(start.status).toBe(200);
    expect(challenges[0]).toMatchObject({ purpose: 'enable', user_id: 42 });

    const res = await request(makeApp())
      .post('/auth/2fa/enable/confirm')
      .set('Authorization', `Bearer ${token()}`)
      .send({ challengeToken: start.body.data.challengeToken, code: emailedCode() });

    expect(res.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('SET two_factor_enabled'), { enabled: true, id: 42 });
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, '2FA_ENABLED', 'users', 42);
  });

  it('does not accept a sign-in code to turn it on', async () => {
    mockDb({ mode: 'optional', user: loginRow({ two_factor_enabled: true }) });
    // Another address: the sign-in rate limit (10 per IP + email) is shared by this file.
    const signIn = await login({ email: 'jane.other@test.com' });

    const res = await request(makeApp())
      .post('/auth/2fa/enable/confirm')
      .set('Authorization', `Bearer ${token()}`)
      .send({ challengeToken: signIn.body.data.challengeToken, code: emailedCode() });
    expect(res.status).toBe(400);
  });

  it('turns it off only with the current password', async () => {
    mockDb({ mode: 'optional', user: loginRow({ two_factor_enabled: true }) });

    const wrong = await request(makeApp()).post('/auth/2fa/disable').set('Authorization', `Bearer ${token()}`).send({ password: 'nope' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');
    expect(mockedExecute).not.toHaveBeenCalledWith(expect.stringContaining('SET two_factor_enabled'), expect.anything());

    const ok = await request(makeApp()).post('/auth/2fa/disable').set('Authorization', `Bearer ${token()}`).send({ password: 'Correct-Passw0rd' });
    expect(ok.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('SET two_factor_enabled'), { enabled: false, id: 42 });
  });

  it('cannot be turned off when the organization requires it', async () => {
    mockDb({ mode: 'required', user: loginRow({ two_factor_enabled: true }) });
    const res = await request(makeApp()).post('/auth/2fa/disable').set('Authorization', `Bearer ${token()}`).send({ password: 'Correct-Passw0rd' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TWO_FACTOR_NOT_OPTIONAL');

    const status = await request(makeApp()).get('/auth/2fa').set('Authorization', `Bearer ${token()}`);
    expect(status.body.data).toMatchObject({ mode: 'required', enabled: true, enforced: true, canToggle: false, hasPassword: true });
  });
});
