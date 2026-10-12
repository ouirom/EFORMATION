import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';
import {
  TenantSettingsService,
  isEmailDomainAllowed,
  parseEmailDomains,
  passwordPolicyViolation,
} from './tenant-settings.service';
import { AuthService } from './auth.service';
import authRoutes from '../routes/auth.routes';
import organizationRoutes from '../routes/organization.routes';
import userRoutes from '../routes/user.routes';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('./database.service');
jest.mock('./audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantMiddleware);
  app.use('/auth', authRoutes);
  app.use('/organizations', organizationRoutes);
  app.use('/users', userRoutes);
  app.use(errorHandler);
  return app;
}

const token = (role = 'admin', id = 3) => jwt.sign({ id, tenantId: 10, email: 'a@test.com', role }, config.jwt.secret);

function authRow(role = 'admin', id = 3) {
  return {
    id, tenant_id: 10, email: 'a@test.com', display_name: 'A', avatar_url: null, role,
    enterprise_id: null, direction_id: null, service_id: null, is_active: true, token_version: 0,
  };
}

const settingsRow = (overrides: Record<string, any> = {}) => ({
  allow_self_registration: true, default_language: 'fr', timezone: 'Europe/Paris',
  enable_notifications: true, enable_chat: true, enable_live_sessions: true,
  max_users_per_group: 50, certificate_validity: 365,
  password_min_length: 8, password_require_complexity: true, password_expiry_days: 0,
  max_login_attempts: 5, lockout_minutes: 15, session_idle_minutes: 5, session_max_days: 30,
  allowed_email_domains: null, require_registration_approval: true,
  ...overrides,
});

const NOW = new Date('2026-09-27T10:00:00');
let passwordHash: string;

function loginRow(overrides: Record<string, any> = {}) {
  return {
    id: 42, tenant_id: 10, email: 'jane@test.com', password_hash: passwordHash, display_name: 'Jane',
    avatar_url: null, role: 'agent', enterprise_id: null, direction_id: null, service_id: null,
    is_active: true, status: 'active', token_version: 0,
    failed_login_attempts: 0, locked_until: null, password_set_at: new Date('2026-09-01T10:00:00'), db_now: NOW,
    ...overrides,
  };
}

/** Mocks the DB: a settings row, the login row, and route-specific answers. */
function mockDb(
  settings: Record<string, any> | null,
  extra: (q: string, p: any) => any = () => undefined,
  user: Record<string, any> = loginRow()
) {
  mockedQuery.mockImplementation((query: string, params: any) => {
    if (query.includes('FROM tenant_settings')) return Promise.resolve(settings ? [settings] : []);
    if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([authRow()]);
    if (query.includes('password_set_at')) return Promise.resolve([user]);
    return Promise.resolve(extra(query, params) ?? []);
  });
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
}

const executed = (fragment: string) => mockedExecute.mock.calls.filter(([q]: [string]) => q.includes(fragment));

beforeAll(async () => {
  passwordHash = await bcrypt.hash('Correct-Passw0rd', 4);
});

beforeEach(() => {
  TenantSettingsService.clearCache();
  mockedQuery.mockReset();
  mockedExecute.mockReset();
  jest.spyOn(NotificationService, 'send').mockResolvedValue({ id: 1, status: 'sent', channel: 'email' } as any);
});

describe('password policy helpers', () => {
  it('checks the length and, when required, the complexity', () => {
    const policy = { passwordMinLength: 12, passwordRequireComplexity: true };
    expect(passwordPolicyViolation('Short-1a', policy)).toMatch(/at least 12/);
    expect(passwordPolicyViolation('longenoughpassword', policy)).toMatch(/uppercase/);
    expect(passwordPolicyViolation('Long-enough-passw0rd', policy)).toBeNull();
    expect(passwordPolicyViolation('longenoughpassword', { ...policy, passwordRequireComplexity: false })).toBeNull();
    // Never below the platform floor, whatever is stored.
    expect(passwordPolicyViolation('abc', { passwordMinLength: 2, passwordRequireComplexity: false })).toMatch(/at least 8/);
  });

  it('normalises and matches allowed email domains', () => {
    expect(parseEmailDomains(' Belife.ci, @Other.com;x.org  x.org')).toEqual(['belife.ci', 'other.com', 'x.org']);
    expect(isEmailDomainAllowed('jane@BELIFE.ci', ['belife.ci'])).toBe(true);
    expect(isEmailDomainAllowed('jane@evil.com', ['belife.ci'])).toBe(false);
    expect(isEmailDomainAllowed('jane@anything.com', [])).toBe(true);
  });
});

describe('login lockout', () => {
  const login = (password: string) =>
    request(makeApp()).post('/auth/login').set('X-Tenant-ID', '10').send({ email: 'jane@test.com', password });

  it('counts a wrong password', async () => {
    mockDb(settingsRow(), undefined, loginRow({ failed_login_attempts: 1 }));
    const response = await login('Wrong-passw0rd');
    expect(response.status).toBe(401);
    expect(executed('failed_login_attempts = @attempts')[0][1]).toEqual({ attempts: 2, id: 42 });
  });

  it('locks the account on the last allowed attempt', async () => {
    mockDb(settingsRow({ max_login_attempts: 3, lockout_minutes: 20 }), undefined, loginRow({ failed_login_attempts: 2 }));
    const response = await login('Wrong-passw0rd');
    expect(response.status).toBe(423);
    expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(response.body.error.message).toContain('20 minutes');
    // Minutes inlined into the date arithmetic (mssql dialect under test, pg in the app).
    expect(executed('locked_until =')[0][0]).toMatch(/minute.*20|20.*minute/);
  });

  it('refuses even the right password while locked, and says for how long', async () => {
    mockDb(settingsRow(), undefined, loginRow({ locked_until: new Date(NOW.getTime() + 4 * 60_000) }));
    const response = await login('Correct-Passw0rd');
    expect(response.status).toBe(423);
    expect(response.body.error.message).toContain('4 minutes');
  });

  it('lets the user in once the lock expired, and clears the counters', async () => {
    mockDb(settingsRow(), undefined, loginRow({ failed_login_attempts: 2, locked_until: new Date(NOW.getTime() - 60_000) }));
    const response = await login('Correct-Passw0rd');
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
    expect(executed('failed_login_attempts = 0, locked_until = NULL')).toHaveLength(1);
  });

  it('never locks when the organization set no limit', async () => {
    mockDb(settingsRow({ max_login_attempts: 0 }), undefined, loginRow({ failed_login_attempts: 50 }));
    const response = await login('Wrong-passw0rd');
    expect(response.status).toBe(401);
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('lets a manager lift a lock through POST /users/:id/unlock', async () => {
    mockDb(settingsRow(), (q) => (q.includes('FROM users WHERE id = @userId') ? [{ id: 42, role: 'agent' }] : undefined));
    const response = await request(makeApp()).post('/users/42/unlock').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(200);
    expect(executed('locked_until = NULL')[0][1]).toEqual({ userId: 42, tenantId: 10 });
  });
});

describe('password expiry', () => {
  it('opens no session for an expired password and hands out a short reset token instead', async () => {
    mockDb(settingsRow({ password_expiry_days: 20 }));
    const response = await request(makeApp())
      .post('/auth/login')
      .set('X-Tenant-ID', '10')
      .send({ email: 'jane@test.com', password: 'Correct-Passw0rd' });
    expect(response.status).toBe(200);
    expect(response.body.data.passwordExpired).toBe(true);
    expect(response.body.data.accessToken).toBeUndefined();
    const reset = jwt.verify(response.body.data.resetToken, config.jwt.secret) as any;
    expect(reset).toMatchObject({ userId: 42, type: 'password_reset', tokenVersion: 0 });
    expect(reset.exp - reset.iat).toBe(15 * 60);
  });

  it('lets a password younger than the limit through', async () => {
    mockDb(settingsRow({ password_expiry_days: 90 }));
    const response = await request(makeApp())
      .post('/auth/login')
      .set('X-Tenant-ID', '10')
      .send({ email: 'jane@test.com', password: 'Correct-Passw0rd' });
    expect(response.body.data.accessToken).toBeDefined();
  });

  it('refuses to "renew" an expired password with the same one', async () => {
    mockDb(settingsRow(), (q) =>
      q.includes('SELECT id, tenant_id, token_version, password_hash') ? [{ id: 42, tenant_id: 10, token_version: 0, password_hash: passwordHash }] : undefined
    );
    const resetToken = jwt.sign({ userId: 42, type: 'password_reset', tokenVersion: 0 }, config.jwt.secret);
    const response = await request(makeApp())
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword: 'Correct-Passw0rd' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PASSWORD_REUSED');
    expect(mockedExecute).not.toHaveBeenCalled();
  });
});

describe('maximum session length', () => {
  it('caps the tokens at what is left of the session', async () => {
    mockDb(settingsRow({ session_max_days: 1 }), (q) =>
      q.includes('FROM users WHERE id = @id AND deleted_at IS NULL') ? [{ ...authRow('agent', 42), token_version: 0 }] : undefined
    );
    const authTime = Math.floor(Date.now() / 1000) - 23 * 3600; // logged in 23 h ago
    const refreshToken = jwt.sign({ id: 42, type: 'refresh', tokenVersion: 0, authTime, sid: 'sid-1', jti: 'jti-1' }, config.jwt.refreshSecret);
    const tokens = await AuthService.refreshToken(refreshToken);
    expect(tokens.expiresIn).toBeLessThanOrEqual(3600);
    expect(tokens.expiresIn).toBeGreaterThan(3500);
    const refreshed = jwt.verify(tokens.refreshToken, config.jwt.refreshSecret) as any;
    expect(refreshed.authTime).toBe(authTime);
  });

  it('refuses to refresh a session older than the limit', async () => {
    mockDb(settingsRow({ session_max_days: 1 }), (q) =>
      q.includes('FROM users WHERE id = @id AND deleted_at IS NULL') ? [{ ...authRow('agent', 42), token_version: 0 }] : undefined
    );
    const authTime = Math.floor(Date.now() / 1000) - 25 * 3600;
    const refreshToken = jwt.sign({ id: 42, type: 'refresh', tokenVersion: 0, authTime, sid: 'sid-1', jti: 'jti-1' }, config.jwt.refreshSecret);
    await expect(AuthService.refreshToken(refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('self-registration', () => {
  const signUp = (email = 'new@belife.ci', password = 'Strong-Passw0rd') =>
    request(makeApp()).post('/auth/register').set('X-Tenant-ID', '10').send({ email, password, displayName: 'New' });

  it('refuses an email outside the allowed domains', async () => {
    mockDb(settingsRow({ allowed_email_domains: 'belife.ci' }));
    const response = await signUp('new@gmail.com');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect(response.body.error.message).toContain('@belife.ci');
  });

  it('accepts an allowed domain', async () => {
    mockDb(settingsRow({ allowed_email_domains: 'belife.ci' }), (q) => (q.includes('INSERT INTO users') ? [{ id: 77 }] : undefined));
    expect((await signUp()).status).toBe(201);
  });

  it("applies the organization's password length", async () => {
    mockDb(settingsRow({ password_min_length: 16 }));
    const response = await signUp('new@belife.ci', 'Strong-Passw0rd');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('16');
  });

  it('creates an active account right away when approval is off', async () => {
    mockDb(settingsRow({ require_registration_approval: false }), (q) => (q.includes('INSERT INTO users') ? [{ id: 77 }] : undefined));
    const response = await signUp();
    expect(response.status).toBe(201);
    expect(response.body.data.pending).toBe(false);
    const [, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO users'));
    expect(params).toMatchObject({ status: 'active', isActive: true });
  });

  it('publishes the rules the sign-up form needs', async () => {
    mockDb(settingsRow({ password_min_length: 12, password_require_complexity: false, allowed_email_domains: 'belife.ci' }));
    const response = await request(makeApp()).get('/auth/registration-settings').set('X-Tenant-ID', '10');
    expect(response.body.data).toMatchObject({
      allowedEmailDomains: ['belife.ci'],
      passwordPolicy: { minLength: 12, requireComplexity: false },
    });
  });
});

describe('SSO provisioning', () => {
  it('refuses to create an account outside the allowed domains', async () => {
    mockDb(settingsRow({ allowed_email_domains: 'belife.ci' }));
    await expect(
      AuthService.handleSSOLogin('google', 'ext-1', { email: 'someone@gmail.com', displayName: 'X', tenantId: 10 })
    ).rejects.toMatchObject({ statusCode: 403, code: 'EMAIL_DOMAIN_NOT_ALLOWED' });
  });

  it('refuses a suspended account', async () => {
    mockDb(settingsRow(), (q) => {
      if (q.includes('FROM sso_identities')) return [{ user_id: 42, tenant_id: 10 }];
      if (q.includes('FROM users WHERE id = @userId')) return [{ ...authRow('agent', 42), token_version: 0, status: 'suspended' }];
      return undefined;
    });
    await expect(
      AuthService.handleSSOLogin('google', 'ext-1', { email: 'jane@test.com', displayName: 'Jane' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('PUT /organizations/current/settings (security)', () => {
  const save = (body: Record<string, any>) =>
    request(makeApp()).put('/organizations/current/settings').set('Authorization', `Bearer ${token()}`).send(body);

  it('stores the security settings, normalising the domains', async () => {
    mockDb(settingsRow(), (q) => (q.includes('SELECT id FROM tenant_settings') ? [{ id: 1 }] : undefined));
    const response = await save({ maxLoginAttempts: 3, sessionIdleMinutes: 30, allowedEmailDomains: '@Belife.ci, other.com' });
    expect(response.status).toBe(200);
    const [, params] = executed('UPDATE tenant_settings')[0];
    expect(params).toMatchObject({ maxLoginAttempts: 3, sessionIdleMinutes: 30, allowedEmailDomains: 'belife.ci,other.com', passwordMinLength: 8 });
  });

  it.each([
    [{ passwordMinLength: 6 }],
    [{ sessionIdleMinutes: 1 }],
    [{ allowedEmailDomains: 'not a domain!' }],
  ])('rejects %j', async (body) => {
    mockDb(settingsRow());
    expect((await save(body)).status).toBe(400);
  });
});
