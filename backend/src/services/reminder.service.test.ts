import { ReminderService } from './reminder.service';
import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';

jest.mock('./database.service');
jest.mock('./notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedSend = NotificationService.send as jest.Mock;

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function makeAssignmentRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    assignment_id: 1,
    tenant_id: 10,
    course_id: 100,
    course_title: 'Sécurité incendie',
    due_date: daysFromNow(7),
    user_id: 42,
    display_name: 'Jane Doe',
    service_id: 5,
    direction_id: 2,
    ...overrides,
  };
}

describe('ReminderService.runDailyAssignmentReminders', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedSend.mockResolvedValue({ id: 1, status: 'sent', channel: 'email' });
  });

  it('sends an "upcoming" reminder exactly 7 days before the due date', async () => {
    const row = makeAssignmentRow({ due_date: daysFromNow(7) });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM course_assignments')) return Promise.resolve([row]);
      if (query.includes('FROM assignment_reminders')) return Promise.resolve([]); // never sent before
      return Promise.resolve([]);
    });

    const result = await ReminderService.runDailyAssignmentReminders();

    expect(result.remindersSent).toBe(1);
    expect(result.escalationsSent).toBe(0);
    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend.mock.calls[0][0]).toMatchObject({ userId: 42, channel: 'email' });
  });

  it('does not resend a reminder that was already recorded', async () => {
    const row = makeAssignmentRow({ due_date: daysFromNow(1) });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM course_assignments')) return Promise.resolve([row]);
      if (query.includes('FROM assignment_reminders')) return Promise.resolve([{ id: 999 }]); // already sent
      return Promise.resolve([]);
    });

    const result = await ReminderService.runDailyAssignmentReminders();

    expect(result.remindersSent).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('sends an overdue reminder and escalates to the manager one day after the due date', async () => {
    const row = makeAssignmentRow({ due_date: daysFromNow(-1) });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM course_assignments')) return Promise.resolve([row]);
      if (query.includes('FROM assignment_reminders')) return Promise.resolve([]);
      if (query.includes('FROM users')) {
        return Promise.resolve([{ id: 77, display_name: 'Manager Bob' }]);
      }
      return Promise.resolve([]);
    });

    const result = await ReminderService.runDailyAssignmentReminders();

    expect(result.remindersSent).toBe(1);
    expect(result.escalationsSent).toBe(1);
    expect(mockedSend).toHaveBeenCalledTimes(2);
    const escalationCall = mockedSend.mock.calls.find((call) => call[0].userId === 77);
    expect(escalationCall).toBeDefined();
  });

  it("escalates to the learner's direct supervisor when one is assigned, instead of the generic service/direction lookup", async () => {
    const row = makeAssignmentRow({ due_date: daysFromNow(-1), supervisor_id: 88 });
    mockedQuery.mockImplementation((query: string, params: any) => {
      if (query.includes('FROM course_assignments')) return Promise.resolve([row]);
      if (query.includes('FROM assignment_reminders')) return Promise.resolve([]);
      if (query.includes('WHERE id = @supervisorId')) {
        expect(params.supervisorId).toBe(88);
        return Promise.resolve([{ id: 88, display_name: 'Direct Supervisor' }]);
      }
      if (query.includes('SELECT TOP 1 id, display_name FROM users')) {
        throw new Error('should not fall back to the service/direction lookup when supervisor_id is set');
      }
      return Promise.resolve([]);
    });

    const result = await ReminderService.runDailyAssignmentReminders();

    expect(result.escalationsSent).toBe(1);
    const escalationCall = mockedSend.mock.calls.find((call) => call[0].userId === 88);
    expect(escalationCall).toBeDefined();
  });

  it('falls back to the service/direction lookup when the learner has no assigned supervisor', async () => {
    const row = makeAssignmentRow({ due_date: daysFromNow(-1), supervisor_id: null });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM course_assignments')) return Promise.resolve([row]);
      if (query.includes('FROM assignment_reminders')) return Promise.resolve([]);
      if (query.includes('SELECT TOP 1 id, display_name FROM users')) {
        return Promise.resolve([{ id: 77, display_name: 'Manager Bob' }]);
      }
      return Promise.resolve([]);
    });

    const result = await ReminderService.runDailyAssignmentReminders();

    expect(result.escalationsSent).toBe(1);
    const escalationCall = mockedSend.mock.calls.find((call) => call[0].userId === 77);
    expect(escalationCall).toBeDefined();
  });

  it('skips escalation when no manager can be found', async () => {
    const row = makeAssignmentRow({ due_date: daysFromNow(-1) });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM course_assignments')) return Promise.resolve([row]);
      if (query.includes('FROM assignment_reminders')) return Promise.resolve([]);
      if (query.includes('FROM users')) return Promise.resolve([]); // no manager found
      return Promise.resolve([]);
    });

    const result = await ReminderService.runDailyAssignmentReminders();

    expect(result.escalationsSent).toBe(0);
    expect(mockedSend).toHaveBeenCalledTimes(1); // only the learner's overdue reminder
  });

  it('does nothing for assignments that are neither at a reminder threshold nor overdue', async () => {
    const row = makeAssignmentRow({ due_date: daysFromNow(3) });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM course_assignments')) return Promise.resolve([row]);
      return Promise.resolve([]);
    });

    const result = await ReminderService.runDailyAssignmentReminders();

    expect(result.remindersSent).toBe(0);
    expect(result.escalationsSent).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
  });
});
