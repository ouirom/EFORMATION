"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const course_service_1 = require("../services/course.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
// ==================== COURSES ====================
/**
 * @route GET /api/v1/courses
 * @desc List all courses
 */
router.get('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const sortBy = req.query.sortBy;
        const sortOrder = req.query.sortOrder;
        const search = req.query.search;
        const status = req.query.status;
        const result = await course_service_1.CourseService.findAll(req.user.tenantId, { page, limit, sortBy, sortOrder }, { search, status }, req.user.id, req.user.role, req.user.enterpriseId, req.user.directionId, req.user.serviceId);
        res.json({
            success: true,
            data: result.data,
            meta: {
                page,
                limit,
                total: result.total,
                totalPages: Math.ceil(result.total / limit),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/courses
 * @desc Create a new course
 */
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('title').notEmpty().trim(),
    (0, express_validator_1.body)('description').optional().trim(),
    (0, express_validator_1.body)('category').optional().trim(),
    (0, express_validator_1.body)('level').optional().isIn(['beginner', 'intermediate', 'advanced', 'expert']),
    (0, express_validator_1.body)('duration').optional().toInt(),
    (0, express_validator_1.body)('audienceScope').optional().isObject(),
    (0, express_validator_1.body)('prerequisites').optional().isObject(),
], async (req, res, next) => {
    try {
        validate(req);
        const course = await course_service_1.CourseService.create({
            tenantId: req.user.tenantId,
            title: req.body.title,
            description: req.body.description,
            category: req.body.category,
            level: req.body.level,
            duration: req.body.duration ? parseInt(req.body.duration, 10) : undefined,
            audienceScope: req.body.audienceScope,
            prerequisites: req.body.prerequisites,
            createdBy: req.user.id,
        });
        res.status(201).json({
            success: true,
            data: course,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/courses/categories
 * @desc Get all course categories
 */
router.get('/categories', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const categories = await course_service_1.CourseService.getCategories(req.user.tenantId);
        res.json({
            success: true,
            data: categories,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/courses/:id
 * @desc Get course by ID
 */
router.get('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const courseId = parseInt(req.params.id, 10);
        const course = await course_service_1.CourseService.findById(req.user.tenantId, courseId);
        res.json({
            success: true,
            data: course,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/courses/:id/full
 * @desc Get full course structure with modules, lessons, contents
 */
router.get('/:id/full', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const courseId = parseInt(req.params.id, 10);
        const fullCourse = await course_service_1.CourseService.getFullStructure(req.user.tenantId, courseId);
        res.json({
            success: true,
            data: fullCourse,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/courses/:id
 * @desc Update course
 */
router.put('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('title').optional().trim(),
    (0, express_validator_1.body)('description').optional().trim(),
    (0, express_validator_1.body)('category').optional().trim(),
    (0, express_validator_1.body)('level').optional().isIn(['beginner', 'intermediate', 'advanced', 'expert']),
    (0, express_validator_1.body)('duration').optional().isInt({ min: 0 }),
    (0, express_validator_1.body)('audienceScope').optional().isObject(),
    (0, express_validator_1.body)('prerequisites').optional().isObject(),
    (0, express_validator_1.body)('isPublished').optional().isBoolean(),
], async (req, res, next) => {
    try {
        validate(req);
        const courseId = parseInt(req.params.id, 10);
        const course = await course_service_1.CourseService.update(req.user.tenantId, courseId, req.body, req.user.id, req.user.role);
        res.json({
            success: true,
            data: course,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/courses/:id
 * @desc Delete course
 */
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const courseId = parseInt(req.params.id, 10);
        await course_service_1.CourseService.delete(req.user.tenantId, courseId, req.user.id, req.user.role);
        res.json({
            success: true,
            message: 'Course deleted successfully',
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/courses/:id/publish
 * @desc Publish course
 */
router.post('/:id/publish', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const courseId = parseInt(req.params.id, 10);
        const course = await course_service_1.CourseService.publish(req.user.tenantId, courseId);
        res.json({
            success: true,
            data: course,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/courses/:id/unpublish
 * @desc Unpublish course
 */
router.post('/:id/unpublish', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const courseId = parseInt(req.params.id, 10);
        const course = await course_service_1.CourseService.unpublish(req.user.tenantId, courseId);
        res.json({
            success: true,
            data: course,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/courses/:id/clone
 * @desc Clone course
 */
router.post('/:id/clone', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [(0, express_validator_1.body)('title').optional().trim()], async (req, res, next) => {
    try {
        const courseId = parseInt(req.params.id, 10);
        const course = await course_service_1.CourseService.clone(req.user.tenantId, courseId, req.body.title, req.user.id);
        res.status(201).json({
            success: true,
            data: course,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/courses/:id/statistics
 * @desc Get course statistics
 */
router.get('/:id/statistics', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const courseId = parseInt(req.params.id, 10);
        const stats = await course_service_1.CourseService.getStatistics(req.user.tenantId, courseId);
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=course.routes.js.map