import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';
import { PendingNotificationService } from './pending-notification.service';
import { TenantSettingsService, levelFromXp } from './tenant-settings.service';
import { ReminderService, isEscalationDue, learnerReminderType } from './reminder.service';
import { CertificateService } from './certificate.service';
import quizRoutes from '../routes/quiz.routes';
import analyticsRoutes, { xpFor } from '../routes/analytics.routes';
import badgeRoutes from '../routes/badge.routes';
import organizationRoutes from '../routes/organization.routes';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('./database.service');
jest.mock('./audit.service');
jest.mock('./notification.service');
jest.mock('./pending-notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedSend = NotificationService.send as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/quizzes', quizRoutes);
  app.use('/analytics', analyticsRoutes);
  app.use('/badges', badgeRoutes);
  app.use('/organizations', organizationRoutes);
  app.use(errorHandler);
  return app;
}

const USER = { id: 3, tenantId: 10, email: 'u@test.com', role: 'admin', directionId: 2, serviceId: 5 };
const token = (overrides: Record<string, any> = {}) => jwt.sign({ ...USER, ...overrides }, config.jwt.secret);

const settingsRow = (overrides: Record<string, any> = {}) => ({
  quiz_default_passing_score: 70, quiz_default_max_attempts: 3, certificate_reminder_days: 30,
  assignment_reminder_days: 7, assignment_urgent_days: 1, escalation_days_overdue: 1,
  enable_badges: true, enable_xp: true, leaderboard_scope: 'organization',
  xp_per_course: 100, xp_per_quiz: 50, xp_per_lesson: 10, xp_per_level: 250, enable_notifications: true,
  ...overrides,
});

/** Mocks the DB: the settings row (null = none), the auth lookup, and route-specific answers. */
function mockDb(settings: Record<string, any> | null, extra: (q: string, p: any) => any = () => undefined, role = 'admin') {
  mockedQuery.mockImplementation((query: string, params: any) => {
    if (query.includes('FROM tenant_settings WHERE tenant_id')) return Promise.resolve(settings ? [settings] : []);
    if (query.includes('FROM users WHERE id = @id')) {
      return Promise.resolve([{ id: 3, tenant_id: 10, email: 'u@test.com', role, is_active: true, direction_id: 2, service_id: 5 }]);
    }
    return Promise.resolve(extra(query, params) ?? []);
  });
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
}

const call = (q: string) => mockedQuery.mock.calls.find(([sql]: [string]) => sql.includes(q));

beforeEach(() => {
  TenantSettingsService.clearCache();
  mockedQuery.mockReset();
  mockedExecute.mockReset();
  mockedSend.mockReset().mockResolvedValue({ id: 1, status: 'sent', channel: 'email' });
});

describe('levels and XP', () => {
  it('computes a 1-based level with the organization scale', () => {
    expect(levelFromXp(0, 250)).toEqual({ level: 1, xpIntoLevel: 0, xpPerLevel: 250 });
    expect(levelFromXp(260, 250)).toEqual({ level: 2, xpIntoLevel: 10, xpPerLevel: 250 });
    expect(levelFromXp(260, 100).level).toBe(3);
  });

  it('weighs activity with the organization XP scale', () => {
    const counts = { coursesCompleted: 1, quizzesPassed: 2, lessonsCompleted: 3 };
    expect(xpFor(counts, { xpPerCourse: 100, xpPerQuiz: 50, xpPerLesson: 10 })).toBe(230);
    expect(xpFor(counts, { xpPerCourse: 0, xpPerQuiz: 5, xpPerLesson: 1 })).toBe(13);
  });
});

describe('new quizzes', () => {
  const create = (body: Record<string, any> = {}) =>
    request(makeApp()).post('/quizzes').set('Authorization', `Bearer ${token()}`).send({ lessonId: 1, title: 'Q', ...body });

  it("take the organization's pass mark and attempts", async () => {
    mockDb(settingsRow({ quiz_default_passing_score: 80, quiz_default_max_attempts: 2 }), (q) =>
      q.includes('INSERT INTO quizzes') ? [{ id: 7 }] : q.includes('FROM quizzes') ? [{ id: 7 }] : undefined
    );
    expect((await create()).status).toBe(201);
    expect(call('INSERT INTO quizzes')[1]).toMatchObject({ passingScore: 80, maxAttempts: 2 });
  });

  it('store unlimited attempts as NULL, and keep explicit values', async () => {
    mockDb(settingsRow({ quiz_default_max_attempts: 0 }), (q) =>
      q.includes('INSERT INTO quizzes') ? [{ id: 7 }] : q.includes('FROM quizzes') ? [{ id: 7 }] : undefined
    );
    await create({ passingScore: 55 });
    expect(call('INSERT INTO quizzes')[1]).toMatchObject({ passingScore: 55, maxAttempts: null });
  });
});

describe('assignment reminders', () => {
  const thresholds = { assignmentReminderDays: 10, assignmentUrgentDays: 2 };

  it('picks the reminder from the organization thresholds', () => {
    expect(learnerReminderType(11, thresholds)).toBeNull();
    expect(learnerReminderType(10, thresholds)).toBe('upcoming');
    expect(learnerReminderType(3, thresholds)).toBe('upcoming');
    expect(learnerReminderType(2, thresholds)).toBe('urgent');
    expect(learnerReminderType(0, thresholds)).toBe('urgent');
    expect(learnerReminderType(-1, thresholds)).toBe('overdue');
    expect(learnerReminderType(-8, thresholds)).toBeNull();
    expect(learnerReminderType(5, { assignmentReminderDays: 0, assignmentUrgentDays: 0 })).toBeNull();
  });

  it('escalates after the configured delay, never when off', () => {
    expect(isEscalationDue(-2, 3)).toBe(false);
    expect(isEscalationDue(-3, 3)).toBe(true);
    expect(isEscalationDue(-10, 3)).toBe(true);
    expect(isEscalationDue(-11, 3)).toBe(false);
    expect(isEscalationDue(-5, 0)).toBe(false);
  });

  function assignmentDueIn(days: number) {
    const due = new Date();
    due.setDate(due.getDate() + days);
    return {
      assignment_id: 1, tenant_id: 10, course_id: 100, course_title: 'Sécurité', due_date: due.toISOString(),
      user_id: 42, display_name: 'Jane', service_id: 5, direction_id: 2, supervisor_id: null,
    };
  }

  it('leaves organizations with notifications off untouched (nothing recorded as sent)', async () => {
    mockDb(settingsRow({ enable_notifications: false }), (q) => (q.includes('FROM course_assignments') ? [assignmentDueIn(1)] : undefined));
    const result = await ReminderService.runDailyAssignmentReminders();
    expect(result).toEqual({ remindersSent: 0, escalationsSent: 0 });
    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('sends the urgent reminder with the real number of days left', async () => {
    mockDb(settingsRow({ assignment_urgent_days: 3 }), (q) => (q.includes('FROM course_assignments') ? [assignmentDueIn(3)] : undefined));
    await ReminderService.runDailyAssignmentReminders();
    expect(mockedSend.mock.calls[0][0].subject).toContain('dans 3 jours');
  });
});

describe('certificate renewal reminders', () => {
  it("use each organization's delay, skip organizations that turned them off and revoked certificates", async () => {
    mockDb(null);
    await CertificateService.runExpiryReminders();
    const [sql] = call('FROM certificates c');
    expect(sql).toContain('LEFT JOIN tenant_settings ts');
    expect(sql).toContain('COALESCE(ts.certificate_reminder_days, 30) > 0');
    expect(sql).toContain('c.revoked_at IS NULL');
    expect(PendingNotificationService.queue).not.toHaveBeenCalled();
  });
});

describe('leaderboard', () => {
  const leaderboard = (overrides: Record<string, any> = {}) =>
    request(makeApp()).get('/analytics/leaderboard').set('Authorization', `Bearer ${token(overrides)}`);

  it('is empty when the organization hides it', async () => {
    mockDb(settingsRow({ leaderboard_scope: 'hidden' }));
    const response = await leaderboard();
    expect(response.body).toMatchObject({ data: [], meta: { scope: 'hidden' } });
    expect(call('FROM users u')).toBeUndefined();
  });

  it('is empty when XP is off', async () => {
    mockDb(settingsRow({ enable_xp: false }));
    expect((await leaderboard()).body.meta.scope).toBe('hidden');
  });

  it("is limited to the requester's service, with the organization XP scale", async () => {
    mockDb(settingsRow({ leaderboard_scope: 'service', xp_per_course: 40 }), (q) =>
      q.includes('FROM users u') ? [{ id: 9, display_name: 'Top', xp: '120' }] : undefined
    );
    const response = await leaderboard();
    const [sql, params] = call('FROM users u');
    expect(sql).toContain('AND u.service_id = @unitId');
    expect(sql).toContain('COALESCE(e.completed, 0) * 40');
    expect(params.unitId).toBe(5);
    expect(response.body.data).toEqual([{ id: 9, display_name: 'Top', xp: 120 }]);
  });
});

describe('badges', () => {
  it('are not awarded automatically when the organization turned them off', async () => {
    mockDb(settingsRow({ enable_badges: false }));
    const response = await request(makeApp())
      .post('/badges/award-course')
      .set('Authorization', `Bearer ${token()}`)
      .send({ courseId: 1, action: 'complete' });
    expect(response.body.data).toEqual({ awardedBadges: [], message: null });
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it("no longer expose colleagues' email addresses in the badge ranking", async () => {
    mockDb(settingsRow(), (q) => (q.includes('FROM users u') ? [{ id: 9, display_name: 'Top', badge_count: 3 }] : undefined));
    await request(makeApp()).get('/badges/stats/leaderboard').set('Authorization', `Bearer ${token()}`);
    expect(call('FROM users u')[0]).not.toContain('email');
  });
});

describe('PUT /organizations/current/settings (learning)', () => {
  const save = (body: Record<string, any>) =>
    request(makeApp()).put('/organizations/current/settings').set('Authorization', `Bearer ${token()}`).send(body);

  it('stores the learning settings and keeps the others', async () => {
    mockDb(settingsRow({ max_login_attempts: 9 }), (q) => (q.includes('SELECT id FROM tenant_settings') ? [{ id: 1 }] : undefined));
    const response = await save({ quizDefaultPassingScore: 85, leaderboardScope: 'direction', xpPerLevel: 500 });
    expect(response.status).toBe(200);
    const [sql, params] = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('UPDATE tenant_settings'));
    expect(sql).toContain('leaderboard_scope = @leaderboardScope');
    expect(params).toMatchObject({ quizDefaultPassingScore: 85, leaderboardScope: 'direction', xpPerLevel: 500, maxLoginAttempts: 9 });
  });

  it.each([[{ leaderboardScope: 'everyone' }], [{ xpPerLevel: 0 }], [{ quizDefaultPassingScore: 101 }], [{ escalationDaysOverdue: -1 }]])(
    'rejects %j',
    async (body) => {
      mockDb(settingsRow());
      expect((await save(body)).status).toBe(400);
    }
  );
});
