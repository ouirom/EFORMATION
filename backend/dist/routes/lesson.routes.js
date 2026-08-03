"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const course_service_1 = require("../services/course.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const database_service_1 = require("../services/database.service");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
/**
 * @route GET /api/v1/lessons?moduleId=X
 * @desc Get lessons for a module
 */
router.get('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const moduleId = req.query.moduleId;
        if (!moduleId) {
            throw (0, error_middleware_1.BadRequestError)('moduleId is required');
        }
        const lessons = await database_service_1.DatabaseService.query(`SELECT l.*, 
              (SELECT COUNT(*) FROM contents WHERE lesson_id = l.id) as content_count,
              (SELECT COUNT(*) FROM quizzes WHERE lesson_id = l.id) as quiz_count
       FROM lessons l 
       WHERE l.module_id = @moduleId AND l.tenant_id = @tenantId 
       ORDER BY l.position`, { moduleId: parseInt(moduleId, 10), tenantId: req.user.tenantId });
        res.json({ success: true, data: lessons });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/lessons/:id
 * @desc Get lesson by ID with contents
 */
router.get('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const lessonId = parseInt(req.params.id, 10);
        const lessons = await database_service_1.DatabaseService.query('SELECT * FROM lessons WHERE id = @lessonId AND tenant_id = @tenantId', { lessonId, tenantId: req.user.tenantId });
        if (lessons.length === 0) {
            throw (0, error_middleware_1.BadRequestError)('Lesson not found');
        }
        const contents = await database_service_1.DatabaseService.query(`SELECT c.*, f.id as file_asset_id, f.filename, f.mime_type, f.storage_key
       FROM contents c
       LEFT JOIN file_assets f ON c.file_id = f.id
       WHERE c.lesson_id = @lessonId AND c.tenant_id = @tenantId
       ORDER BY c.position`, { lessonId, tenantId: req.user.tenantId });
        const quizzes = await database_service_1.DatabaseService.query('SELECT * FROM quizzes WHERE lesson_id = @lessonId AND tenant_id = @tenantId', { lessonId, tenantId: req.user.tenantId });
        res.json({
            success: true,
            data: {
                ...lessons[0],
                contents,
                quizzes,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/lessons
 * @desc Create a new lesson
 */
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('moduleId').isInt(),
    (0, express_validator_1.body)('title').notEmpty().trim(),
    (0, express_validator_1.body)('type').optional().isString().trim(),
    (0, express_validator_1.body)('position').optional().isInt(),
    (0, express_validator_1.body)('durationMin').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        let position = req.body.position;
        if (position === undefined) {
            const maxPos = await database_service_1.DatabaseService.query('SELECT COALESCE(MAX(position), 0) as max_pos FROM lessons WHERE module_id = @moduleId', { moduleId: req.body.moduleId });
            position = maxPos[0].max_pos + 1;
        }
        const lesson = await course_service_1.LessonService.create({
            tenantId: req.user.tenantId,
            moduleId: req.body.moduleId,
            title: req.body.title,
            type: req.body.type,
            position,
            durationMin: req.body.durationMin,
        });
        res.status(201).json({ success: true, data: lesson });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/lessons/:id
 * @desc Update lesson
 */
router.put('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('title').optional().trim(),
    (0, express_validator_1.body)('type').optional().isString().trim(),
    (0, express_validator_1.body)('position').optional().isInt(),
    (0, express_validator_1.body)('durationMin').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        const lessonId = parseInt(req.params.id, 10);
        const lesson = await course_service_1.LessonService.update(req.user.tenantId, lessonId, {
            title: req.body.title,
            type: req.body.type,
            position: req.body.position,
            durationMin: req.body.durationMin,
        });
        res.json({ success: true, data: lesson });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/lessons/:id
 * @desc Delete lesson
 */
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const lessonId = parseInt(req.params.id, 10);
        await course_service_1.LessonService.delete(req.user.tenantId, lessonId);
        res.json({ success: true, message: 'Lesson deleted successfully' });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/lessons/:id/progress
 * @desc Get lesson progress for current user
 */
router.get('/:id/progress', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const lessonId = parseInt(req.params.id, 10);
        const userId = req.user.id;
        const tenantId = req.user.tenantId;
        const progress = await database_service_1.DatabaseService.query(`SELECT * FROM lesson_progress 
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`, { lessonId, userId, tenantId });
        res.json({
            success: true,
            data: progress[0] || {
                status: 'not_started',
                progress_percent: 0,
                time_spent_seconds: 0
            }
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/lessons/:id/start
 * @desc Start/track lesson progress
 */
router.post('/:id/start', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const lessonId = parseInt(req.params.id, 10);
        const courseId = parseInt(req.body.courseId, 10);
        const userId = req.user.id;
        const tenantId = req.user.tenantId;
        // Check if progress already exists
        const existing = await database_service_1.DatabaseService.query(`SELECT * FROM lesson_progress 
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`, { lessonId, userId, tenantId });
        if (existing.length > 0) {
            // Update last accessed
            await database_service_1.DatabaseService.query(`UPDATE lesson_progress 
         SET last_accessed_at = GETDATE(), status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END
         WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`, { lessonId, userId, tenantId });
        }
        else {
            // Create new progress record
            await database_service_1.DatabaseService.query(`INSERT INTO lesson_progress (tenant_id, user_id, lesson_id, course_id, status, progress_percent, started_at, last_accessed_at)
         VALUES (@tenantId, @userId, @lessonId, @courseId, 'in_progress', 0, GETDATE(), GETDATE())`, { tenantId, userId, lessonId, courseId });
        }
        const progress = await database_service_1.DatabaseService.query(`SELECT * FROM lesson_progress 
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`, { lessonId, userId, tenantId });
        res.json({ success: true, data: progress[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/lessons/:id/progress
 * @desc Update lesson progress
 */
router.post('/:id/progress', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const lessonId = parseInt(req.params.id, 10);
        const { progressPercent, timeSpentSeconds } = req.body;
        const userId = req.user.id;
        const tenantId = req.user.tenantId;
        await database_service_1.DatabaseService.query(`UPDATE lesson_progress 
       SET progress_percent = @progressPercent, 
           time_spent_seconds = time_spent_seconds + ISNULL(@timeSpentSeconds, 0),
           last_accessed_at = GETDATE(),
           status = CASE WHEN @progressPercent >= 100 THEN 'completed' ELSE 'in_progress' END,
           completed_at = CASE WHEN @progressPercent >= 100 AND completed_at IS NULL THEN GETDATE() ELSE completed_at END
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`, { lessonId, userId, tenantId, progressPercent, timeSpentSeconds });
        const progress = await database_service_1.DatabaseService.query(`SELECT * FROM lesson_progress 
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`, { lessonId, userId, tenantId });
        res.json({ success: true, data: progress[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/lessons/:id/complete
 * @desc Mark lesson as completed
 */
router.post('/:id/complete', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const lessonId = parseInt(req.params.id, 10);
        const userId = req.user.id;
        const tenantId = req.user.tenantId;
        await database_service_1.DatabaseService.query(`UPDATE lesson_progress 
       SET status = 'completed', 
           progress_percent = 100,
           completed_at = GETDATE(),
           last_accessed_at = GETDATE()
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`, { lessonId, userId, tenantId });
        // Update course progress
        const courseProgress = await database_service_1.DatabaseService.query(`SELECT 
         lp.course_id,
         COUNT(DISTINCT l.id) as total_lessons,
         COUNT(DISTINCT CASE WHEN lp2.status = 'completed' THEN lp2.lesson_id END) as completed_lessons
       FROM lesson_progress lp
       JOIN lessons l ON l.module_id IN (SELECT id FROM modules WHERE course_id = lp.course_id)
       LEFT JOIN lesson_progress lp2 ON lp2.lesson_id = l.id AND lp2.user_id = @userId AND lp2.tenant_id = @tenantId
       WHERE lp.lesson_id = @lessonId AND lp.user_id = @userId AND lp.tenant_id = @tenantId
       GROUP BY lp.course_id`, { lessonId, userId, tenantId });
        if (courseProgress.length > 0) {
            const { course_id, total_lessons, completed_lessons } = courseProgress[0];
            const progressPercent = Math.round((completed_lessons / total_lessons) * 100);
            await database_service_1.DatabaseService.query(`UPDATE enrollments 
         SET progress_percent = @progressPercent,
             completed_at = CASE WHEN @progressPercent = 100 THEN GETDATE() ELSE completed_at END
         WHERE course_id = @courseId AND user_id = @userId AND tenant_id = @tenantId`, { courseId: course_id, userId, tenantId, progressPercent });
        }
        const progress = await database_service_1.DatabaseService.query(`SELECT * FROM lesson_progress 
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`, { lessonId, userId, tenantId });
        res.json({ success: true, data: progress[0] });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=lesson.routes.js.map