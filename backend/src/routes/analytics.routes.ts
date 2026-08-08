import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';

const router = Router();

/**
 * @route GET /api/v1/analytics/my-stats
 * @desc Get user's personal dashboard statistics
 */
router.get('/my-stats', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Get all user stats in parallel
    const [
      enrollmentStats,
      lessonStats,
      quizStats,
      badgeStats,
    ] = await Promise.all([
      // Course enrollment stats
      DatabaseService.query<any>(
        `SELECT 
           COUNT(*) as total_enrolled,
           SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
           AVG(ISNULL(progress_percent, 0)) as avg_progress
         FROM enrollments 
         WHERE tenant_id = @tenantId AND user_id = @userId`,
        { tenantId, userId }
      ),
      // Lesson progress stats
      DatabaseService.query<any>(
        `SELECT 
           COUNT(*) as total_started,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
           SUM(ISNULL(time_spent_seconds, 0)) as total_time_seconds
         FROM lesson_progress 
         WHERE tenant_id = @tenantId AND user_id = @userId`,
        { tenantId, userId }
      ),
      // Quiz stats
      DatabaseService.query<any>(
        `SELECT 
           COUNT(*) as total_attempts,
           SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed,
           AVG(score) as avg_score
         FROM attempts 
         WHERE tenant_id = @tenantId AND user_id = @userId`,
        { tenantId, userId }
      ),
      // Badge stats
      DatabaseService.query<any>(
        `SELECT COUNT(*) as total_badges
         FROM user_badges 
         WHERE tenant_id = @tenantId AND user_id = @userId`,
        { tenantId, userId }
      ),
    ]);

    const enrollment = enrollmentStats[0] || {};
    const lesson = lessonStats[0] || {};
    const quiz = quizStats[0] || {};
    const badge = badgeStats[0] || {};

    // Calculate total learning time from lesson progress
    const totalSeconds = lesson.total_time_seconds || 0;
    const totalMinutes = Math.round(totalSeconds / 60);
    const totalHours = Math.floor(totalSeconds / 3600);

    // Placeholder for streak and XP (can be enhanced later)
    const streak = 7; // TODO: Calculate from daily activity
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
        xp,
        avgProgress: Math.round(enrollment.avg_progress || 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/analytics/dashboard
 * @desc Get dashboard analytics overview (Admin)
 */
router.get('/dashboard', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const timeRange = req.query.timeRange as string || '30d';
    
    // Calculate date range
    const days = parseInt(timeRange.replace('d', '')) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get multiple metrics in parallel
    const [
      userStats,
      courseStats,
      enrollmentStats,
      completionStats,
      quizStats,
      recentActivity,
    ] = await Promise.all([
      // User statistics
      DatabaseService.query<any>(
        `SELECT 
           COUNT(*) as total_users,
           SUM(CASE WHEN created_at >= @startDate THEN 1 ELSE 0 END) as new_users,
           SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users
         FROM users WHERE tenant_id = @tenantId`,
        { tenantId, startDate }
      ),
      // Course statistics
      DatabaseService.query<any>(
        `SELECT 
           COUNT(*) as total_courses,
           SUM(CASE WHEN is_published = 1 THEN 1 ELSE 0 END) as published_courses,
           SUM(CASE WHEN created_at >= @startDate THEN 1 ELSE 0 END) as new_courses
         FROM courses WHERE tenant_id = @tenantId`,
        { tenantId, startDate }
      ),
      // Enrollment statistics
      DatabaseService.query<any>(
        `SELECT 
           COUNT(*) as total_enrollments,
           SUM(CASE WHEN started_at >= @startDate THEN 1 ELSE 0 END) as new_enrollments,
           AVG(ISNULL(progress_percent, 0)) as avg_progress
         FROM enrollments e
         JOIN courses c ON e.course_id = c.id
         WHERE c.tenant_id = @tenantId`,
        { tenantId, startDate }
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
           SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as pass_rate
         FROM attempts qa
         JOIN quizzes q ON qa.quiz_id = q.id
         WHERE q.tenant_id = @tenantId AND qa.completed_at >= @startDate`,
        { tenantId, startDate }
      ),
      // Recent activity
      DatabaseService.query<any>(
        `SELECT TOP 10 action, COUNT(*) as count
         FROM audit_logs
         WHERE tenant_id = @tenantId AND created_at >= @startDate
         GROUP BY action
         ORDER BY count DESC`,
        { tenantId, startDate }
      ),
    ]);

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
          total: completionStats[0].completions,
          uniqueUsers: completionStats[0].unique_completers,
        },
        quizzes: {
          totalAttempts: quizStats[0].total_attempts,
          averageScore: Math.round(quizStats[0].avg_score || 0),
          passRate: Math.round(quizStats[0].pass_rate || 0),
        },
        recentActivity,
        timeRange,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/analytics/users
 * @desc Get user analytics
 */
router.get('/users', authenticate, authorize('admin', 'director'), async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    // User growth over time
    const userGrowth = await DatabaseService.query<any>(
      `SELECT 
         CAST(created_at AS DATE) as date,
         COUNT(*) as new_users
       FROM users
       WHERE tenant_id = @tenantId AND created_at >= DATEADD(day, -30, GETUTCDATE())
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
      `SELECT TOP 10 u.id, u.display_name, u.email, COUNT(al.id) as activity_count
       FROM users u
       LEFT JOIN audit_logs al ON u.id = al.user_id AND al.created_at >= DATEADD(day, -30, GETUTCDATE())
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
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/analytics/courses
 * @desc Get course analytics
 */
router.get('/courses', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
  try {
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

    // Courses by category
    const coursesByCategory = await DatabaseService.query<any>(
      `SELECT COALESCE(category, 'Uncategorized') as category, COUNT(*) as count
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
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/analytics/learning
 * @desc Get learning analytics
 */
router.get('/learning', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    // Learning activity over time
    const learningActivity = await DatabaseService.query<any>(
      `SELECT CAST(created_at AS DATE) as date, COUNT(*) as activities
       FROM audit_logs
       WHERE tenant_id = @tenantId 
         AND action IN ('lesson_completed', 'content_viewed', 'quiz_completed')
         AND created_at >= DATEADD(day, -30, GETUTCDATE())
       GROUP BY CAST(created_at AS DATE)
       ORDER BY date`,
      { tenantId }
    );

    // Average time to completion
    const avgCompletionTime = await DatabaseService.query<any>(
      `SELECT c.id, c.title,
              AVG(DATEDIFF(day, e.started_at, e.completed_at)) as avg_days_to_complete
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
       JOIN attempts qa ON q.id = qa.quiz_id
       WHERE q.tenant_id = @tenantId
       GROUP BY q.id, q.title`,
      { tenantId }
    );

    // Progress distribution
    const progressDistribution = await DatabaseService.query<any>(
      `SELECT 
         CASE 
           WHEN progress_percent = 0 THEN 'Not Started'
           WHEN progress_percent < 25 THEN '1-24%'
           WHEN progress_percent < 50 THEN '25-49%'
           WHEN progress_percent < 75 THEN '50-74%'
           WHEN progress_percent < 100 THEN '75-99%'
           ELSE 'Completed'
         END as range,
         COUNT(*) as count
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE c.tenant_id = @tenantId
       GROUP BY 
         CASE 
           WHEN progress_percent = 0 THEN 'Not Started'
           WHEN progress_percent < 25 THEN '1-24%'
           WHEN progress_percent < 50 THEN '25-49%'
           WHEN progress_percent < 75 THEN '50-74%'
           WHEN progress_percent < 100 THEN '75-99%'
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
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/analytics/badges
 * @desc Get badge analytics
 */
router.get('/badges', authenticate, authorize('admin', 'director'), async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    // Badge distribution
    const badgeDistribution = await DatabaseService.query<any>(
      `SELECT b.id, b.name, b.type, COUNT(ab.id) as awarded_count
       FROM badges b
       LEFT JOIN user_badges ab ON b.id = ab.badge_id
       WHERE b.tenant_id = @tenantId
       GROUP BY b.id, b.name, b.type
       ORDER BY awarded_count DESC`,
      { tenantId }
    );

    // Badges awarded over time
    const badgesOverTime = await DatabaseService.query<any>(
      `SELECT CAST(awarded_at AS DATE) as date, COUNT(*) as count
       FROM user_badges ab
       JOIN badges b ON ab.badge_id = b.id
       WHERE b.tenant_id = @tenantId AND awarded_at >= DATEADD(day, -30, GETUTCDATE())
       GROUP BY CAST(awarded_at AS DATE)
       ORDER BY date`,
      { tenantId }
    );

    // Top badge earners
    const topEarners = await DatabaseService.query<any>(
      `SELECT TOP 10 u.id, u.display_name, COUNT(ab.id) as badge_count
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
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/analytics/user/:userId
 * @desc Get analytics for a specific user
 */
router.get('/user/:userId', authenticate, async (req: AuthRequest, res, next) => {
  try {
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
                SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed
         FROM attempts WHERE user_id = @userId`,
        { userId }
      ),
      // Badges
      DatabaseService.query<any>(
        `SELECT COUNT(*) as total FROM user_badges WHERE user_id = @userId`,
        { userId }
      ),
      // Recent activity
      DatabaseService.query<any>(
        `SELECT TOP 20 action, resource_type, resource_id, created_at
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
  } catch (error) {
    next(error);
  }
});

export default router;
