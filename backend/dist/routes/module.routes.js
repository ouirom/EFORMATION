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
 * @route GET /api/v1/modules?courseId=X
 * @desc Get modules for a course
 */
router.get('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const courseId = req.query.courseId;
        if (!courseId) {
            throw (0, error_middleware_1.BadRequestError)('courseId is required');
        }
        const modules = await database_service_1.DatabaseService.query(`SELECT m.*, 
              (SELECT COUNT(*) FROM lessons WHERE module_id = m.id) as lesson_count
       FROM modules m 
       WHERE m.course_id = @courseId AND m.tenant_id = @tenantId 
       ORDER BY m.position`, { courseId: parseInt(courseId, 10), tenantId: req.user.tenantId });
        res.json({ success: true, data: modules });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/modules
 * @desc Create a new module
 */
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('courseId').isInt(),
    (0, express_validator_1.body)('title').notEmpty().trim(),
    (0, express_validator_1.body)('position').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        // Get next position if not provided
        let position = req.body.position;
        if (position === undefined) {
            const maxPos = await database_service_1.DatabaseService.query('SELECT COALESCE(MAX(position), 0) as max_pos FROM modules WHERE course_id = @courseId', { courseId: req.body.courseId });
            position = maxPos[0].max_pos + 1;
        }
        const module = await course_service_1.ModuleService.create({
            tenantId: req.user.tenantId,
            courseId: req.body.courseId,
            title: req.body.title,
            position,
        });
        res.status(201).json({ success: true, data: module });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/modules/:id
 * @desc Update module
 */
router.put('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('title').optional().trim(),
    (0, express_validator_1.body)('position').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        const moduleId = parseInt(req.params.id, 10);
        const module = await course_service_1.ModuleService.update(req.user.tenantId, moduleId, {
            title: req.body.title,
            position: req.body.position,
        });
        res.json({ success: true, data: module });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/modules/:id
 * @desc Delete module
 */
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const moduleId = parseInt(req.params.id, 10);
        await course_service_1.ModuleService.delete(req.user.tenantId, moduleId);
        res.json({ success: true, message: 'Module deleted successfully' });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/modules/reorder
 * @desc Reorder modules in a course
 */
router.post('/reorder', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('courseId').isInt(),
    (0, express_validator_1.body)('moduleIds').isArray(),
], async (req, res, next) => {
    try {
        validate(req);
        await course_service_1.ModuleService.reorder(req.user.tenantId, req.body.courseId, req.body.moduleIds);
        res.json({ success: true, message: 'Modules reordered successfully' });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=module.routes.js.map