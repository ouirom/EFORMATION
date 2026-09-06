import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { DatabaseService } from './database.service';
import { PendingNotificationService } from './pending-notification.service';
import { config } from '../config';

jest.mock('./database.service');
jest.mock('./pending-notification.service');
jest.mock('bcryptjs');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedQueue = PendingNotificationService.queue as jest.Mock;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService.login', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  });

  function userRow(overrides: Partial<Record<string, any>> = {}) {
    return {
      id: 42,
      tenant_id: 10,
      email: 'jane@test.com',
      password_hash: 'hashed-password',
      display_name: 'Jane Doe',
      avatar_url: null,
      role: 'agent',
      enterprise_id: null,
      direction_id: null,
      service_id: null,
      is_active: true,
      status: 'active',
      ...overrides,
    };
  }

  it('issues a valid access/refresh token pair on successful login', async () => {
    mockedQuery.mockResolvedValue([userRow()]);
    mockedBcrypt.compare.mockResolvedValue(true as never);

    const result = await AuthService.login({ email: 'jane@test.com', password: 'correct-password' });

    expect(mockedBcrypt.compare).toHaveBeenCalledWith('correct-password', 'hashed-password');
    expect(result.user).toMatchObject({ id: 42, tenantId: 10, email: 'jane@test.com', role: 'agent' });
    expect(result.tokens).toMatchObject({ expiresIn: expect.any(Number) });

    const decodedAccess = jwt.verify(result.tokens.accessToken, config.jwt.secret) as any;
    expect(decodedAccess).toMatchObject({ id: 42, tenantId: 10, email: 'jane@test.com', role: 'agent' });

    const decodedRefresh = jwt.verify(result.tokens.refreshToken, config.jwt.refreshSecret) as any;
    expect(decodedRefresh).toMatchObject({ id: 42, type: 'refresh' });

    // last_login_at should be stamped on successful login.
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('last_login_at'), { id: 42 });
  });

  it('rejects an invalid password without revealing which part was wrong', async () => {
    mockedQuery.mockResolvedValue([userRow()]);
    mockedBcrypt.compare.mockResolvedValue(false as never);

    await expect(AuthService.login({ email: 'jane@test.com', password: 'wrong' })).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
    });
  });

  it('rejects login for an unknown email', async () => {
    mockedQuery.mockResolvedValue([]);

    await expect(AuthService.login({ email: 'nobody@test.com', password: 'x' })).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
    });
    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
  });

  it('rejects login for a suspended account with the French suspension message', async () => {
    mockedQuery.mockResolvedValue([userRow({ status: 'suspended' })]);

    await expect(AuthService.login({ email: 'jane@test.com', password: 'anything' })).rejects.toMatchObject({
      statusCode: 401,
      message: 'Votre compte a été suspendu. Contactez votre administrateur.',
    });
    // The password must never even be checked for a disabled account.
    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
  });

  it('rejects login for a pending (not yet activated) account', async () => {
    mockedQuery.mockResolvedValue([userRow({ status: 'pending' })]);

    await expect(AuthService.login({ email: 'jane@test.com', password: 'anything' })).rejects.toMatchObject({
      statusCode: 401,
      message: "Votre compte est en attente d'activation par votre responsable.",
    });
  });
});

describe('AuthService.handleLdapLogin', () => {
  const profile = { email: 'ldap.user@test.com', displayName: 'LDAP User' };

  it('auto-provisions a new local account under the configured default tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT id, tenant_id, is_active FROM users')) return Promise.resolve([]);
      if (query.includes('FROM tenants WHERE id = @tenantId')) return Promise.resolve([{ id: config.defaultTenantId }]);
      if (query.includes('INSERT INTO users')) return Promise.resolve([{ id: 77 }]);
      if (query.includes('FROM users WHERE id = @userId')) {
        return Promise.resolve([
          { id: 77, tenant_id: config.defaultTenantId, email: profile.email, display_name: profile.displayName, role: 'agent', enterprise_id: null, direction_id: null, service_id: null },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await AuthService.handleLdapLogin(profile);

    expect(result.isNewUser).toBe(true);
    expect(result.user).toMatchObject({ id: 77, tenantId: config.defaultTenantId, email: profile.email, role: 'agent' });
    expect(result.tokens.accessToken).toEqual(expect.any(String));

    const insertCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO users'));
    expect(insertCall[1]).toMatchObject({ tenantId: config.defaultTenantId, email: profile.email });
  });

  it('logs in an existing active LDAP-provisioned user without re-provisioning', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT id, tenant_id, is_active FROM users')) {
        return Promise.resolve([{ id: 55, tenant_id: 10, is_active: true }]);
      }
      if (query.includes('FROM users WHERE id = @userId')) {
        return Promise.resolve([
          { id: 55, tenant_id: 10, email: profile.email, display_name: profile.displayName, role: 'agent', enterprise_id: null, direction_id: null, service_id: null },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await AuthService.handleLdapLogin(profile);

    expect(result.isNewUser).toBe(false);
    expect(result.user).toMatchObject({ id: 55, tenantId: 10 });
    const insertCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO users'));
    expect(insertCall).toBeUndefined();
  });

  it('refuses an existing but deactivated LDAP account', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT id, tenant_id, is_active FROM users')) {
        return Promise.resolve([{ id: 55, tenant_id: 10, is_active: false }]);
      }
      return Promise.resolve([]);
    });

    await expect(AuthService.handleLdapLogin(profile)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Account is disabled',
    });
  });

  it('refuses to auto-provision when no default tenant is configured', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT id, tenant_id, is_active FROM users')) return Promise.resolve([]);
      if (query.includes('FROM tenants WHERE id = @tenantId')) return Promise.resolve([]); // default tenant row missing
      return Promise.resolve([]);
    });

    await expect(AuthService.handleLdapLogin(profile)).rejects.toMatchObject({
      statusCode: 401,
      message: 'LDAP login is not available: no default tenant is configured for auto-provisioning',
    });

    const insertCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO users'));
    expect(insertCall).toBeUndefined();
  });
});

describe('AuthService.changePassword', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQueue.mockResolvedValue({ id: 1, subject: 'Votre mot de passe E-Formation a été modifié', recipientEmail: 'jane@test.com' });
  });

  it('hashes the new password with the configured bcrypt rounds after verifying the current one', async () => {
    mockedQuery.mockResolvedValue([{ password_hash: 'old-hash', tenant_id: 10 }]);
    mockedBcrypt.compare.mockResolvedValue(true as never);
    mockedBcrypt.hash.mockResolvedValue('new-hash' as never);

    const result = await AuthService.changePassword(42, 'current-pw', 'new-pw');

    expect(mockedBcrypt.compare).toHaveBeenCalledWith('current-pw', 'old-hash');
    expect(mockedBcrypt.hash).toHaveBeenCalledWith('new-pw', config.bcryptRounds);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET password_hash'),
      { passwordHash: 'new-hash', userId: 42 }
    );
    expect(result).toMatchObject({ id: 1, recipientEmail: 'jane@test.com' });
  });

  it('rejects when the current password is incorrect', async () => {
    mockedQuery.mockResolvedValue([{ password_hash: 'old-hash', tenant_id: 10 }]);
    mockedBcrypt.compare.mockResolvedValue(false as never);

    await expect(AuthService.changePassword(42, 'wrong-pw', 'new-pw')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Current password is incorrect',
    });
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the user does not exist', async () => {
    mockedQuery.mockResolvedValue([]);

    await expect(AuthService.changePassword(999, 'x', 'y')).rejects.toMatchObject({ statusCode: 404 });
  });
});
