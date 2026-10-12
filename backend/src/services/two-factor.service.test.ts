import crypto from 'crypto';
import { TwoFactorService, maskEmail, twoFactorApplies, MAX_ATTEMPTS } from './two-factor.service';
import { DatabaseService } from './database.service';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import { logger } from '../utils/logger';
import { config } from '../config';

jest.mock('./database.service');
jest.mock('./audit.service');
jest.mock('./notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedAudit = AuditService.log as jest.Mock;
const mockedSecurityEmail = NotificationService.sendSecurityEmail as jest.Mock;

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const hmac = (tokenHash: string, code: string) =>
  crypto.createHmac('sha256', config.jwt.secret).update(`${tokenHash}:${code}`).digest('hex');

beforeEach(() => {
  jest.clearAllMocks();
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  mockedSecurityEmail.mockResolvedValue('message-id');
});

/** Starts a challenge and returns its token plus the code that was emailed. */
async function startChallenge() {
  const challenge = await TwoFactorService.start({
    tenantId: 10,
    userId: 42,
    email: 'jane.doe@acme.com',
    displayName: 'Jane',
    purpose: 'login',
    authMethod: 'password',
    portal: null,
    ip: '10.0.0.1',
  });
  const body: string = mockedSecurityEmail.mock.calls[0][3];
  const code = body.match(/\b(\d{6})\b/)![1];
  return { challenge, code, tokenHash: sha256(challenge.challengeToken) };
}

function challengeRow(overrides: Record<string, any> = {}) {
  return {
    id: 7, tenant_id: 10, user_id: 42, purpose: 'login', auth_method: 'password', portal: null,
    attempts: 0, consumed_at: null, alive: 1, ...overrides,
  };
}

describe('helpers', () => {
  it('masks the email address', () => {
    expect(maskEmail('jane.doe@acme.com')).toBe('j***@acme.com');
  });

  it('applies 2FA per the organization mode and the user choice', () => {
    expect(twoFactorApplies('off', true)).toBe(false);
    expect(twoFactorApplies('optional', false)).toBe(false);
    expect(twoFactorApplies('optional', true)).toBe(true);
    expect(twoFactorApplies('required', false)).toBe(true);
  });
});

describe('TwoFactorService.start', () => {
  it('emails a 6-digit code and stores only its keyed hash', async () => {
    const { challenge, code, tokenHash } = await startChallenge();

    expect(challenge).toMatchObject({ twoFactorRequired: true, emailHint: 'j***@acme.com', expiresIn: 600, resendAfter: 60 });
    expect(code).toMatch(/^\d{6}$/);
    const [, params] = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO two_factor_challenges'));
    expect(params.tokenHash).toBe(tokenHash);
    expect(params.codeHash).toBe(hmac(tokenHash, code));
    expect(JSON.stringify(params)).not.toContain(code);
    expect(JSON.stringify(params)).not.toContain(challenge.challengeToken);
    expect(mockedSecurityEmail).toHaveBeenCalledWith(10, 'jane.doe@acme.com', expect.any(String), expect.stringContaining(code));
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, '2FA_CHALLENGE_SENT', 'users', 42, expect.objectContaining({ purpose: 'login' }));
  });

  it('never writes the code to the log outside development', async () => {
    const warn = jest.spyOn(logger, 'warn');
    await startChallenge();
    expect(warn.mock.calls.flat().join(' ')).not.toContain('DEV ONLY');
    warn.mockRestore();
  });
});

describe('TwoFactorService.verify', () => {
  it('accepts the right code once, then never again', async () => {
    const { challenge, code, tokenHash } = await startChallenge();
    mockedQuery.mockResolvedValue([challengeRow({ code_hash: hmac(tokenHash, code) })]);

    await expect(TwoFactorService.verify(challenge.challengeToken, code, 'login')).resolves.toMatchObject({ user_id: 42, auth_method: 'password' });
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('SET consumed_at'), { id: 7 });

    mockedQuery.mockResolvedValue([challengeRow({ code_hash: hmac(tokenHash, code), consumed_at: new Date() })]);
    await expect(TwoFactorService.verify(challenge.challengeToken, code, 'login')).rejects.toMatchObject({ code: 'TWO_FACTOR_INVALID_CHALLENGE' });
  });

  it('refuses a wrong code, counts the attempt and audits it', async () => {
    const { challenge, code, tokenHash } = await startChallenge();
    mockedQuery.mockResolvedValue([challengeRow({ code_hash: hmac(tokenHash, code), attempts: 1 })]);
    const wrong = code === '123456' ? '654321' : '123456';

    await expect(TwoFactorService.verify(challenge.challengeToken, wrong, 'login', { ip: '10.0.0.9' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'TWO_FACTOR_INVALID_CODE',
      details: { remainingAttempts: 3 },
    });
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('attempts = attempts + 1'), { id: 7, maxAttempts: MAX_ATTEMPTS });
    expect(mockedExecute).not.toHaveBeenCalledWith(expect.stringContaining('SET consumed_at'), expect.anything());
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, '2FA_FAILED', 'users', 42, expect.objectContaining({ remainingAttempts: 3, ip: '10.0.0.9' }));
  });

  it('kills the challenge at the fifth wrong code', async () => {
    const { challenge, code, tokenHash } = await startChallenge();
    mockedQuery.mockResolvedValue([challengeRow({ code_hash: hmac(tokenHash, code), attempts: MAX_ATTEMPTS - 1 })]);
    const wrong = code === '123456' ? '654321' : '123456';

    await expect(TwoFactorService.verify(challenge.challengeToken, wrong, 'login')).rejects.toMatchObject({
      statusCode: 429,
      code: 'TWO_FACTOR_TOO_MANY_ATTEMPTS',
    });
  });

  it('refuses even the right code once the attempts are used up', async () => {
    const { challenge, code, tokenHash } = await startChallenge();
    mockedQuery.mockResolvedValue([challengeRow({ code_hash: hmac(tokenHash, code), attempts: MAX_ATTEMPTS })]);

    await expect(TwoFactorService.verify(challenge.challengeToken, code, 'login')).rejects.toMatchObject({ code: 'TWO_FACTOR_TOO_MANY_ATTEMPTS' });
  });

  it('refuses when a parallel request took the last attempt', async () => {
    const { challenge, code, tokenHash } = await startChallenge();
    mockedQuery.mockResolvedValue([challengeRow({ code_hash: hmac(tokenHash, code), attempts: 4 })]);
    mockedExecute.mockResolvedValue({ rowsAffected: 0 });

    await expect(TwoFactorService.verify(challenge.challengeToken, code, 'login')).rejects.toMatchObject({ code: 'TWO_FACTOR_TOO_MANY_ATTEMPTS' });
  });

  it('refuses an expired code', async () => {
    const { challenge, code, tokenHash } = await startChallenge();
    mockedQuery.mockResolvedValue([challengeRow({ code_hash: hmac(tokenHash, code), alive: 0 })]);

    await expect(TwoFactorService.verify(challenge.challengeToken, code, 'login')).rejects.toMatchObject({ code: 'TWO_FACTOR_EXPIRED' });
  });

  it('only looks up challenges of the expected purpose', async () => {
    mockedQuery.mockResolvedValue([]);
    await expect(TwoFactorService.verify('some-token', '123456', 'enable')).rejects.toMatchObject({ code: 'TWO_FACTOR_INVALID_CHALLENGE' });
    expect(mockedQuery.mock.calls[0][1]).toMatchObject({ purpose: 'enable' });
  });
});

describe('TwoFactorService.resend', () => {
  const resendRow = (overrides: Record<string, any> = {}) => ({
    id: 7, tenant_id: 10, user_id: 42, purpose: 'login', attempts: 0, send_count: 1, consumed_at: null,
    since_sent: 120, email: 'jane.doe@acme.com', display_name: 'Jane', ...overrides,
  });

  it('waits 60 seconds between two emails', async () => {
    mockedQuery.mockResolvedValue([resendRow({ since_sent: 20 })]);
    await expect(TwoFactorService.resend('token')).rejects.toMatchObject({
      statusCode: 429,
      code: 'TWO_FACTOR_RESEND_TOO_SOON',
      details: { retryAfter: 40 },
    });
    expect(mockedSecurityEmail).not.toHaveBeenCalled();
  });

  it('stops after 5 emails', async () => {
    mockedQuery.mockResolvedValue([resendRow({ send_count: 5 })]);
    await expect(TwoFactorService.resend('token')).rejects.toMatchObject({ code: 'TWO_FACTOR_TOO_MANY_SENDS' });
  });

  it('sends a new code that replaces the previous one', async () => {
    mockedQuery.mockResolvedValue([resendRow()]);
    await expect(TwoFactorService.resend('token')).resolves.toMatchObject({ emailHint: 'j***@acme.com', resendAfter: 60 });

    const code = (mockedSecurityEmail.mock.calls[0][3] as string).match(/\b(\d{6})\b/)![1];
    const [sql, params] = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('send_count = send_count + 1'));
    expect(sql).toContain('expires_at');
    expect(params).toMatchObject({ id: 7, sendCount: 1, codeHash: hmac(sha256('token'), code) });
  });
});
