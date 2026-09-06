import nodemailer from 'nodemailer';
import { NotificationService } from './notification.service';
import { DatabaseService } from './database.service';

jest.mock('./database.service');
jest.mock('nodemailer');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedCreateTransport = nodemailer.createTransport as jest.Mock;

describe('NotificationService.send', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  });

  it('sends an email using the tenant\'s configured SMTP settings and marks the notification sent', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'mail-123' });
    mockedCreateTransport.mockReturnValue({ sendMail });

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM notification_preferences')) return Promise.resolve([{ email: true }]);
      if (query.includes('SELECT email, phone FROM users')) return Promise.resolve([{ email: 'jane@test.com', phone: null }]);
      if (query.includes('FROM email_settings')) {
        return Promise.resolve([
          { enabled: true, smtp_host: 'smtp.tenant.com', smtp_port: 587, smtp_secure: false, smtp_user: 'user', smtp_password: 'pass', from_name: 'Tenant Co', from_email: 'noreply@tenant.com' },
        ]);
      }
      if (query.includes('INSERT INTO notifications')) return Promise.resolve([{ id: 7 }]);
      return Promise.resolve([]);
    });

    const result = await NotificationService.send({
      tenantId: 10,
      userId: 42,
      channel: 'email',
      subject: 'Hello',
      body: 'Test body',
    });

    expect(result).toMatchObject({ id: 7, status: 'sent', channel: 'email', externalId: 'mail-123' });
    expect(mockedCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.tenant.com', port: 587 })
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jane@test.com', subject: 'Hello', text: 'Test body' })
    );
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('sent_at'),
      { id: 7, externalId: 'mail-123' }
    );
  });

  it('does not create a notification record when the channel is disabled by user preferences', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM notification_preferences')) return Promise.resolve([{ email: false }]);
      return Promise.resolve([]);
    });

    const result = await NotificationService.send({
      tenantId: 10,
      userId: 42,
      channel: 'email',
      body: 'Should not be sent',
    });

    expect(result).toMatchObject({ id: 0, status: 'pending', channel: 'email' });
    const insertCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO notifications'));
    expect(insertCall).toBeUndefined();
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('always allows the in_app channel regardless of preferences (no column exists to disable it)', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM notification_preferences')) return Promise.resolve([{ email: false, sms: false, whatsapp: false, push_web: false }]);
      if (query.includes('SELECT email, phone FROM users')) return Promise.resolve([{ email: 'jane@test.com', phone: null }]);
      if (query.includes('INSERT INTO notifications')) return Promise.resolve([{ id: 9 }]);
      return Promise.resolve([]);
    });

    const result = await NotificationService.send({
      tenantId: 10,
      userId: 42,
      channel: 'in_app',
      body: 'In-app message',
    });

    expect(result).toMatchObject({ id: 9, status: 'sent', channel: 'in_app' });
    expect(mockedCreateTransport).not.toHaveBeenCalled();
  });

  it('throws when the target user does not exist', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM notification_preferences')) return Promise.resolve([]); // falls back to defaults (email enabled)
      if (query.includes('SELECT email, phone FROM users')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await expect(
      NotificationService.send({ tenantId: 10, userId: 999, channel: 'email', body: 'x' })
    ).rejects.toThrow('User not found');
  });

  it('marks the notification failed (but still creates the record) when the channel provider is not configured', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM notification_preferences')) return Promise.resolve([{ sms: true }]);
      if (query.includes('SELECT email, phone FROM users')) return Promise.resolve([{ email: 'jane@test.com', phone: '+15551234567' }]);
      if (query.includes('INSERT INTO notifications')) return Promise.resolve([{ id: 11 }]);
      return Promise.resolve([]);
    });

    const result = await NotificationService.send({
      tenantId: 10,
      userId: 42,
      channel: 'sms',
      body: 'SMS body',
    });

    // Twilio isn't configured in the test environment (no TWILIO_ACCOUNT_SID), so the
    // send attempt fails but the notification row itself was already created.
    expect(result).toMatchObject({ id: 11, status: 'failed', channel: 'sms' });
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('failed_at'),
      expect.objectContaining({ id: 11, error: expect.stringContaining('Twilio not configured') })
    );
  });
});

describe('NotificationService.sendBulk', () => {
  it('aggregates sent/failed counts across all recipients', async () => {
    const sendSpy = jest.spyOn(NotificationService, 'send');
    sendSpy
      .mockResolvedValueOnce({ id: 1, status: 'sent', channel: 'email' })
      .mockResolvedValueOnce({ id: 2, status: 'sent', channel: 'email' })
      .mockRejectedValueOnce(new Error('boom'));

    const result = await NotificationService.sendBulk(10, [1, 2, 3], 'email', 'Subject', 'Body');

    expect(result).toEqual({ sent: 2, failed: 1 });
    expect(sendSpy).toHaveBeenCalledTimes(3);

    sendSpy.mockRestore();
  });
});
