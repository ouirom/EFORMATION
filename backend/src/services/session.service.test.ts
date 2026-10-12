import { SessionService, hashJti } from './session.service';
import { DatabaseService } from './database.service';
import { AuditService } from './audit.service';

jest.mock('./database.service');
jest.mock('./audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedAudit = AuditService.log as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  SessionService.clearCache();
});

describe('SessionService.create', () => {
  it('stores only a hash of the refresh jti, never the jti itself', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });

    const { sid, jti } = await SessionService.create({
      tenantId: 10,
      userId: 42,
      authMethod: 'password',
      expiresInSeconds: 3600,
      ip: '::ffff:192.168.1.20',
      userAgent: 'Mozilla/5.0 Chrome/129.0',
    });

    const [sql, params] = mockedExecute.mock.calls[0];
    expect(sql).toContain('INSERT INTO user_sessions');
    expect(params).toMatchObject({ sid, userId: 42, tenantId: 10, jtiHash: hashJti(jti), ip: '192.168.1.20' });
    expect(Object.values(params)).not.toContain(jti);
  });
});

describe('SessionService.rotate', () => {
  it('swaps the presented jti for a new one', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });

    const result = await SessionService.rotate('sid-1', 42, 'old-jti');

    expect(result.outcome).toBe('rotated');
    const [sql, params] = mockedExecute.mock.calls[0];
    expect(sql).toContain('previous_jti_hash = refresh_jti_hash');
    expect(params.presentedHash).toBe(hashJti('old-jti'));
    expect(params.newHash).toBe(hashJti((result as any).jti));
    expect((result as any).jti).not.toBe('old-jti');
  });

  it('lets the token another tab just rotated through, without a new refresh token (grace window)', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 0 });
    mockedQuery.mockResolvedValue([
      { tenant_id: 10, user_id: 42, previous_jti_hash: hashJti('old-jti'), revoked_at: null, alive: 1, since_rotation: 4 },
    ]);

    await expect(SessionService.rotate('sid-1', 42, 'old-jti')).resolves.toEqual({ outcome: 'grace' });
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('revokes the whole session when an already-rotated token is replayed', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 0 });
    mockedQuery.mockResolvedValue([
      { tenant_id: 10, user_id: 42, previous_jti_hash: hashJti('old-jti'), revoked_at: null, alive: 1, since_rotation: 600 },
    ]);

    await expect(SessionService.rotate('sid-1', 42, 'old-jti', { ip: '10.0.0.9' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'SESSION_REVOKED',
    });
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('SET revoked_at'),
      { sid: 'sid-1', reason: 'reuse_detected' }
    );
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, 'SESSION_REUSE_DETECTED', 'users', 42, expect.objectContaining({ sid: 'sid-1', ip: '10.0.0.9' }));
  });

  it('treats a token older than the previous one as stolen too', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 0 });
    mockedQuery.mockResolvedValue([
      { tenant_id: 10, user_id: 42, previous_jti_hash: hashJti('newer-jti'), revoked_at: null, alive: 1, since_rotation: 2 },
    ]);

    await expect(SessionService.rotate('sid-1', 42, 'ancient-jti')).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(mockedAudit).toHaveBeenCalledWith(10, 42, 'SESSION_REUSE_DETECTED', 'users', 42, expect.anything());
  });

  it('refuses a revoked session without calling it a theft', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 0 });
    mockedQuery.mockResolvedValue([
      { tenant_id: 10, user_id: 42, previous_jti_hash: null, revoked_at: new Date(), alive: 1, since_rotation: null },
    ]);

    await expect(SessionService.rotate('sid-1', 42, 'jti')).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("refuses another user's session", async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 0 });
    mockedQuery.mockResolvedValue([
      { tenant_id: 10, user_id: 7, previous_jti_hash: hashJti('jti'), revoked_at: null, alive: 1, since_rotation: 1 },
    ]);

    await expect(SessionService.rotate('sid-1', 42, 'jti')).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
});

describe('SessionService.isActive', () => {
  it('caches a live session, and forgets it as soon as it is revoked here', async () => {
    mockedQuery.mockResolvedValue([{ user_id: 42 }]);
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });

    expect(await SessionService.isActive('sid-1', 42)).toBe(true);
    expect(await SessionService.isActive('sid-1', 42)).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(1);

    await SessionService.revoke('sid-1', 'logout');
    mockedQuery.mockResolvedValue([]);
    expect(await SessionService.isActive('sid-1', 42)).toBe(false);
  });

  it('refuses a session that belongs to someone else', async () => {
    mockedQuery.mockResolvedValue([{ user_id: 7 }]);
    expect(await SessionService.isActive('sid-1', 42)).toBe(false);
  });
});

describe('SessionService.revokeAllForUser', () => {
  it("keeps the caller's own session open", async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 3 });

    expect(await SessionService.revokeAllForUser(42, 'others_revoked', 'sid-keep')).toBe(3);
    const [sql, params] = mockedExecute.mock.calls[0];
    expect(sql).toContain('sid <> @exceptSid');
    expect(params).toMatchObject({ userId: 42, reason: 'others_revoked', exceptSid: 'sid-keep' });
  });

  it('closes everything without an exception', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 2 });

    await SessionService.revokeAllForUser(42, 'admin_force_logout');
    expect(mockedExecute.mock.calls[0][0]).not.toContain('@exceptSid');
  });
});
