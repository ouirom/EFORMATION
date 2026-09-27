import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { TeamService } from '../services/team.service';
import { TeamReportService } from '../services/team-report.service';
import { BadRequestError } from '../middleware/error.middleware';
import { db, IS_PG } from '../database/db-helpers';
import { asyncHandler } from '../middleware/asyncHandler';
import { teamAssignmentClause } from '../utils/teamAssignment';
import { dayKey, getTenantTimezone, shiftDayKey } from '../utils/tenantTime';

const router = Router();

// Both take the distinct calendar days (as 'YYYY-MM-DD' strings) a user was
// active on -- lesson access and quiz attempts stand in for "activity" since
// there's no dedicated login/activity log. Days are taken in the tenant's time
// zone (Organization settings): counted in UTC, activity just after local
// midnight in any zone ahead of UTC (Paris, Lagos...) landed on the previous day.

/** Consecutive run of active days ending today or yesterday (in `timeZone`) -- a
 * day's grace so the streak doesn't reset the instant the clock rolls past
 * midnight before the user has had a chance to be active "today". */
export function computeCurrentStreak(activeDays: Set<string>, timeZone = 'UTC', now = new Date()): number {
  let cursor = dayKey(now, timeZone);
  if (!activeDays.has(cursor)) cursor = shiftDayKey(cursor, -1);
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak++;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

/** Longest run of consecutive active days across the user's whole history. */
export function computeLongestStreak(activeDays: Set<string>): number {
  const sorted = Array.from(activeDays).sort();
  let longest = 0;
  let current = 0;
  let prevDay: Date | null = null;
  for (const day of sorted) {
    const thisDay = new Date(`${day}T00:00:00Z`);
    current = prevDay && (thisDay.getTime() - prevDay.getTime()) === 86400000 ? current + 1 : 1;
    longest = Math.max(longest, current);
    prevDay = thisDay;
  }
  return longest;
}

// Dashboard counters (lessons, quizzes, XP, leaderboard) only count activity on
// published, non-deleted courses -- the same rule as the course list and lesson
// catalog, so an unpublished course disappears from every counter at once (and
// comes back, progress intact, if it's republished). Learning time is the one
// exception: it's time actually spent, so it keeps the whole history.
const lessonCourseJoin = (lpAlias: string) =>
  `LEFT JOIN lessons vl ON vl.id = ${lpAlias}.lesson_id AND vl.deleted_at IS NULL
   LEFT JOIN modules vm ON vm.id = vl.module_id
   LEFT JOIN courses vc ON vc.id = vm.course_id AND vc.is_published = ${db.bool(true)} AND vc.deleted_at IS NULL`;
const quizCourseJoin = (qaAlias: string) =>
  `JOIN quizzes vq ON vq.id = ${qaAlias}.quiz_id
   JOIN lessons vl ON vl.id = vq.lesson_id AND vl.deleted_at IS NULL
   JOIN modules vm ON vm.id = vl.module_id
   JOIN courses vc ON vc.id = vm.course_id AND vc.is_published = ${db.bool(true)} AND vc.deleted_at IS NULL`;

/**
 * @route GET /api/v1/analytics/my-stats
 * @desc Get user's personal dashboard statistics
 */
router.get('/my-stats', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  // Get all user stats in parallel
  const [
    enrollmentStats,
    lessonStats,
    quizStats,
    badgeStats,
    activityDates,
    timeZone,
  ] = await Promise.all([
    // Course enrollment stats
    DatabaseService.query<any>(
      // Unpublished/deleted courses are left out so these counts match what
      // GET /my-courses (and the dashboard's course list) can actually show.
      `SELECT
         COUNT(*) as total_enrolled,
         SUM(CASE WHEN e.completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
         AVG(COALESCE(e.progress_percent, 0)) as avg_progress
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.tenant_id = @tenantId AND e.user_id = @userId
         AND c.is_published = ${db.bool(true)} AND c.deleted_at IS NULL`,
      { tenantId, userId }
    ),
    // Lesson progress stats
    DatabaseService.query<any>(
      `SELECT
         SUM(CASE WHEN vc.id IS NOT NULL THEN 1 ELSE 0 END) as total_started,
         SUM(CASE WHEN vc.id IS NOT NULL AND lp.status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(COALESCE(lp.time_spent_seconds, 0)) as total_time_seconds
       FROM lesson_progress lp
       ${lessonCourseJoin('lp')}
       WHERE lp.tenant_id = @tenantId AND lp.user_id = @userId`,
      { tenantId, userId }
    ),
    // Quiz stats
    DatabaseService.query<any>(
      `SELECT
         COUNT(*) as total_attempts,
         SUM(CASE WHEN qa.passed = ${db.bool(true)} THEN 1 ELSE 0 END) as passed,
         AVG(qa.score) as avg_score
       FROM quiz_attempts qa
       ${quizCourseJoin('qa')}
       WHERE qa.tenant_id = @tenantId AND qa.user_id = @userId`,
      { tenantId, userId }
    ),
    // Badge stats
    DatabaseService.query<any>(
      `SELECT COUNT(*) as total_badges
       FROM user_badges
       WHERE tenant_id = @tenantId AND user_id = @userId`,
      { tenantId, userId }
    ),
    // Distinct activity days, for the streak -- lesson access and quiz attempts
    // are the only two "the user did something" timestamps available.
    DatabaseService.query<{ activity_at: any }>(
      `SELECT last_accessed_at as activity_at FROM lesson_progress
       WHERE tenant_id = @tenantId AND user_id = @userId AND last_accessed_at IS NOT NULL
       UNION
       SELECT started_at as activity_at FROM quiz_attempts
       WHERE tenant_id = @tenantId AND user_id = @userId`,
      { tenantId, userId }
    ),
    getTenantTimezone(tenantId),
  ]);

  const enrollment = enrollmentStats[0] || {};
  const lesson = lessonStats[0] || {};
  const quiz = quizStats[0] || {};
  const badge = badgeStats[0] || {};

  // Calculate total learning time from lesson progress
  const totalSeconds = lesson.total_time_seconds || 0;
  const totalMinutes = Math.round(totalSeconds / 60);
  const totalHours = Math.floor(totalSeconds / 3600);

  const activeDays = new Set(activityDates.map((r) => dayKey(new Date(r.activity_at), timeZone)));
  const streak = computeCurrentStreak(activeDays, timeZone);
  const longestStreak = computeLongestStreak(activeDays);
  const xp = (enrollment.completed || 0) * 100 + (quiz.passed || 0) * 50 + (lesson.completed || 0) * 10;

  res.json({
    success: true,
    data: {
      coursesEnrolled: enrollment.total_enrolled || 0,
      coursesCompleted: enrollment.completed || 0,
      lessonsStarted: lesson.total_started || 0,
      lessonsCompleted: lesson.completed || 0,
      totalHours,
      totalMinutes,
      totalSeconds,
      quizzesTaken: quiz.total_attempts || 0,
      quizzesPassed: quiz.passed || 0,
      avgQuizScore: Math.round(quiz.avg_score || 0),
      badges: badge.total_badges || 0,
      streak,
      longestStreak,
      xp,
      avgProgress: Math.round(enrollment.avg_progress || 0),
    },
  });
}));

/**
 * @route GET /api/v1/analytics/my-courses
 * @desc The learner's dashboard course list in one shot: every published course
 * that is either assigned to them (directly or via org/role/team) or that they
 * are enrolled in, with enrollment progress, lesson counts, mandatory flag and
 * the earliest due date across the matching assignments.
 */
router.get('/my-courses', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const { tenantId, id: userId, enterpriseId, directionId, serviceId, role: userRole } = req.user!;

  const rows = await DatabaseService.query<any>(
    `SELECT c.id, c.public_id, c.title, c.category, c.duration, c.level,
            e.progress_percent, e.completed_at, e.enrolled_at,
            a.is_mandatory, a.due_date,
            CASE WHEN a.course_id IS NOT NULL THEN 1 ELSE 0 END as is_assigned,
            (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id
             WHERE m.course_id = c.id AND l.deleted_at IS NULL) as total_lessons,
            (SELECT COUNT(*) FROM lesson_progress lp
             JOIN lessons l ON lp.lesson_id = l.id JOIN modules m ON l.module_id = m.id
             WHERE m.course_id = c.id AND l.deleted_at IS NULL
               AND lp.user_id = @userId AND lp.tenant_id = @tenantId AND lp.status = 'completed') as completed_lessons
     FROM courses c
     LEFT JOIN enrollments e ON e.course_id = c.id AND e.user_id = @userId AND e.tenant_id = @tenantId
     LEFT JOIN (
       SELECT ca.course_id,
              MAX(CASE WHEN ca.is_mandatory = ${db.bool(true)} THEN 1 ELSE 0 END) as is_mandatory,
              MIN(ca.due_date) as due_date
       FROM course_assignments ca
       WHERE ca.tenant_id = @tenantId
         AND (
           (ca.assignment_type = 'user' AND ca.target_id = @userId)
           OR (ca.assignment_type = 'enterprise' AND ca.target_id = @enterpriseId)
           OR (ca.assignment_type = 'direction' AND ca.target_id = @directionId)
           OR (ca.assignment_type = 'service' AND ca.target_id = @serviceId)
           OR (ca.assignment_type = 'role' AND ca.target_role = @userRole)
           OR ${teamAssignmentClause('ca', 'userId', 'enterpriseId', 'directionId', 'serviceId')}
         )
       GROUP BY ca.course_id
     ) a ON a.course_id = c.id
     WHERE c.tenant_id = @tenantId AND c.is_published = ${db.bool(true)} AND c.deleted_at IS NULL
       AND (e.id IS NOT NULL OR a.course_id IS NOT NULL)
     ORDER BY is_mandatory DESC, due_date ASC, c.title`,
    {
      tenantId,
      userId,
      enterpriseId: enterpriseId || 0,
      directionId: directionId || 0,
      serviceId: serviceId || 0,
      userRole,
    }
  );

  res.json({
    success: true,
    data: rows.map((c: any) => {
      const progress = Math.round(Number(c.progress_percent) || 0);
      return {
        id: Number(c.id),
        publicId: c.public_id,
        title: c.title,
        category: c.category,
        duration: c.duration,
        level: c.level,
        isAssigned: Number(c.is_assigned) === 1,
        isMandatory: Number(c.is_mandatory) === 1,
        dueDate: c.due_date,
        isEnrolled: c.enrolled_at != null,
        progress,
        isCompleted: c.completed_at != null || progress >= 100,
        completedAt: c.completed_at,
        totalLessons: Number(c.total_lessons) || 0,
        completedLessons: Number(c.completed_lessons) || 0,
      };
    }),
  });
}));

/**
 * @route GET /api/v1/analytics/leaderboard
 * @desc Top learners in the tenant by the same XP formula as /my-stats
 * (completed courses * 100 + passed quizzes * 50 + completed lessons * 10,
 * counting only published, non-deleted courses -- same filter as /my-stats),
 * so the dashboard's leaderboard reflects genuine activity instead of
 * placeholder names.
 */
router.get('/leaderboard', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const tenantId = req.user!.tenantId;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 5, 20);

  const rows = await DatabaseService.query<any>(
    IS_PG
      ? `SELECT u.id, u.display_name, u.avatar_url,
                (COALESCE(e.completed, 0) * 100 + COALESCE(q.passed, 0) * 50 + COALESCE(l.completed, 0) * 10) as xp
         FROM users u
         LEFT JOIN (
           SELECT en.user_id, SUM(CASE WHEN en.completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed
           FROM enrollments en JOIN courses co ON co.id = en.course_id
           WHERE en.tenant_id = @tenantId AND co.is_published = ${db.bool(true)} AND co.deleted_at IS NULL
           GROUP BY en.user_id
         ) e ON e.user_id = u.id
         LEFT JOIN (
           SELECT qa.user_id, SUM(CASE WHEN qa.passed = ${db.bool(true)} THEN 1 ELSE 0 END) as passed
           FROM quiz_attempts qa ${quizCourseJoin('qa')}
           WHERE qa.tenant_id = @tenantId GROUP BY qa.user_id
         ) q ON q.user_id = u.id
         LEFT JOIN (
           SELECT lp.user_id, SUM(CASE WHEN vc.id IS NOT NULL AND lp.status = 'completed' THEN 1 ELSE 0 END) as completed
           FROM lesson_progress lp ${lessonCourseJoin('lp')}
           WHERE lp.tenant_id = @tenantId GROUP BY lp.user_id
         ) l ON l.user_id = u.id
         WHERE u.tenant_id = @tenantId AND u.deleted_at IS NULL
         ORDER BY xp DESC
         LIMIT @limit`
      : `SELECT TOP (@limit) u.id, u.display_name, u.avatar_url,
                (COALESCE(e.completed, 0) * 100 + COALESCE(q.passed, 0) * 50 + COALESCE(l.completed, 0) * 10) as xp
         FROM users u
         LEFT JOIN (
           SELECT en.user_id, SUM(CASE WHEN en.completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed
           FROM enrollments en JOIN courses co ON co.id = en.course_id
           WHERE en.tenant_id = @tenantId AND co.is_published = ${db.bool(true)} AND co.deleted_at IS NULL
           GROUP BY en.user_id
         ) e ON e.user_id = u.id
         LEFT JOIN (
           SELECT qa.user_id, SUM(CASE WHEN qa.passed = ${db.bool(true)} THEN 1 ELSE 0 END) as passed
           FROM quiz_attempts qa ${quizCourseJoin('qa')}
           WHERE qa.tenant_id = @tenantId GROUP BY qa.user_id
         ) q ON q.user_id = u.id
         LEFT JOIN (
           SELECT lp.user_id, SUM(CASE WHEN vc.id IS NOT NULL AND lp.status = 'completed' THEN 1 ELSE 0 END) as completed
           FROM lesson_progress lp ${lessonCourseJoin('lp')}
           WHERE lp.tenant_id = @tenantId GROUP BY lp.user_id
         ) l ON l.user_id = u.id
         WHERE u.tenant_id = @tenantId AND u.deleted_at IS NULL
         ORDER BY xp DESC`,
    { tenantId, limit }
  );

  res.json({ success: true, data: rows.filter((r: any) => r.xp > 0).slice(0, limit) });
}));

/**
 * @route GET /api/v1/analytics/my-team
 * @desc Activity of the users hierarchically attached to the requester, scoped by
 * their role: director -> subordinates in their direction, manager -> subordinates
 * in their service, supervisor -> only the agents explicitly assigned to them
 * (users.supervisor_id). admin/super_admin see the whole tenant.
 */
router.get('/my-team', authenticate, authorize('admin', 'director', 'manager', 'supervisor', 'super_admin'), asyncHandler(async (req: AuthRequest, res) => {
  const team = await TeamService.getTeamActivity({
    tenantId: req.user!.tenantId,
    id: req.user!.id,
    role: req.user!.role,
    directionId: req.user!.directionId,
    serviceId: req.user!.serviceId,
  });
  res.json({ success: true, data: team });
}));

/**
 * @route GET /api/v1/analytics/my-team/report-settings
 * @desc The requester's own team-report subscription (self-service)
 */
router.get('/my-team/report-settings', authenticate, authorize('admin', 'director', 'manager', 'supervisor', 'super_admin'), asyncHandler(async (req: AuthRequest, res) => {
  const rows = await DatabaseService.query<any>(
    `SELECT is_enabled, frequency, weekday, channel_email, channel_in_app, last_sent_at
     FROM team_report_subscriptions WHERE tenant_id = @tenantId AND user_id = @userId`,
    { tenantId: req.user!.tenantId, userId: req.user!.id }
  );

  const row = rows[0];
  res.json({
    success: true,
    data: row
      ? {
          isEnabled: row.is_enabled,
          frequency: row.frequency,
          weekday: row.weekday,
          channelEmail: row.channel_email,
          channelInApp: row.channel_in_app,
          lastSentAt: row.last_sent_at,
        }
      : { isEnabled: false, frequency: 'weekly', weekday: 1, channelEmail: true, channelInApp: true, lastSentAt: null },
  });
}));

/**
 * @route PUT /api/v1/analytics/my-team/report-settings
 * @desc Create or update the requester's own team-report subscription
 */
router.put(
  '/my-team/report-settings',
  authenticate,
  authorize('admin', 'director', 'manager', 'supervisor', 'super_admin'),
  [
    body('isEnabled').isBoolean(),
    body('frequency').isIn(['daily', 'weekly']),
    body('weekday').optional({ nullable: true }).isInt({ min: 0, max: 6 }),
    body('channelEmail').isBoolean(),
    body('channelInApp').isBoolean(),
  ],
  asyncHandler(async (req: AuthRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
    }

    const { isEnabled, frequency, channelEmail, channelInApp } = req.body;
    const weekday = frequency === 'weekly' ? (req.body.weekday ?? 1) : null;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const existing = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM team_report_subscriptions WHERE tenant_id = @tenantId AND user_id = @userId',
      { tenantId, userId }
    );

    if (existing.length > 0) {
      await DatabaseService.execute(
        `UPDATE team_report_subscriptions
         SET is_enabled = @isEnabled, frequency = @frequency, weekday = @weekday,
             channel_email = @channelEmail, channel_in_app = @channelInApp, updated_at = ${db.now()}
         WHERE tenant_id = @tenantId AND user_id = @userId`,
        { tenantId, userId, isEnabled, frequency, weekday, channelEmail, channelInApp }
      );
    } else {
      await DatabaseService.execute(
        `INSERT INTO team_report_subscriptions (tenant_id, user_id, is_enabled, frequency, weekday, channel_email, channel_in_app)
         VALUES (@tenantId, @userId, @isEnabled, @frequency, @weekday, @channelEmail, @channelInApp)`,
        { tenantId, userId, isEnabled, frequency, weekday, channelEmail, channelInApp }
      );
    }

    res.json({ success: true, data: { isEnabled, frequency, weekday, channelEmail, channelInApp } });
  })
);

/**
 * @route POST /api/v1/analytics/my-team/report/run
 * @desc Manually trigger the team-report digest job (admin only, for testing/on-demand runs)
 */
router.post('/my-team/report/run', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res) => {
  const result = await TeamReportService.runDailyDigests();
  res.json({ success: true, data: result });
}));

/**
 * @route GET /api/v1/analytics/dashboard
 * @desc Get dashboard analytics overview (Admin)
 */
router.get('/dashboard', authenticate, authorize('admin', 'director', 'manager'), asyncHandler(async (req: AuthRequest, res) => {
  const tenantId = req.user!.tenantId;
  const timeRange = req.query.timeRange as string || '30d';

  // Calculate date range, plus the immediately preceding period of the same
  // length so trend percentages compare like-for-like rather than being hardcoded.
  const days = parseInt(timeRange.replace('d', '')) || 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const prevStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);

  // Get multiple metrics in parallel
  const [
    userStats,
    courseStats,
    enrollmentStats,
    completionStats,
    quizStats,
    recentActivity,
    dailyLogins,
    learningHoursStats,
    prevCompletionStats,
    prevLearningHoursStats,
    certificateStats,
  ] = await Promise.all([
    // User statistics (includes the previous equal-length period's new-user
    // count, for the trend comparison, computed off the same table scan).
    DatabaseService.query<any>(
      `SELECT
         COUNT(*) as total_users,
         SUM(CASE WHEN created_at >= @startDate THEN 1 ELSE 0 END) as new_users,
         SUM(CASE WHEN created_at >= @prevStartDate AND created_at < @startDate THEN 1 ELSE 0 END) as prev_new_users,
         SUM(CASE WHEN is_active = ${db.bool(true)} THEN 1 ELSE 0 END) as active_users
       FROM users WHERE tenant_id = @tenantId AND deleted_at IS NULL`,
      { tenantId, startDate, prevStartDate }
    ),
    // Course statistics (same previous-period pattern as user statistics).
    DatabaseService.query<any>(
      `SELECT
         COUNT(*) as total_courses,
         SUM(CASE WHEN is_published = ${db.bool(true)} THEN 1 ELSE 0 END) as published_courses,
         SUM(CASE WHEN created_at >= @startDate THEN 1 ELSE 0 END) as new_courses,
         SUM(CASE WHEN created_at >= @prevStartDate AND created_at < @startDate THEN 1 ELSE 0 END) as prev_new_courses
       FROM courses WHERE tenant_id = @tenantId AND deleted_at IS NULL`,
      { tenantId, startDate, prevStartDate }
    ),
    // Enrollment statistics, plus the average progress of each period's
    // cohort (enrollments started in that window) for the completion-rate trend.
    DatabaseService.query<any>(
      `SELECT
         COUNT(*) as total_enrollments,
         SUM(CASE WHEN enrolled_at >= @startDate THEN 1 ELSE 0 END) as new_enrollments,
         AVG(COALESCE(progress_percent, 0)) as avg_progress,
         AVG(CASE WHEN enrolled_at >= @startDate THEN progress_percent END) as cohort_avg_progress,
         AVG(CASE WHEN enrolled_at >= @prevStartDate AND enrolled_at < @startDate THEN progress_percent END) as prev_cohort_avg_progress
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE c.tenant_id = @tenantId`,
      { tenantId, startDate, prevStartDate }
    ),
    // Completion statistics
    DatabaseService.query<any>(
      `SELECT 
         COUNT(*) as completions,
         COUNT(DISTINCT e.user_id) as unique_completers
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE c.tenant_id = @tenantId AND e.progress_percent >= 100 AND e.completed_at >= @startDate`,
      { tenantId, startDate }
    ),
    // Quiz statistics
    DatabaseService.query<any>(
      `SELECT 
         COUNT(*) as total_attempts,
         AVG(score) as avg_score,
         SUM(CASE WHEN passed = ${db.bool(true)} THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as pass_rate
       FROM quiz_attempts qa
       JOIN quizzes q ON qa.quiz_id = q.id
       WHERE q.tenant_id = @tenantId AND qa.completed_at >= @startDate`,
      { tenantId, startDate }
    ),
    // Recent activity
    DatabaseService.query<any>(
      IS_PG
        ? `SELECT action, COUNT(*) as count
           FROM audit_logs
           WHERE tenant_id = @tenantId AND created_at >= @startDate
           GROUP BY action
           ORDER BY count DESC
           LIMIT 10`
        : `SELECT TOP 10 action, COUNT(*) as count
           FROM audit_logs
           WHERE tenant_id = @tenantId AND created_at >= @startDate
           GROUP BY action
           ORDER BY count DESC`,
      { tenantId, startDate }
    ),
    // Daily logins over the selected period, for the activity chart.
    DatabaseService.query<any>(
      `SELECT CAST(created_at AS DATE) as date, COUNT(*) as count
       FROM audit_logs
       WHERE tenant_id = @tenantId AND action IN ('USER_LOGIN', 'LDAP_LOGIN') AND created_at >= @startDate
       GROUP BY CAST(created_at AS DATE)
       ORDER BY date`,
      { tenantId, startDate }
    ),
    // Total learning hours: time actually spent in lessons, within the period.
    DatabaseService.query<any>(
      `SELECT SUM(time_spent_seconds) as total_seconds
       FROM lesson_progress
       WHERE tenant_id = @tenantId AND last_accessed_at >= @startDate`,
      { tenantId, startDate }
    ),
    // Previous equal-length period, for trend comparisons.
    DatabaseService.query<any>(
      `SELECT COUNT(*) as completions
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE c.tenant_id = @tenantId AND e.progress_percent >= 100
         AND e.completed_at >= @prevStartDate AND e.completed_at < @startDate`,
      { tenantId, startDate, prevStartDate }
    ),
    DatabaseService.query<any>(
      `SELECT SUM(time_spent_seconds) as total_seconds
       FROM lesson_progress
       WHERE tenant_id = @tenantId AND last_accessed_at >= @prevStartDate AND last_accessed_at < @startDate`,
      { tenantId, startDate, prevStartDate }
    ),
    // Certificates issued, all-time (not windowed to timeRange -- this is a
    // running total shown alongside the period-scoped metrics, same as other
    // cumulative counters on this dashboard).
    DatabaseService.query<any>(
      'SELECT COUNT(*) as total FROM certificates WHERE tenant_id = @tenantId',
      { tenantId }
    ),
  ]);

  const totalHours = Math.round(((learningHoursStats[0]?.total_seconds || 0) / 3600) * 10) / 10;
  const prevTotalHours = (prevLearningHoursStats[0]?.total_seconds || 0) / 3600;
  const completionsCount = completionStats[0].completions || 0;
  const prevCompletionsCount = prevCompletionStats[0]?.completions || 0;

  // Percent change vs. the immediately preceding period of the same length.
  // 0 previous / 0 current => no change (0%); 0 previous / >0 current => treated as a full increase (100%).
  const pctChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  };

  res.json({
    success: true,
    data: {
      users: {
        total: userStats[0].total_users,
        new: userStats[0].new_users,
        active: userStats[0].active_users,
      },
      courses: {
        total: courseStats[0].total_courses,
        published: courseStats[0].published_courses,
        new: courseStats[0].new_courses,
      },
      enrollments: {
        total: enrollmentStats[0].total_enrollments,
        new: enrollmentStats[0].new_enrollments,
        averageProgress: Math.round(enrollmentStats[0].avg_progress || 0),
      },
      completions: {
        total: completionsCount,
        uniqueUsers: completionStats[0].unique_completers,
      },
      quizzes: {
        totalAttempts: quizStats[0].total_attempts,
        averageScore: Math.round(quizStats[0].avg_score || 0),
        passRate: Math.round(quizStats[0].pass_rate || 0),
      },
      recentActivity,
      dailyLogins,
      learningHours: totalHours,
      certificatesIssued: certificateStats[0]?.total || 0,
      trends: {
        // Growth rate of new users vs. the immediately preceding period.
        users: pctChange(userStats[0].new_users, userStats[0].prev_new_users),
        // Course completions (count) this period vs. the immediately preceding period.
        completedCourses: pctChange(completionsCount, prevCompletionsCount),
        hours: pctChange(totalHours, prevTotalHours),
        // Whether each period's enrollment cohort is progressing faster or slower on average.
        completionRate: pctChange(
          enrollmentStats[0].cohort_avg_progress || 0,
          enrollmentStats[0].prev_cohort_avg_progress || 0
        ),
      },
      timeRange,
      days,
    },
  });
}));

/**
 * @route GET /api/v1/analytics/users
 * @desc Get user analytics
 */
router.get('/users', authenticate, authorize('admin', 'director'), asyncHandler(async (req: AuthRequest, res) => {
  const tenantId = req.user!.tenantId;

  // User growth over time
  const userGrowth = await DatabaseService.query<any>(
    `SELECT
       CAST(created_at AS DATE) as date,
       COUNT(*) as new_users
     FROM users
     WHERE tenant_id = @tenantId AND created_at >= ${db.dateAdd('day', '-30', db.now())}
     GROUP BY CAST(created_at AS DATE)
     ORDER BY date`,
    { tenantId }
  );

  // Users by role
  const usersByRole = await DatabaseService.query<any>(
    `SELECT role, COUNT(*) as count
     FROM users WHERE tenant_id = @tenantId
     GROUP BY role`,
    { tenantId }
  );

  // Users by organization
  const usersByOrg = await DatabaseService.query<any>(
    `SELECT e.name as organization, COUNT(u.id) as count
     FROM users u
     JOIN enterprises e ON u.enterprise_id = e.id
     WHERE u.tenant_id = @tenantId
     GROUP BY e.id, e.name
     ORDER BY count DESC`,
    { tenantId }
  );

  // Most active users
  const mostActiveUsers = await DatabaseService.query<any>(
    IS_PG
      ? `SELECT u.id, u.display_name, u.email, COUNT(al.id) as activity_count
         FROM users u
         LEFT JOIN audit_logs al ON u.id = al.user_id AND al.created_at >= ${db.dateAdd('day', '-30', db.now())}
         WHERE u.tenant_id = @tenantId
         GROUP BY u.id, u.display_name, u.email
         ORDER BY activity_count DESC
         LIMIT 10`
      : `SELECT TOP 10 u.id, u.display_name, u.email, COUNT(al.id) as activity_count
         FROM users u
         LEFT JOIN audit_logs al ON u.id = al.user_id AND al.created_at >= ${db.dateAdd('day', '-30', db.now())}
         WHERE u.tenant_id = @tenantId
         GROUP BY u.id, u.display_name, u.email
         ORDER BY activity_count DESC`,
    { tenantId }
  );

  res.json({
    success: true,
    data: {
      growth: userGrowth,
      byRole: usersByRole,
      byOrganization: usersByOrg,
      mostActive: mostActiveUsers,
    },
  });
}));

/**
 * @route GET /api/v1/analytics/courses
 * @desc Get course analytics
 */
router.get('/courses', authenticate, authorize('admin', 'director', 'manager'), asyncHandler(async (req: AuthRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Course enrollment ranking
  const courseRanking = await DatabaseService.query<any>(
    `SELECT c.id, c.title,
            COUNT(e.id) as enrollment_count,
            AVG(e.progress_percent) as avg_progress,
            SUM(CASE WHEN e.progress_percent >= 100 THEN 1 ELSE 0 END) as completions
     FROM courses c
     LEFT JOIN enrollments e ON c.id = e.course_id
     WHERE c.tenant_id = @tenantId
     GROUP BY c.id, c.title
     ORDER BY enrollment_count DESC`,
    { tenantId }
  );

  // Courses by category (category is free-text, admin-entered -- null stays
  // null here and gets a translated "Uncategorized" label client-side rather
  // than a hardcoded English string).
  const coursesByCategory = await DatabaseService.query<any>(
    `SELECT category, COUNT(*) as count
     FROM courses WHERE tenant_id = @tenantId
     GROUP BY category`,
    { tenantId }
  );

  // Course completion rates
  const completionRates = await DatabaseService.query<any>(
    `SELECT c.id, c.title,
            CASE WHEN COUNT(e.id) > 0
                 THEN SUM(CASE WHEN e.progress_percent >= 100 THEN 1 ELSE 0 END) * 100.0 / COUNT(e.id)
                 ELSE 0 END as completion_rate
     FROM courses c
     LEFT JOIN enrollments e ON c.id = e.course_id
     WHERE c.tenant_id = @tenantId
     GROUP BY c.id, c.title
     ORDER BY completion_rate DESC`,
    { tenantId }
  );

  res.json({
    success: true,
    data: {
      ranking: courseRanking,
      byCategory: coursesByCategory,
      completionRates,
    },
  });
}));

/**
 * @route GET /api/v1/analytics/courses/:id/lesson-dropoff
 * @desc For a given course, the completion funnel across its lessons (in order),
 *       so admins can see exactly where learners abandon the course.
 */
router.get(
  '/courses/:id/lesson-dropoff',
  authenticate,
  authorize('admin', 'director', 'manager'),
  asyncHandler(async (req: AuthRequest, res) => {
    const tenantId = req.user!.tenantId;
    const courseId = parseInt(req.params.id, 10);

    const [enrolledResult, lessons] = await Promise.all([
      DatabaseService.query<{ total: number }>(
        `SELECT COUNT(DISTINCT user_id) as total FROM enrollments WHERE course_id = @courseId`,
        { courseId }
      ),
      DatabaseService.query<any>(
        `SELECT l.id as lesson_id, l.title, m.title as module_title,
                (SELECT COUNT(DISTINCT lp.user_id) FROM lesson_progress lp
                 WHERE lp.lesson_id = l.id AND lp.status = 'completed') as completed_count
         FROM lessons l
         JOIN modules m ON m.id = l.module_id
         WHERE m.course_id = @courseId AND m.tenant_id = @tenantId
         ORDER BY m.position, l.position`,
        { courseId, tenantId }
      ),
    ]);

    const enrolledTotal = enrolledResult[0]?.total || 0;
    let previousCount = enrolledTotal;

    const funnel = lessons.map((lesson: any, index: number) => {
      const completedCount = lesson.completed_count || 0;
      const reachRate = enrolledTotal > 0 ? Math.round((completedCount / enrolledTotal) * 1000) / 10 : 0;
      const dropFromPrevious = index === 0 ? 0 : Math.max(previousCount - completedCount, 0);
      previousCount = completedCount;

      return {
        lessonId: lesson.lesson_id,
        lessonTitle: lesson.title,
        moduleTitle: lesson.module_title,
        position: index + 1,
        completedCount,
        reachRatePercent: reachRate,
        dropFromPrevious,
      };
    });

    res.json({
      success: true,
      data: {
        courseId,
        enrolledTotal,
        funnel,
      },
    });
  })
);

/**
 * @route GET /api/v1/analytics/learning
 * @desc Get learning analytics
 */
router.get('/learning', authenticate, authorize('admin', 'director', 'manager'), asyncHandler(async (req: AuthRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Learning activity over time -- lesson completions are tracked in
  // lesson_progress directly; no audit_logs action is ever written for them
  // (the 'lesson_completed'/'content_viewed'/'quiz_completed' actions this
  // query used to filter on don't exist anywhere in the codebase, so it
  // always returned an empty result).
  const learningActivity = await DatabaseService.query<any>(
    `SELECT CAST(completed_at AS DATE) as date, COUNT(*) as activities
     FROM lesson_progress
     WHERE tenant_id = @tenantId
       AND status = 'completed'
       AND completed_at >= ${db.dateAdd('day', '-30', db.now())}
     GROUP BY CAST(completed_at AS DATE)
     ORDER BY date`,
    { tenantId }
  );

  // Average time to completion -- enrollments has no started_at column, only
  // enrolled_at/completed_at.
  const avgCompletionTime = await DatabaseService.query<any>(
    `SELECT c.id, c.title,
            AVG(${db.diffDays('e.enrolled_at', 'e.completed_at')}) as avg_days_to_complete
     FROM courses c
     JOIN enrollments e ON c.id = e.course_id
     WHERE c.tenant_id = @tenantId AND e.completed_at IS NOT NULL
     GROUP BY c.id, c.title
     HAVING COUNT(*) >= 3`,
    { tenantId }
  );

  // Quiz performance
  const quizPerformance = await DatabaseService.query<any>(
    `SELECT q.id, q.title,
            COUNT(qa.id) as attempts,
            AVG(qa.score) as avg_score,
            MIN(qa.score) as min_score,
            MAX(qa.score) as max_score
     FROM quizzes q
     JOIN quiz_attempts qa ON q.id = qa.quiz_id
     WHERE q.tenant_id = @tenantId
     GROUP BY q.id, q.title`,
    { tenantId }
  );

  // Progress distribution
  const progressDistribution = await DatabaseService.query<any>(
    `SELECT
       CASE
         WHEN e.progress_percent = 0 THEN 'Not Started'
         WHEN e.progress_percent < 25 THEN '1-24%'
         WHEN e.progress_percent < 50 THEN '25-49%'
         WHEN e.progress_percent < 75 THEN '50-74%'
         WHEN e.progress_percent < 100 THEN '75-99%'
         ELSE 'Completed'
       END as range,
       COUNT(*) as count
     FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     WHERE c.tenant_id = @tenantId
     GROUP BY
       CASE
         WHEN e.progress_percent = 0 THEN 'Not Started'
         WHEN e.progress_percent < 25 THEN '1-24%'
         WHEN e.progress_percent < 50 THEN '25-49%'
         WHEN e.progress_percent < 75 THEN '50-74%'
         WHEN e.progress_percent < 100 THEN '75-99%'
         ELSE 'Completed'
       END`,
    { tenantId }
  );

  res.json({
    success: true,
    data: {
      activity: learningActivity,
      completionTime: avgCompletionTime,
      quizPerformance,
      progressDistribution,
    },
  });
}));

/**
 * @route GET /api/v1/analytics/badges
 * @desc Get badge analytics
 */
router.get('/badges', authenticate, authorize('admin', 'director'), asyncHandler(async (req: AuthRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Badge distribution
  const badgeDistribution = await DatabaseService.query<any>(
    `SELECT b.id, b.name, b.badge_type, COUNT(ab.id) as awarded_count
     FROM badges b
     LEFT JOIN user_badges ab ON b.id = ab.badge_id
     WHERE b.tenant_id = @tenantId
     GROUP BY b.id, b.name, b.badge_type
     ORDER BY awarded_count DESC`,
    { tenantId }
  );

  // Badges awarded over time
  const badgesOverTime = await DatabaseService.query<any>(
    `SELECT CAST(awarded_at AS DATE) as date, COUNT(*) as count
     FROM user_badges ab
     JOIN badges b ON ab.badge_id = b.id
     WHERE b.tenant_id = @tenantId AND awarded_at >= ${db.dateAdd('day', '-30', db.now())}
     GROUP BY CAST(awarded_at AS DATE)
     ORDER BY date`,
    { tenantId }
  );

  // Top badge earners
  const topEarners = await DatabaseService.query<any>(
    IS_PG
      ? `SELECT u.id, u.display_name, COUNT(ab.id) as badge_count
         FROM users u
         JOIN user_badges ab ON u.id = ab.user_id
         WHERE u.tenant_id = @tenantId
         GROUP BY u.id, u.display_name
         ORDER BY badge_count DESC
         LIMIT 10`
      : `SELECT TOP 10 u.id, u.display_name, COUNT(ab.id) as badge_count
         FROM users u
         JOIN user_badges ab ON u.id = ab.user_id
         WHERE u.tenant_id = @tenantId
         GROUP BY u.id, u.display_name
         ORDER BY badge_count DESC`,
    { tenantId }
  );

  res.json({
    success: true,
    data: {
      distribution: badgeDistribution,
      overTime: badgesOverTime,
      topEarners,
    },
  });
}));

/**
 * @route GET /api/v1/analytics/user/:userId
 * @desc Get analytics for a specific user
 */
router.get('/user/:userId', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const userId = parseInt(req.params.userId, 10);
  
  // Only allow viewing own analytics unless admin
  if (userId !== req.user!.id && !['admin', 'director'].includes(req.user!.role)) {
    res.status(403).json({ success: false, message: 'Not authorized' });
    return;
  }

  const [enrollments, completions, quizResults, badges, activity] = await Promise.all([
    // Enrollment stats
    DatabaseService.query<any>(
      `SELECT COUNT(*) as total, AVG(progress_percent) as avg_progress
       FROM enrollments WHERE user_id = @userId`,
      { userId }
    ),
    // Completions
    DatabaseService.query<any>(
      `SELECT COUNT(*) as total FROM enrollments WHERE user_id = @userId AND progress_percent >= 100`,
      { userId }
    ),
    // Quiz results
    DatabaseService.query<any>(
      `SELECT COUNT(*) as total_attempts, AVG(score) as avg_score,
              SUM(CASE WHEN passed = ${db.bool(true)} THEN 1 ELSE 0 END) as passed
       FROM quiz_attempts WHERE user_id = @userId`,
      { userId }
    ),
    // Badges
    DatabaseService.query<any>(
      `SELECT COUNT(*) as total FROM user_badges WHERE user_id = @userId`,
      { userId }
    ),
    // Recent activity
    DatabaseService.query<any>(
      IS_PG
        ? `SELECT action, entity, entity_id, created_at
           FROM audit_logs
           WHERE user_id = @userId
           ORDER BY created_at DESC
           LIMIT 20`
        : `SELECT TOP 20 action, entity, entity_id, created_at
           FROM audit_logs
           WHERE user_id = @userId
           ORDER BY created_at DESC`,
      { userId }
    ),
  ]);

  res.json({
    success: true,
    data: {
      enrollments: {
        total: enrollments[0].total,
        averageProgress: Math.round(enrollments[0].avg_progress || 0),
      },
      completions: completions[0].total,
      quizzes: {
        totalAttempts: quizResults[0].total_attempts,
        averageScore: Math.round(quizResults[0].avg_score || 0),
        passed: quizResults[0].passed,
      },
      badges: badges[0].total,
      recentActivity: activity,
    },
  });
}));

export default router;
