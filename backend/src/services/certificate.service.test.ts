import { CertificateService } from './certificate.service';
import { DatabaseService } from './database.service';
import { PendingNotificationService } from './pending-notification.service';

jest.mock('./database.service');
jest.mock('./pending-notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedQueue = PendingNotificationService.queue as jest.Mock;

describe('CertificateService.runExpiryReminders', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQueue.mockResolvedValue({ id: 1, subject: 'subject', recipientEmail: 'jane@example.com' });
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
    expect(mockedQueue).toHaveBeenCalledTimes(1);
    expect(mockedQueue.mock.calls[0][0]).toMatchObject({ userId: 42, eventType: 'certificate_expiring' });
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('renewal_reminder_sent_at'),
      expect.objectContaining({ id: 1 })
    );
  });

  it('does nothing when no certificates are expiring soon', async () => {
    mockedQuery.mockResolvedValue([]);

    const result = await CertificateService.runExpiryReminders();

    expect(result.remindersSent).toBe(0);
    expect(mockedQueue).not.toHaveBeenCalled();
    expect(mockedExecute).not.toHaveBeenCalled();
  });
});
