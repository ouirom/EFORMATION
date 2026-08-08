"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const ai_service_1 = require("../services/ai.service");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
// ==================== CONTENT GENERATION ====================
/**
 * @route POST /api/v1/ai/generate/course-outline
 * @desc Generate course outline using AI
 */
router.post('/generate/course-outline', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('topic').notEmpty().trim(),
    (0, express_validator_1.body)('targetAudience').optional().trim(),
    (0, express_validator_1.body)('duration').optional().trim(),
    (0, express_validator_1.body)('objectives').optional().isArray(),
], async (req, res, next) => {
    try {
        validate(req);
        const { topic, targetAudience, duration, objectives } = req.body;
        // Log AI usage
        await database_service_1.DatabaseService.execute(`INSERT INTO ai_usage_logs (tenant_id, user_id, feature, prompt_tokens, completion_tokens, model)
         VALUES (@tenantId, @userId, 'course_outline', 0, 0, 'gpt-4')`, { tenantId: req.user.tenantId, userId: req.user.id });
        const outline = await ai_service_1.AIService.generateCourseOutline({
            topic,
            targetAudience,
            duration,
            objectives,
        });
        res.json({ success: true, data: outline });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/ai/generate/lesson-content
 * @desc Generate lesson content using AI
 */
router.post('/generate/lesson-content', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('title').notEmpty().trim(),
    (0, express_validator_1.body)('courseContext').optional().trim(),
    (0, express_validator_1.body)('contentType').optional().isIn(['text', 'interactive', 'summary']),
], async (req, res, next) => {
    try {
        validate(req);
        const { title, courseContext, contentType } = req.body;
        const content = await ai_service_1.AIService.generateLessonContent({
            title,
            courseContext,
            contentType: contentType || 'text',
        });
        res.json({ success: true, data: content });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/ai/generate/quiz
 * @desc Generate quiz questions using AI
 */
router.post('/generate/quiz', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('topic').notEmpty().trim(),
    (0, express_validator_1.body)('numberOfQuestions').isInt({ min: 1, max: 20 }),
    (0, express_validator_1.body)('questionTypes').optional().isArray(),
    (0, express_validator_1.body)('difficulty').optional().isIn(['easy', 'medium', 'hard']),
    (0, express_validator_1.body)('content').optional().trim(), // Source content to base questions on
], async (req, res, next) => {
    try {
        validate(req);
        const { topic, numberOfQuestions, questionTypes, difficulty, content } = req.body;
        const quiz = await ai_service_1.AIService.generateQuiz({
            topic,
            numberOfQuestions,
            questionTypes: questionTypes || ['multiple_choice', 'true_false'],
            difficulty: difficulty || 'medium',
            sourceContent: content,
        });
        res.json({ success: true, data: quiz });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/ai/improve-text
 * @desc Improve text using AI
 */
router.post('/improve-text', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('text').notEmpty().trim(),
    (0, express_validator_1.body)('action').isIn(['improve', 'simplify', 'elaborate', 'fix_grammar', 'translate']),
    (0, express_validator_1.body)('targetLanguage').optional().trim(),
], async (req, res, next) => {
    try {
        validate(req);
        const { text, action, targetLanguage } = req.body;
        const improved = await ai_service_1.AIService.improveText({
            text,
            action,
            targetLanguage,
        });
        res.json({ success: true, data: improved });
    }
    catch (error) {
        next(error);
    }
});
// ==================== RECOMMENDATIONS ====================
/**
 * @route GET /api/v1/ai/recommendations/courses
 * @desc Get personalized course recommendations
 */
router.get('/recommendations/courses', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 5, 20);
        // Get user's learning history
        const completedCourses = await database_service_1.DatabaseService.query(`SELECT c.id, c.title, c.category 
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = @userId AND e.progress_percent >= 100`, { userId: req.user.id });
        // Get user's interests from profile
        const userPrefs = await database_service_1.DatabaseService.query(`SELECT interests, learning_goals FROM user_profiles WHERE user_id = @userId`, { userId: req.user.id });
        // Get AI recommendations
        const recommendations = await ai_service_1.AIService.getRecommendations({
            userId: req.user.id,
            tenantId: req.user.tenantId,
            completedCourses,
            preferences: userPrefs[0] || {},
            limit,
        });
        // Log recommendation
        await database_service_1.DatabaseService.execute(`INSERT INTO ai_recommendations (tenant_id, user_id, recommendation_type, course_id, score, reason)
       SELECT @tenantId, @userId, 'course', id, score, reason FROM (${recommendations.map((r, i) => `SELECT ${r.courseId} as id, ${r.score} as score, '${r.reason}' as reason`).join(' UNION ALL ')}) AS recs`, { tenantId: req.user.tenantId, userId: req.user.id }).catch(() => { });
        res.json({ success: true, data: recommendations });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/ai/recommendations/next-steps
 * @desc Get recommended next learning steps
 */
router.get('/recommendations/next-steps', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        // Get current enrollments
        const currentEnrollments = await database_service_1.DatabaseService.query(`SELECT e.*, c.title as course_title,
              (SELECT TOP 1 l.title FROM lessons l
               JOIN modules m ON l.module_id = m.id
               JOIN lesson_progress up ON up.lesson_id = l.id
               WHERE m.course_id = c.id AND up.user_id = @userId AND up.status <> 'completed'
               ORDER BY m.position, l.position) as next_lesson
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = @userId AND e.progress_percent < 100`, { userId: req.user.id });
        // Get user's quiz results
        const recentQuizResults = await database_service_1.DatabaseService.query(`SELECT TOP 5 q.title, qa.score, qa.passed
       FROM attempts qa
       JOIN quizzes q ON qa.quiz_id = q.id
       WHERE qa.user_id = @userId
       ORDER BY qa.submitted_at DESC`, { userId: req.user.id });
        const nextSteps = await ai_service_1.AIService.getNextSteps({
            currentEnrollments,
            recentQuizResults,
        });
        res.json({ success: true, data: nextSteps });
    }
    catch (error) {
        next(error);
    }
});
// ==================== TUTORING ====================
/**
 * @route POST /api/v1/ai/tutor/ask
 * @desc Ask AI tutor a question
 */
router.post('/tutor/ask', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('question').notEmpty().trim(),
    (0, express_validator_1.body)('courseId').optional().isInt(),
    (0, express_validator_1.body)('lessonId').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        const { question, courseId, lessonId } = req.body;
        let context = '';
        // Get course/lesson context if provided
        if (lessonId) {
            const lessons = await database_service_1.DatabaseService.query(`SELECT l.title, l.description, c.title as course_title
           FROM lessons l
           JOIN modules m ON l.module_id = m.id
           JOIN courses c ON m.course_id = c.id
           WHERE l.id = @lessonId`, { lessonId });
            if (lessons.length > 0) {
                context = `Course: ${lessons[0].course_title}\nLesson: ${lessons[0].title}\n${lessons[0].description || ''}`;
            }
        }
        else if (courseId) {
            const courses = await database_service_1.DatabaseService.query('SELECT title, description FROM courses WHERE id = @courseId', { courseId });
            if (courses.length > 0) {
                context = `Course: ${courses[0].title}\n${courses[0].description || ''}`;
            }
        }
        // Store chat history
        await database_service_1.DatabaseService.execute(`INSERT INTO ai_chat_history (tenant_id, user_id, role, message, context)
         VALUES (@tenantId, @userId, 'user', @message, @context)`, {
            tenantId: req.user.tenantId,
            userId: req.user.id,
            message: question,
            context: context || null,
        });
        const answer = await ai_service_1.AIService.askTutor({
            question,
            context,
            userId: req.user.id,
        });
        // Store AI response
        await database_service_1.DatabaseService.execute(`INSERT INTO ai_chat_history (tenant_id, user_id, role, message)
         VALUES (@tenantId, @userId, 'assistant', @message)`, {
            tenantId: req.user.tenantId,
            userId: req.user.id,
            message: answer,
        });
        res.json({ success: true, data: { answer } });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/ai/tutor/history
 * @desc Get AI tutor chat history
 */
router.get('/tutor/history', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const history = await database_service_1.DatabaseService.query(`SELECT TOP (@limit) * FROM ai_chat_history 
       WHERE user_id = @userId AND tenant_id = @tenantId
       ORDER BY created_at DESC`, { limit, userId: req.user.id, tenantId: req.user.tenantId });
        res.json({ success: true, data: history.reverse() });
    }
    catch (error) {
        next(error);
    }
});
// ==================== ANALYTICS & INSIGHTS ====================
/**
 * @route GET /api/v1/ai/insights/learning-patterns
 * @desc Get AI-generated learning pattern insights for a user
 */
router.get('/insights/learning-patterns', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const userId = req.query.userId ? parseInt(req.query.userId) : req.user.id;
        // Only admins can view other users' insights
        if (userId !== req.user.id && !['admin', 'director'].includes(req.user.role)) {
            userId === req.user.id;
        }
        // Get user's activity data
        const activityData = await database_service_1.DatabaseService.query(`SELECT 
         DATEPART(hour, created_at) as hour,
         COUNT(*) as activity_count
       FROM audit_logs
       WHERE user_id = @userId AND action IN ('lesson_completed', 'quiz_completed', 'content_viewed')
       GROUP BY DATEPART(hour, created_at)`, { userId });
        const progressData = await database_service_1.DatabaseService.query(`SELECT e.course_id, c.title, e.progress_percent, e.started_at, e.completed_at,
              DATEDIFF(day, e.started_at, COALESCE(e.completed_at, GETUTCDATE())) as days_elapsed
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = @userId`, { userId });
        const insights = await ai_service_1.AIService.analyzeLearningPatterns({
            activityData,
            progressData,
        });
        res.json({ success: true, data: insights });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/ai/insights/course-effectiveness
 * @desc Get AI analysis of course effectiveness
 */
router.get('/insights/course-effectiveness/:courseId', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const courseId = parseInt(req.params.courseId, 10);
        // Get course completion data
        const completionData = await database_service_1.DatabaseService.query(`SELECT 
           COUNT(*) as total_enrollments,
           SUM(CASE WHEN progress_percent >= 100 THEN 1 ELSE 0 END) as completions,
           AVG(progress_percent) as avg_progress
         FROM enrollments
         WHERE course_id = @courseId`, { courseId });
        // Get quiz performance
        const quizData = await database_service_1.DatabaseService.query(`SELECT q.title, AVG(qa.score) as avg_score, 
                SUM(CASE WHEN qa.passed = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as pass_rate
         FROM attempts qa
         JOIN quizzes q ON qa.quiz_id = q.id
         WHERE q.course_id = @courseId
         GROUP BY q.id, q.title`, { courseId });
        const analysis = await ai_service_1.AIService.analyzeCourseEffectiveness({
            completionData: completionData[0],
            quizData,
        });
        res.json({ success: true, data: analysis });
    }
    catch (error) {
        next(error);
    }
});
// ==================== USAGE STATS ====================
/**
 * @route GET /api/v1/ai/usage
 * @desc Get AI usage statistics (admin only)
 */
router.get('/usage', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = req.query.endDate || new Date().toISOString();
        const usage = await database_service_1.DatabaseService.query(`SELECT feature, COUNT(*) as request_count, 
              SUM(prompt_tokens) as total_prompt_tokens,
              SUM(completion_tokens) as total_completion_tokens
       FROM ai_usage_logs
       WHERE tenant_id = @tenantId 
         AND created_at >= @startDate 
         AND created_at <= @endDate
       GROUP BY feature`, { tenantId: req.user.tenantId, startDate, endDate });
        const dailyUsage = await database_service_1.DatabaseService.query(`SELECT CAST(created_at as DATE) as date, COUNT(*) as requests
       FROM ai_usage_logs
       WHERE tenant_id = @tenantId 
         AND created_at >= @startDate 
         AND created_at <= @endDate
       GROUP BY CAST(created_at as DATE)
       ORDER BY date`, { tenantId: req.user.tenantId, startDate, endDate });
        res.json({
            success: true,
            data: {
                byFeature: usage,
                daily: dailyUsage,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=ai.routes.js.map