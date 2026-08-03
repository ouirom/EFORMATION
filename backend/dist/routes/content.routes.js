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
 * @route GET /api/v1/contents?lessonId=X
 * @desc Get contents for a lesson
 */
router.get('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const lessonId = req.query.lessonId;
        if (!lessonId) {
            throw (0, error_middleware_1.BadRequestError)('lessonId is required');
        }
        const contents = await database_service_1.DatabaseService.query(`SELECT c.*, f.filename, f.mime_type, f.storage_key, f.size_bytes
       FROM contents c
       LEFT JOIN file_assets f ON c.file_id = f.id
       WHERE c.lesson_id = @lessonId AND c.tenant_id = @tenantId 
       ORDER BY c.position`, { lessonId: parseInt(lessonId, 10), tenantId: req.user.tenantId });
        res.json({ success: true, data: contents });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/contents/:id
 * @desc Get content by ID
 */
router.get('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const contentId = parseInt(req.params.id, 10);
        const contents = await database_service_1.DatabaseService.query(`SELECT c.*, f.filename, f.mime_type, f.storage_key, f.size_bytes
       FROM contents c
       LEFT JOIN file_assets f ON c.file_id = f.id
       WHERE c.id = @contentId AND c.tenant_id = @tenantId`, { contentId, tenantId: req.user.tenantId });
        if (contents.length === 0) {
            throw (0, error_middleware_1.BadRequestError)('Content not found');
        }
        res.json({ success: true, data: contents[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/contents
 * @desc Create new content
 */
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('lessonId').isInt(),
    (0, express_validator_1.body)('type').isIn(['pdf', 'docx', 'image', 'video_mp4', 'youtube_link', 'text']),
    (0, express_validator_1.body)('title').notEmpty().trim(),
    (0, express_validator_1.body)('body').optional(),
    (0, express_validator_1.body)('fileId').optional().isInt(),
    (0, express_validator_1.body)('url').optional().trim(),
    (0, express_validator_1.body)('position').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        let position = req.body.position;
        if (position === undefined) {
            const maxPos = await database_service_1.DatabaseService.query('SELECT COALESCE(MAX(position), 0) as max_pos FROM contents WHERE lesson_id = @lessonId', { lessonId: req.body.lessonId });
            position = maxPos[0].max_pos + 1;
        }
        const content = await course_service_1.ContentService.create({
            tenantId: req.user.tenantId,
            lessonId: req.body.lessonId,
            type: req.body.type,
            title: req.body.title,
            body: req.body.body,
            fileId: req.body.fileId,
            url: req.body.url,
            position,
        });
        res.status(201).json({ success: true, data: content });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/contents/:id
 * @desc Update content
 */
router.put('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('title').optional().trim(),
    (0, express_validator_1.body)('body').optional(),
    (0, express_validator_1.body)('fileId').optional().isInt(),
    (0, express_validator_1.body)('url').optional().trim(),
    (0, express_validator_1.body)('position').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        const contentId = parseInt(req.params.id, 10);
        const content = await course_service_1.ContentService.update(req.user.tenantId, contentId, {
            title: req.body.title,
            body: req.body.body,
            fileId: req.body.fileId,
            url: req.body.url,
            position: req.body.position,
        });
        res.json({ success: true, data: content });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/contents/:id
 * @desc Delete content
 */
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const contentId = parseInt(req.params.id, 10);
        await course_service_1.ContentService.delete(req.user.tenantId, contentId);
        res.json({ success: true, message: 'Content deleted successfully' });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=content.routes.js.map