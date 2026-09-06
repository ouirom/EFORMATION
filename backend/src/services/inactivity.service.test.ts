import { InactivitySuspensionService, InactivityPolicyService } from './inactivity.service';
import { DatabaseService } from './database.service';
import { PendingNotificationService } from './pending-notification.service';

jest.mock('./database.service');
jest.mock('./pending-notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedQueue = PendingNotificationService.queue as jest.Mock;

describe('InactivitySuspensionService.runDailySuspensions', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQueue.mockResolvedValue({ id: 1, subject: 'subject', recipientEmail: 'stale@test.com' });
  });

  it('suspends stale users matched by each configured policy and notifies them', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM inactivity_policies')) {
        return Promise.resolve([{ tenant_id: 10, role: 'agent', max_inactive_days: 90 }]);
      }
      if (query.includes('FROM users') && query.includes("status = 'active'")) {
        return Promise.resolve([
          { id: 3, tenant_id: 10, display_name: 'Stale Agent', email: 'stale@test.com' },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await InactivitySuspensionService.runDailySuspensions();

    expect(result.suspended).toBe(1);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'suspended'"),
      expect.objectContaining({ id: 3 })
    );
    expect(mockedQueue).toHaveBeenCalledWith(expect.objectContaining({ userId: 3, eventType: 'account_suspended' }));
  });

  it('does nothing when no policies are configured', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM inactivity_policies')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const result = await InactivitySuspensionService.runDailySuspensions();

    expect(result.suspended).toBe(0);
    expect(mockedQueue).not.toHaveBeenCalled();
  });

  it('does not suspend anyone when no user is stale enough', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM inactivity_policies')) {
        return Promise.resolve([{ tenant_id: 10, role: 'agent', max_inactive_days: 90 }]);
      }
      if (query.includes('FROM users') && query.includes("status = 'active'")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const result = await InactivitySuspensionService.runDailySuspensions();

    expect(result.suspended).toBe(0);
  });
});

describe('InactivityPolicyService', () => {
  it('inserts a new policy when none exists', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockResolvedValue([]);

    await InactivityPolicyService.setPolicy(10, 'agent', 90, 1);

    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inactivity_policies'),
      expect.objectContaining({ tenantId: 10, role: 'agent', maxInactiveDays: 90, updatedBy: 1 })
    );
  });

  it('updates an existing policy', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockResolvedValue([{ id: 5 }]);

    await InactivityPolicyService.setPolicy(10, 'agent', 60, 1);

    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE inactivity_policies'),
      expect.objectContaining({ maxInactiveDays: 60 })
    );
  });

  it('deletes the policy when maxInactiveDays is null', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });

    await InactivityPolicyService.setPolicy(10, 'agent', null, 1);

    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM inactivity_policies'),
      expect.objectContaining({ tenantId: 10, role: 'agent' })
    );
  });
});
