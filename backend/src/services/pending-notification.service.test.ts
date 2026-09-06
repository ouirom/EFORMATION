import { PendingNotificationService } from './pending-notification.service';
import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';

jest.mock('./database.service');
jest.mock('./notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedSend = NotificationService.send as jest.Mock;

function pendingRow(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    tenant_id: 10,
    user_id: 42,
    event_type: 'account_created',
    channel: 'email',
    subject: 'Subject',
    body: 'Body',
    action_url: null,
    metadata: null,
    status: 'pending',
    triggered_by: 5,
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('PendingNotificationService.queue', () => {
  it('inserts a pending row and returns the recipient email for display', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT email FROM users')) return Promise.resolve([{ email: 'jane@example.com' }]);
      if (query.includes('INSERT INTO pending_notifications')) return Promise.resolve([{ id: 7 }]);
      return Promise.resolve([]);
    });

    const result = await PendingNotificationService.queue({
      tenantId: 10,
      userId: 42,
      eventType: 'account_created',
      subject: 'Welcome',
      body: 'Hello',
    });

    expect(result).toEqual({ id: 7, subject: 'Welcome', recipientEmail: 'jane@example.com' });
  });

  it('throws when the recipient does not exist', async () => {
    mockedQuery.mockResolvedValue([]);

    await expect(
      PendingNotificationService.queue({ tenantId: 10, userId: 999, eventType: 'account_created', subject: 'x', body: 'y' })
    ).rejects.toThrow();
  });
});

describe('PendingNotificationService.approve/reject permissions', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedSend.mockResolvedValue({ id: 1, status: 'sent', channel: 'email' });
  });

  it('lets the user who triggered the action approve it, even without an admin role', async () => {
    mockedQuery.mockResolvedValue([pendingRow({ triggered_by: 5 })]);

    await PendingNotificationService.approve(1, { id: 5, tenantId: 10, role: 'agent' });

    expect(mockedSend).toHaveBeenCalledWith(expect.objectContaining({ userId: 42, subject: 'Subject' }));
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining("status = 'approved'"), expect.objectContaining({ id: 1 }));
  });

  it('lets an admin approve someone else\'s queued notification', async () => {
    mockedQuery.mockResolvedValue([pendingRow({ triggered_by: 5 })]);

    await PendingNotificationService.approve(1, { id: 99, tenantId: 10, role: 'admin' });

    expect(mockedSend).toHaveBeenCalled();
  });

  it('rejects a non-admin reviewer who did not trigger the action', async () => {
    mockedQuery.mockResolvedValue([pendingRow({ triggered_by: 5 })]);

    await expect(
      PendingNotificationService.approve(1, { id: 99, tenantId: 10, role: 'agent' })
    ).rejects.toThrow();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('treats a different-tenant row as not found for a regular admin', async () => {
    mockedQuery.mockResolvedValue([pendingRow({ tenant_id: 20 })]);

    await expect(
      PendingNotificationService.approve(1, { id: 99, tenantId: 10, role: 'admin' })
    ).rejects.toThrow();
  });

  it('lets a super_admin approve a different tenant\'s queued notification', async () => {
    mockedQuery.mockResolvedValue([pendingRow({ tenant_id: 20, triggered_by: 5 })]);

    await PendingNotificationService.approve(1, { id: 99, tenantId: 10, role: 'super_admin' });

    expect(mockedSend).toHaveBeenCalled();
  });

  it('refuses to re-review an already-processed notification', async () => {
    mockedQuery.mockResolvedValue([pendingRow({ status: 'approved' })]);

    await expect(
      PendingNotificationService.approve(1, { id: 5, tenantId: 10, role: 'agent' })
    ).rejects.toThrow();
  });

  it('reject() marks the row rejected without sending anything', async () => {
    mockedQuery.mockResolvedValue([pendingRow({ triggered_by: 5 })]);

    await PendingNotificationService.reject(1, { id: 5, tenantId: 10, role: 'agent' });

    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining("status = 'rejected'"), expect.objectContaining({ id: 1 }));
  });
});
