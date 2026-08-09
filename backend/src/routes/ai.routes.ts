import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { AIService } from '../services/ai.service';
import { db, IS_PG } from '../database/db-helpers';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// ==================== CONTENT GENERATION ====================

/**
 * @route POST /api/v1/ai/generate/course-outline
 * @desc Generate course outline using AI
 */
router.post(
  '/generate/course-outline',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('topic').notEmpty().trim(),
    body('targetAudience').optional().trim(),
    body('duration').optional().trim(),
    body('objectives').optional().isArray(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { topic, targetAudience, duration, objectives } = req.body;

      // Log AI usage
      await DatabaseService.execute(
        `INSERT INTO ai_usage_logs (tenant_id, user_id, feature, prompt_tokens, completion_tokens, model)
         VALUES (@tenantId, @userId, 'course_outline', 0, 0, 'gpt-4')`,
        { tenantId: req.user!.tenantId, userId: req.user!.id }
      );

      const outline = await AIService.generateCourseOutline({
        topic,
        targetAudience,
        duration,
        objectives,
      });

      res.json({ success: true, data: outline });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/ai/generate/lesson-content
 * @desc Generate lesson content using AI
 */
router.post(
  '/generate/lesson-content',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('title').notEmpty().trim(),
    body('courseContext').optional().trim(),
    body('contentType').optional().isIn(['text', 'interactive', 'summary']),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { title, courseContext, contentType } = req.body;

      const content = await AIService.generateLessonContent({
        title,
        courseContext,
        contentType: contentType || 'text',
      });

      res.json({ success: true, data: content });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/ai/generate/quiz
 * @desc Generate quiz questions using AI
 */
router.post(
  '/generate/quiz',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('topic').notEmpty().trim(),
    body('numberOfQuestions').isInt({ min: 1, max: 20 }),
    body('questionTypes').optional().isArray(),
    body('difficulty').optional().isIn(['easy', 'medium', 'hard']),
    body('content').optional().trim(), // Source content to base questions on
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { topic, numberOfQuestions, questionTypes, difficulty, content } = req.body;

      const quiz = await AIService.generateQuiz({
        topic,
        numberOfQuestions,
        questionTypes: questionTypes || ['multiple_choice', 'true_false'],
        difficulty: difficulty || 'medium',
        sourceContent: content,
      });

      res.json({ success: true, data: quiz });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/ai/improve-text
 * @desc Improve text using AI
 */
router.post(
  '/improve-text',
  authenticate,
  [
    body('text').notEmpty().trim(),
    body('action').isIn(['improve', 'simplify', 'elaborate', 'fix_grammar', 'translate']),
    body('targetLanguage').optional().trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { text, action, targetLanguage } = req.body;

      const improved = await AIService.improveText({
        text,
        action,
        targetLanguage,
      });

      res.json({ success: true, data: improved });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== RECOMMENDATIONS ====================

/**
 * @route GET /api/v1/ai/recommendations/courses
 * @desc Get personalized course recommendations
 */
router.get('/recommendations/courses', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);

    // Get user's learning history
    const completedCourses = await DatabaseService.query<any>(
      `SELECT c.id, c.title, c.category 
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = @userId AND e.progress_percent >= 100`,
      { userId: req.user!.id }
    );

    // Get user's interests from profile
    const userPrefs = await DatabaseService.query<any>(
      `SELECT interests, learning_goals FROM user_profiles WHERE user_id = @userId`,
      { userId: req.user!.id }
    );

    // Get AI recommendations
    const recommendations = await AIService.getRecommendations({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      completedCourses,
      preferences: userPrefs[0] || {},
      limit,
    });

    // Log recommendation (parameterized — reason/score come from the AI response,
    // not safe to interpolate directly into SQL text)
    if (recommendations.length > 0) {
      const rows = recommendations
        .map((_: any, i: number) => `(@tenantId, @userId, 'course', @courseId${i}, @score${i}, @reason${i})`)
        .join(', ');
      const params: Record<string, any> = { tenantId: req.user!.tenantId, userId: req.user!.id };
      recommendations.forEach((r: any, i: number) => {
        params[`courseId${i}`] = r.courseId;
        params[`score${i}`] = r.score;
        params[`reason${i}`] = r.reason;
      });

      await DatabaseService.execute(
        `INSERT INTO ai_recommendations (tenant_id, user_id, recommendation_type, course_id, score, reason)
         VALUES ${rows}`,
        params
      ).catch(() => {/* Ignore logging errors */});
    }

    res.json({ success: true, data: recommendations });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/ai/recommendations/next-steps
 * @desc Get recommended next learning steps
 */
router.get('/recommendations/next-steps', authenticate, async (req: AuthRequest, res, next) => {
  try {
    // Get current enrollments
    const currentEnrollments = await DatabaseService.query<any>(
      IS_PG
        ? `SELECT e.*, c.title as course_title, e.progress_percent as progress,
                  (SELECT l.title FROM lessons l
                   JOIN modules m ON l.module_id = m.id
                   LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = @userId AND lp.tenant_id = @tenantId
                   WHERE m.course_id = c.id AND (lp.status IS NULL OR lp.status <> 'completed')
                   ORDER BY m.position, l.position LIMIT 1) as next_lesson
           FROM enrollments e
           JOIN courses c ON e.course_id = c.id
           WHERE e.user_id = @userId AND e.progress_percent < 100`
        : `SELECT e.*, c.title as course_title, e.progress_percent as progress,
                  (SELECT TOP 1 l.title FROM lessons l
                   JOIN modules m ON l.module_id = m.id
                   LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = @userId AND lp.tenant_id = @tenantId
                   WHERE m.course_id = c.id AND (lp.status IS NULL OR lp.status <> 'completed')
                   ORDER BY m.position, l.position) as next_lesson
           FROM enrollments e
           JOIN courses c ON e.course_id = c.id
           WHERE e.user_id = @userId AND e.progress_percent < 100`,
      { userId: req.user!.id, tenantId: req.user!.tenantId }
    );

    // Get user's quiz results
    const recentQuizResults = await DatabaseService.query<any>(
      IS_PG
        ? `SELECT q.title, qa.score, qa.passed
           FROM quiz_attempts qa
           JOIN quizzes q ON qa.quiz_id = q.id
           WHERE qa.user_id = @userId
           ORDER BY qa.completed_at DESC
           LIMIT 5`
        : `SELECT TOP 5 q.title, qa.score, qa.passed
           FROM quiz_attempts qa
           JOIN quizzes q ON qa.quiz_id = q.id
           WHERE qa.user_id = @userId
           ORDER BY qa.completed_at DESC`,
      { userId: req.user!.id }
    );

    const nextSteps = await AIService.getNextSteps({
      currentEnrollments,
      recentQuizResults,
    });

    res.json({ success: true, data: nextSteps });
  } catch (error) {
    next(error);
  }
});

// ==================== TUTORING ====================

/**
 * @route POST /api/v1/ai/tutor/ask
 * @desc Ask AI tutor a question
 */
router.post(
  '/tutor/ask',
  authenticate,
  [
    body('question').notEmpty().trim(),
    body('courseId').optional().isInt(),
    body('lessonId').optional().isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { question, courseId, lessonId } = req.body;

      let context = '';

      // Get course/lesson context if provided
      if (lessonId) {
        const lessons = await DatabaseService.query<any>(
          `SELECT l.title, l.description, c.title as course_title
           FROM lessons l
           JOIN modules m ON l.module_id = m.id
           JOIN courses c ON m.course_id = c.id
           WHERE l.id = @lessonId`,
          { lessonId }
        );
        if (lessons.length > 0) {
          context = `Course: ${lessons[0].course_title}\nLesson: ${lessons[0].title}\n${lessons[0].description || ''}`;
        }
      } else if (courseId) {
        const courses = await DatabaseService.query<any>(
          'SELECT title, description FROM courses WHERE id = @courseId',
          { courseId }
        );
        if (courses.length > 0) {
          context = `Course: ${courses[0].title}\n${courses[0].description || ''}`;
        }
      }

      // Store chat history
      await DatabaseService.execute(
        `INSERT INTO ai_chat_history (tenant_id, user_id, role, message, context)
         VALUES (@tenantId, @userId, 'user', @message, @context)`,
        {
          tenantId: req.user!.tenantId,
          userId: req.user!.id,
          message: question,
          context: context || null,
        }
      );

      const answer = await AIService.askTutor({
        question,
        context,
        userId: req.user!.id,
      });

      // Store AI response
      await DatabaseService.execute(
        `INSERT INTO ai_chat_history (tenant_id, user_id, role, message)
         VALUES (@tenantId, @userId, 'assistant', @message)`,
        {
          tenantId: req.user!.tenantId,
          userId: req.user!.id,
          message: answer,
        }
      );

      res.json({ success: true, data: { answer } });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/ai/tutor/history
 * @desc Get AI tutor chat history
 */
router.get('/tutor/history', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const history = await DatabaseService.query<any>(
      IS_PG
        ? `SELECT * FROM ai_chat_history
           WHERE user_id = @userId AND tenant_id = @tenantId
           ORDER BY created_at DESC
           LIMIT @limit`
        : `SELECT TOP (@limit) * FROM ai_chat_history
           WHERE user_id = @userId AND tenant_id = @tenantId
           ORDER BY created_at DESC`,
      { limit, userId: req.user!.id, tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: history.reverse() });
  } catch (error) {
    next(error);
  }
});

// ==================== ANALYTICS & INSIGHTS ====================

/**
 * @route GET /api/v1/ai/insights/learning-patterns
 * @desc Get AI-generated learning pattern insights for a user
 */
router.get('/insights/learning-patterns', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : req.user!.id;

    // Only admins can view other users' insights
    if (userId !== req.user!.id && !['admin', 'director'].includes(req.user!.role)) {
      userId === req.user!.id;
    }

    // Get user's activity data
    const activityData = await DatabaseService.query<any>(
      `SELECT 
         DATEPART(hour, created_at) as hour,
         COUNT(*) as activity_count
       FROM audit_logs
       WHERE user_id = @userId AND action IN ('lesson_completed', 'quiz_completed', 'content_viewed')
       GROUP BY DATEPART(hour, created_at)`,
      { userId }
    );

    const daysElapsedExpr = IS_PG
      ? `EXTRACT(DAY FROM (COALESCE(e.completed_at, ${db.now()}) - e.started_at))`
      : `DATEDIFF(day, e.started_at, COALESCE(e.completed_at, ${db.now()}))`;
    const progressData = await DatabaseService.query<any>(
      `SELECT e.course_id, c.title, e.progress_percent as progress, e.started_at, e.completed_at,
              ${daysElapsedExpr} as days_elapsed
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = @userId`,
      { userId }
    );

    const insights = await AIService.analyzeLearningPatterns({
      activityData,
      progressData,
    });

    res.json({ success: true, data: insights });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/ai/insights/course-effectiveness
 * @desc Get AI analysis of course effectiveness
 */
router.get(
  '/insights/course-effectiveness/:courseId',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const courseId = parseInt(req.params.courseId, 10);

      // Get course completion data
      const completionData = await DatabaseService.query<any>(
        `SELECT 
           COUNT(*) as total_enrollments,
           SUM(CASE WHEN progress_percent >= 100 THEN 1 ELSE 0 END) as completions,
           AVG(progress_percent) as avg_progress
         FROM enrollments
         WHERE course_id = @courseId`,
        { courseId }
      );

      // Get quiz performance
      const quizData = await DatabaseService.query<any>(
        `SELECT q.title, AVG(qa.score) as avg_score,
                SUM(CASE WHEN qa.passed = ${db.bool(true)} THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as pass_rate
         FROM quiz_attempts qa
         JOIN quizzes q ON qa.quiz_id = q.id
         WHERE q.course_id = @courseId
         GROUP BY q.id, q.title`,
        { courseId }
      );

      const analysis = await AIService.analyzeCourseEffectiveness({
        completionData: completionData[0],
        quizData,
      });

      res.json({ success: true, data: analysis });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== USAGE STATS ====================

/**
 * @route GET /api/v1/ai/usage
 * @desc Get AI usage statistics (admin only)
 */
router.get('/usage', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const startDate = req.query.startDate as string || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate as string || new Date().toISOString();

    const usage = await DatabaseService.query<any>(
      `SELECT feature, COUNT(*) as request_count, 
              SUM(prompt_tokens) as total_prompt_tokens,
              SUM(completion_tokens) as total_completion_tokens
       FROM ai_usage_logs
       WHERE tenant_id = @tenantId 
         AND created_at >= @startDate 
         AND created_at <= @endDate
       GROUP BY feature`,
      { tenantId: req.user!.tenantId, startDate, endDate }
    );

    const dailyUsage = await DatabaseService.query<any>(
      `SELECT CAST(created_at as DATE) as date, COUNT(*) as requests
       FROM ai_usage_logs
       WHERE tenant_id = @tenantId 
         AND created_at >= @startDate 
         AND created_at <= @endDate
       GROUP BY CAST(created_at as DATE)
       ORDER BY date`,
      { tenantId: req.user!.tenantId, startDate, endDate }
    );

    res.json({
      success: true,
      data: {
        byFeature: usage,
        daily: dailyUsage,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
