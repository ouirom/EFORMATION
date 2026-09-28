import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import authRoutes from './auth.routes';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { DatabaseService } from '../services/database.service';
import { NotificationService } from '../services/notification.service';
import { errorHandler } from '../middleware/error.middleware';

jest.mock('../services/database.service');
jest.mock('../services/audit.service');
jest.mock('../services/notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedSend = NotificationService.send as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantMiddleware);
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

describe('POST /auth/register', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedSend.mockResolvedValue({ id: 1, status: 'sent', channel: 'email' });
  });

  it('creates a pending account and issues no tokens', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([]);
      if (query.includes('SELECT id FROM users WHERE username')) return Promise.resolve([]);
      if (query.includes('INSERT INTO users')) return Promise.resolve([{ id: 50 }]);
      if (query.includes("role = 'admin'")) return Promise.resolve([{ id: 1 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/auth/register')
      .set('X-Tenant-Id', '10')
      .send({ email: 'new@test.com', password: 'Password123!', displayName: 'New User' });

    expect(response.status).toBe(201);
    expect(response.body.data.pending).toBe(true);
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.objectContaining({ email: 'new@test.com' })
    );
    // Approval is required by default: the account is inserted pending and inactive.
    const insertCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO users'));
    expect(insertCall[1]).toMatchObject({ status: 'pending', isActive: false });
  });

  it('notifies an admin approver when no service/direction was chosen', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([]);
      if (query.includes('SELECT id FROM users WHERE username')) return Promise.resolve([]);
      if (query.includes('INSERT INTO users')) return Promise.resolve([{ id: 51 }]);
      if (query.includes("role = 'admin'")) return Promise.resolve([{ id: 7 }]);
      return Promise.resolve([]);
    });

    await request(makeApp())
      .post('/auth/register')
      .set('X-Tenant-Id', '10')
      .send({ email: 'new2@test.com', password: 'Password123!', displayName: 'New User 2' });

    // notifyApproversOfPendingRegistration is fire-and-forget; give its microtasks a tick.
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockedSend).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, channel: 'in_app' }));
    expect(mockedSend).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, channel: 'email' }));
  });

  it('rejects a duplicate email', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([{ id: 1 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/auth/register')
      .set('X-Tenant-Id', '10')
      .send({ email: 'existing@test.com', password: 'Password123!', displayName: 'Dup' });

    expect(response.status).toBe(409);
  });

  it('rejects an email already used in a different tenant (users.email is globally unique)', async () => {
    // Simulates an email registered under tenant 20 colliding with a new signup
    // against tenant 10 -- the duplicate check must not be tenant-scoped, since
    // the DB's UNIQUE constraint on users.email isn't either.
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([{ id: 1 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/auth/register')
      .set('X-Tenant-Id', '10')
      .send({ email: 'cross-tenant@test.com', password: 'Password123!', displayName: 'Cross Tenant' });

    expect(response.status).toBe(409);
    const emailCheckCall = mockedQuery.mock.calls.find(([q]: [string]) =>
      q.includes('SELECT id FROM users WHERE email')
    );
    expect(emailCheckCall[0]).not.toContain('tenant_id');
  });

  it("rejects a password that breaks the organization's policy without creating the account", async () => {
    mockedQuery.mockResolvedValue([]);
    const response = await request(makeApp())
      .post('/auth/register')
      .set('X-Tenant-Id', '10')
      .send({ email: 'weak@test.com', password: 'password123', displayName: 'Weak' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PASSWORD_POLICY');
    expect(mockedQuery).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), expect.anything());
  });
});

describe('POST /auth/login status handling', () => {
  function mockUserRow(overrides: Partial<Record<string, any>> = {}) {
    return {
      id: 1, tenant_id: 10, email: 'user@test.com', password_hash: '$2a$10$fakehash',
      display_name: 'User', avatar_url: null, role: 'agent',
      enterprise_id: null, direction_id: null, service_id: null, is_active: true, status: 'active',
      ...overrides,
    };
  }

  it.each([
    ['pending', "en attente d'activation"],
    ['suspended', 'suspendu'],
    ['deactivated', 'désactivé'],
  ])('blocks login for a %s account with a status-specific message', async (status, expectedSubstring) => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users') && query.includes('WHERE email = @email')) {
        return Promise.resolve([mockUserRow({ status })]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/auth/login')
      .set('X-Tenant-Id', '10')
      .send({ email: 'user@test.com', password: 'whatever' });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toContain(expectedSubstring);
  });

  it('logs in successfully for an active account and records last_login_at', async () => {
    const realHash = await bcrypt.hash('password123', 4);

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users') && query.includes('WHERE email = @email')) {
        return Promise.resolve([mockUserRow({ password_hash: realHash })]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/auth/login')
      .set('X-Tenant-Id', '10')
      .send({ email: 'user@test.com', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('last_login_at = SYSUTCDATETIME()'),
      expect.objectContaining({ id: 1 })
    );
  });
});
