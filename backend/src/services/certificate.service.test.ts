import { CertificateService } from './certificate.service';
import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';

jest.mock('./database.service');
jest.mock('./notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedSend = NotificationService.send as jest.Mock;

describe('CertificateService.runExpiryReminders', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedSend.mockResolvedValue({ id: 1, status: 'sent', channel: 'email' });
  });

  it('sends a renewal reminder for each certificate expiring soon and marks it sent', async () => {
    mockedQuery.mockResolvedValue([
      {
        id: 1,
        tenant_id: 10,
        user_id: 42,
        display_name: 'Jane Doe',
        course_id: 100,
        course_title: 'Sécurité incendie',
        expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]);

    const result = await CertificateService.runExpiryReminders();

    expect(result.remindersSent).toBe(1);
    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend.mock.calls[0][0]).toMatchObject({ userId: 42, channel: 'email' });
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('renewal_reminder_sent_at'),
      expect.objectContaining({ id: 1 })
    );
  });

  it('does nothing when no certificates are expiring soon', async () => {
    mockedQuery.mockResolvedValue([]);

    const result = await CertificateService.runExpiryReminders();

    expect(result.remindersSent).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedExecute).not.toHaveBeenCalled();
  });
});
