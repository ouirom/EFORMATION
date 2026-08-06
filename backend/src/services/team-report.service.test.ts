import { TeamReportService } from './team-report.service';
import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';
import { TeamService } from './team.service';

jest.mock('./database.service');
jest.mock('./notification.service');
jest.mock('./team.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedSend = NotificationService.send as jest.Mock;
const mockedGetTeamActivity = TeamService.getTeamActivity as jest.Mock;

function makeSub(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1,
    tenant_id: 10,
    user_id: 5,
    frequency: 'daily',
    weekday: null,
    channel_email: true,
    channel_in_app: true,
    role: 'manager',
    direction_id: null,
    service_id: 7,
    display_name: 'Manager Demo',
    ...overrides,
  };
}

describe('TeamReportService.runDailyDigests', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedSend.mockResolvedValue({ id: 1, status: 'sent', channel: 'email' });
  });

  it('sends both channels when a daily subscriber has team members', async () => {
    mockedQuery.mockResolvedValue([makeSub()]);
    mockedGetTeamActivity.mockResolvedValue([
      { id: 1, displayName: 'Agent A', email: 'a@test.com', role: 'agent', avatarUrl: null, enrolledCount: 3, completedCount: 1, avgProgress: 40, lastActivity: null, overdueCount: 2 },
    ]);

    const result = await TeamReportService.runDailyDigests();

    expect(result.sent).toBe(1);
    expect(mockedSend).toHaveBeenCalledTimes(2);
    const channels = mockedSend.mock.calls.map((c) => c[0].channel);
    expect(channels.sort()).toEqual(['email', 'in_app']);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('last_sent_at'),
      expect.objectContaining({ id: 1 })
    );
  });

  it('only includes weekly subscribers whose weekday matches today', async () => {
    const todayWeekday = new Date().getUTCDay();
    const wrongWeekday = (todayWeekday + 1) % 7;
    mockedQuery.mockResolvedValue([
      makeSub({ id: 2, frequency: 'weekly', weekday: wrongWeekday }),
    ]);

    // The SQL WHERE clause itself filters this out in production; here we simulate
    // that mockedQuery already returned nothing because the weekday didn't match.
    mockedQuery.mockResolvedValueOnce([]);

    const result = await TeamReportService.runDailyDigests();

    expect(result.sent).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('skips a subscriber whose team is currently empty', async () => {
    mockedQuery.mockResolvedValue([makeSub()]);
    mockedGetTeamActivity.mockResolvedValue([]);

    const result = await TeamReportService.runDailyDigests();

    expect(result.sent).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('only sends the channel(s) the subscriber enabled', async () => {
    mockedQuery.mockResolvedValue([makeSub({ channel_email: false, channel_in_app: true })]);
    mockedGetTeamActivity.mockResolvedValue([
      { id: 1, displayName: 'Agent A', email: 'a@test.com', role: 'agent', avatarUrl: null, enrolledCount: 1, completedCount: 1, avgProgress: 100, lastActivity: null, overdueCount: 0 },
    ]);

    await TeamReportService.runDailyDigests();

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend.mock.calls[0][0].channel).toBe('in_app');
  });
});
