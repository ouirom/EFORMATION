import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import authRoutes from './auth.routes';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { DatabaseService } from '../services/database.service';
import { NotificationService } from '../services/notification.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

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

function signResetToken(userId: number, overrides: Record<string, any> = {}) {
  return jwt.sign({ userId, type: 'password_reset', tokenVersion: 0, ...overrides }, config.jwt.secret, { expiresIn: '1h' });
}

describe('POST /auth/forgot-password', () => {
  beforeEach(() => {
    mockedSend.mockResolvedValue({ id: 1, status: 'sent', channel: 'email' });
  });

  it('sends a reset email and returns the generic message when the account exists', async () => {
    mockedQuery.mockResolvedValue([{ id: 5, tenant_id: 10 }]);

    const response = await request(makeApp())
      .post('/auth/forgot-password')
      .set('X-Tenant-Id', '10')
      .send({ email: 'user@test.com' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('If the email exists, a reset link will be sent');

    // fire-and-forget send() call
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 5,
        channel: 'email',
        actionUrl: expect.stringContaining('/reset-password?token='),
      })
    );
  });

  it('returns the same generic message and sends nothing when the account does not exist', async () => {
    mockedQuery.mockResolvedValue([]);

    const response = await request(makeApp())
      .post('/auth/forgot-password')
      .set('X-Tenant-Id', '10')
      .send({ email: 'nobody@test.com' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('If the email exists, a reset link will be sent');
    expect(mockedSend).not.toHaveBeenCalled();
  });
});

describe('POST /auth/reset-password', () => {
  it('rejects a weak new password before touching the database', async () => {
    const response = await request(makeApp())
      .post('/auth/reset-password')
      .send({ token: signResetToken(5), newPassword: 'weakpass' });

    expect(response.status).toBe(400);
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('updates the password hash and bumps token_version for a valid token and complex password', async () => {
    mockedQuery.mockResolvedValue([{ id: 5, token_version: 0 }]);
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });

    const response = await request(makeApp())
      .post('/auth/reset-password')
      .send({ token: signResetToken(5), newPassword: 'NewPassword123!' });

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET password_hash'),
      expect.objectContaining({ userId: 5 })
    );
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('token_version = token_version + 1'),
      expect.anything()
    );
  });

  it('rejects a token already consumed by an earlier reset (token_version no longer matches)', async () => {
    // The account's token_version has since moved to 1 (e.g. a previous use of this
    // same link, or a newer reset request) -- this token was signed against version 0.
    mockedQuery.mockResolvedValue([{ id: 5, token_version: 1 }]);

    const response = await request(makeApp())
      .post('/auth/reset-password')
      .send({ token: signResetToken(5, { tokenVersion: 0 }), newPassword: 'NewPassword123!' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Invalid or expired reset token');
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('rejects a malformed/invalid token', async () => {
    const response = await request(makeApp())
      .post('/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'NewPassword123!' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Invalid or expired reset token');
  });

  it('rejects a token of the wrong type (e.g. an access token)', async () => {
    const wrongTypeToken = jwt.sign({ userId: 5, type: 'access' }, config.jwt.secret, { expiresIn: '1h' });

    const response = await request(makeApp())
      .post('/auth/reset-password')
      .send({ token: wrongTypeToken, newPassword: 'NewPassword123!' });

    expect(response.status).toBe(400);
  });

  it('returns 404 when the token is valid but the user no longer exists', async () => {
    mockedQuery.mockResolvedValue([]);

    const response = await request(makeApp())
      .post('/auth/reset-password')
      .send({ token: signResetToken(999), newPassword: 'NewPassword123!' });

    expect(response.status).toBe(404);
  });
});
