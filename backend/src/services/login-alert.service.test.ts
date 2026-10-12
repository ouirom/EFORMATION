import jwt from 'jsonwebtoken';
import { LoginAlertService, isKnownDevice } from './login-alert.service';
import { AuthService } from './auth.service';
import { DatabaseService } from './database.service';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import { TenantSettingsService } from './tenant-settings.service';
import { SessionService } from './session.service';
import { config } from '../config';

jest.mock('./database.service');
jest.mock('./audit.service');
jest.mock('./notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedAudit = AuditService.log as jest.Mock;
const mockedSecurityEmail = NotificationService.sendSecurityEmail as jest.Mock;

const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

beforeEach(() => {
  jest.clearAllMocks();
  TenantSettingsService.clearCache();
  SessionService.clearCache();
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  mockedSecurityEmail.mockResolvedValue('id');
});

describe('new-device rule', () => {
  const seen = [{ user_agent: CHROME_WINDOWS, ip: '192.168.1.20' }];

  it('knows the same browser and OS from the same /24, even on a newer browser version or another box', () => {
    expect(isKnownDevice({ userAgent: CHROME_WINDOWS.replace('129.0', '130.0'), ip: '192.168.1.77' }, seen)).toBe(true);
  });

  it('flags another browser, another OS or another network', () => {
    expect(isKnownDevice({ userAgent: FIREFOX_LINUX, ip: '192.168.1.20' }, seen)).toBe(false);
    expect(isKnownDevice({ userAgent: CHROME_WINDOWS, ip: '10.0.0.5' }, seen)).toBe(false);
  });

  function mockHistory({ total, recent, newDeviceAlerts = true }: { total: number; recent: any[]; newDeviceAlerts?: boolean }) {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM tenant_settings')) return Promise.resolve([{ new_device_alerts: newDeviceAlerts }]);
      if (query.includes('COUNT(*) AS n FROM user_sessions')) return Promise.resolve([{ n: total }]);
      if (query.includes('SELECT user_agent, ip FROM user_sessions')) return Promise.resolve(recent);
      return Promise.resolve([]);
    });
  }

  it("does not alert on an account's very first sign-in (it only sets the baseline)", async () => {
    mockHistory({ total: 0, recent: [] });
    expect(await LoginAlertService.isNewDevice(10, 42, { userAgent: FIREFOX_LINUX, ip: '10.0.0.5' })).toBe(false);
  });

  it('alerts on a device unseen in the last 90 days', async () => {
    mockHistory({ total: 3, recent: seen });
    expect(await LoginAlertService.isNewDevice(10, 42, { userAgent: FIREFOX_LINUX, ip: '10.0.0.5' })).toBe(true);
    const recentQuery = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT user_agent, ip'))[0];
    expect(recentQuery).toContain('created_at >');
  });

  it('stays quiet for a known device, or when the organization turned alerts off', async () => {
    mockHistory({ total: 3, recent: seen });
    expect(await LoginAlertService.isNewDevice(10, 42, { userAgent: CHROME_WINDOWS, ip: '192.168.1.20' })).toBe(false);

    TenantSettingsService.clearCache();
    mockHistory({ total: 3, recent: seen, newDeviceAlerts: false });
    expect(await LoginAlertService.isNewDevice(10, 42, { userAgent: FIREFOX_LINUX, ip: '10.0.0.5' })).toBe(false);
  });
});

describe('new sign-in email', () => {
  it('names the date, browser and IP, with a single-use 24 h « Ce n\'était pas moi » link', async () => {
    mockedQuery.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('FROM users') ? [{ id: 42, tenant_id: 10, email: 'jane@test.com', display_name: 'Jane', token_version: 3 }] : []
      )
    );

    await LoginAlertService.sendNewDeviceAlert(42, { userAgent: FIREFOX_LINUX, ip: '::ffff:10.0.0.5' });

    const [tenantId, to, subject, body, actionUrl] = mockedSecurityEmail.mock.calls[0];
    expect([tenantId, to, subject]).toEqual([10, 'jane@test.com', 'Nouvelle connexion à votre compte']);
    expect(body).toContain('Firefox sur Linux');
    expect(body).toContain('10.0.0.5');
    const token = decodeURIComponent(new URL(actionUrl).searchParams.get('token')!);
    const payload = jwt.verify(token, config.jwt.secret) as any;
    expect(payload).toMatchObject({ type: 'not_me', userId: 42, tokenVersion: 3 });
    expect(payload.exp - payload.iat).toBe(24 * 3600);
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, 'NEW_DEVICE_LOGIN', 'users', 42, expect.objectContaining({ ip: '10.0.0.5', browser: 'Firefox' }));
  });
});

describe('« Ce n\'était pas moi »', () => {
  const notMeToken = (overrides: Record<string, any> = {}) =>
    jwt.sign({ type: 'not_me', userId: 42, tokenVersion: 3, ...overrides }, config.jwt.secret, { expiresIn: '24h' });

  beforeEach(() => {
    mockedQuery.mockResolvedValue([{ id: 42, tenant_id: 10, token_version: 3 }]);
  });

  it('closes every session, voids older tokens and hands out a reset token', async () => {
    const { resetToken } = await AuthService.reportNotMe(notMeToken(), { ip: '10.0.0.9' });

    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('token_version = token_version + 1'), { userId: 42, tokenVersion: 3 });
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_sessions SET revoked_at'), expect.objectContaining({ userId: 42, reason: 'not_me' }));
    expect(jwt.verify(resetToken, config.jwt.secret)).toMatchObject({ type: 'password_reset', userId: 42, tokenVersion: 4 });
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, 'NOT_ME_REPORTED', 'users', 42, expect.objectContaining({ ip: '10.0.0.9' }));
  });

  it('works only once (the account moved on to another token_version)', async () => {
    mockedQuery.mockResolvedValue([{ id: 42, tenant_id: 10, token_version: 4 }]);
    await expect(AuthService.reportNotMe(notMeToken())).rejects.toMatchObject({ statusCode: 400, code: 'NOT_ME_INVALID' });
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('refuses two simultaneous clicks', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 0 });
    await expect(AuthService.reportNotMe(notMeToken())).rejects.toMatchObject({ code: 'NOT_ME_INVALID' });
  });

  it('refuses any other kind of token', async () => {
    const reset = jwt.sign({ type: 'password_reset', userId: 42, tokenVersion: 3 }, config.jwt.secret);
    await expect(AuthService.reportNotMe(reset)).rejects.toMatchObject({ code: 'NOT_ME_INVALID' });
    await expect(AuthService.reportNotMe('garbage')).rejects.toMatchObject({ code: 'NOT_ME_INVALID' });
  });
});

describe('sign-in alerts wired into login', () => {
  it('emails the owner when the account gets locked, with the unlock time', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM tenant_settings')) return Promise.resolve([{ max_login_attempts: 3, lockout_minutes: 15 }]);
      if (query.includes('password_set_at')) {
        return Promise.resolve([{
          id: 42, tenant_id: 10, email: 'jane@test.com', password_hash: '$2a$04$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva',
          display_name: 'Jane', role: 'agent', status: 'active', is_active: true, token_version: 0,
          failed_login_attempts: 2, locked_until: null, password_set_at: new Date(), db_now: new Date(),
        }]);
      }
      return Promise.resolve([]);
    });

    await expect(AuthService.login({ email: 'jane@test.com', password: 'wrong' })).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockedSecurityEmail).toHaveBeenCalledWith(10, 'jane@test.com', 'Votre compte E-Formation a été verrouillé', expect.stringContaining('verrouillé jusqu'), expect.any(String));
  });

  it('audits a failed sign-in on an unknown address without naming it (IP suspectes)', async () => {
    mockedQuery.mockResolvedValue([]);
    await expect(AuthService.login({ email: 'nobody@test.com', password: 'x', tenantId: 10, ip: '10.0.0.66' })).rejects.toMatchObject({ statusCode: 401 });
    expect(mockedAudit).toHaveBeenCalledWith(10, null, 'LOGIN_FAILED', 'users', null, expect.objectContaining({ reason: 'unknown_account', ip: '10.0.0.66' }));
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain('nobody@test.com');
  });
});
