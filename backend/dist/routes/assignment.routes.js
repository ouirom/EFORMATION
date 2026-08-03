"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const database_service_1 = require("../services/database.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
// ==================== CATEGORIES ====================
/**
 * @route GET /api/v1/assignments/categories
 * @desc List all categories
 */
router.get('/categories', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const categories = await database_service_1.DatabaseService.query(`SELECT id, name FROM categories WHERE tenant_id = @tenantId ORDER BY name`, { tenantId: req.user.tenantId });
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
 * @route POST /api/v1/assignments/categories
 * @desc Create a new category
 */
router.post('/categories', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [(0, express_validator_1.body)('name').notEmpty().trim()], async (req, res, next) => {
    try {
        validate(req);
        const result = await database_service_1.DatabaseService.query(`INSERT INTO categories (tenant_id, name)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name)`, {
            tenantId: req.user.tenantId,
            name: req.body.name,
        });
        res.status(201).json({
            success: true,
            data: { id: result[0].id, name: req.body.name },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/assignments/categories/:id
 * @desc Update a category
 */
router.put('/categories/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [(0, express_validator_1.body)('name').notEmpty().trim()], async (req, res, next) => {
    try {
        validate(req);
        const categoryId = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute(`UPDATE categories SET name = @name WHERE id = @id AND tenant_id = @tenantId`, {
            id: categoryId,
            tenantId: req.user.tenantId,
            name: req.body.name,
        });
        res.json({
            success: true,
            data: { id: categoryId, name: req.body.name },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/assignments/categories/:id
 * @desc Delete a category
 */
router.delete('/categories/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const categoryId = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute(`DELETE FROM categories WHERE id = @id AND tenant_id = @tenantId`, {
            id: categoryId,
            tenantId: req.user.tenantId,
        });
        res.json({
            success: true,
            message: 'Category deleted',
        });
    }
    catch (error) {
        next(error);
    }
});
// ==================== COURSE ASSIGNMENTS ====================
/**
 * @route GET /api/v1/assignments
 * @desc List all course assignments
 */
router.get('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const courseId = req.query.courseId ? parseInt(req.query.courseId, 10) : null;
        let whereClause = 'WHERE ca.tenant_id = @tenantId';
        const params = { tenantId: req.user.tenantId };
        if (courseId) {
            whereClause += ' AND ca.course_id = @courseId';
            params.courseId = courseId;
        }
        const assignments = await database_service_1.DatabaseService.query(`SELECT ca.*, 
              c.title as course_title,
              u.display_name as assigned_by_name,
              CASE 
                WHEN ca.assignment_type = 'user' THEN (SELECT display_name FROM users WHERE id = ca.target_id)
                WHEN ca.assignment_type = 'enterprise' THEN (SELECT name FROM enterprises WHERE id = ca.target_id)
                WHEN ca.assignment_type = 'direction' THEN (SELECT name FROM directions WHERE id = ca.target_id)
                WHEN ca.assignment_type = 'service' THEN (SELECT name FROM services WHERE id = ca.target_id)
                ELSE NULL
              END as target_name
       FROM course_assignments ca
       JOIN courses c ON ca.course_id = c.id
       LEFT JOIN users u ON ca.assigned_by = u.id
       ${whereClause}
       ORDER BY ca.created_at DESC`, params);
        res.json({
            success: true,
            data: assignments.map((a) => ({
                id: a.id,
                tenantId: a.tenant_id,
                courseId: a.course_id,
                courseTitle: a.course_title,
                assignmentType: a.assignment_type,
                targetId: a.target_id,
                targetName: a.target_name,
                targetRole: a.target_role,
                isMandatory: a.is_mandatory,
                dueDate: a.due_date,
                assignedBy: a.assigned_by,
                assignedByName: a.assigned_by_name,
                createdAt: a.created_at,
            })),
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/assignments
 * @desc Create course assignments (assign course to users/groups)
 */
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('courseId').isInt(),
    (0, express_validator_1.body)('assignmentType').isIn(['user', 'enterprise', 'direction', 'service', 'role']),
    (0, express_validator_1.body)('targetIds').isArray({ min: 1 }),
    (0, express_validator_1.body)('targetRole').optional().trim(),
    (0, express_validator_1.body)('isMandatory').optional().isBoolean(),
    (0, express_validator_1.body)('dueDate').optional().isISO8601(),
], async (req, res, next) => {
    try {
        validate(req);
        const { courseId, assignmentType, targetIds, targetRole, isMandatory, dueDate } = req.body;
        // Check if course exists
        const courseExists = await database_service_1.DatabaseService.query(`SELECT id FROM courses WHERE id = @courseId AND tenant_id = @tenantId`, { courseId, tenantId: req.user.tenantId });
        if (courseExists.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Course');
        }
        const createdAssignments = [];
        for (const targetId of targetIds) {
            // Check if assignment already exists
            const existing = await database_service_1.DatabaseService.query(`SELECT id FROM course_assignments 
           WHERE tenant_id = @tenantId AND course_id = @courseId 
           AND assignment_type = @assignmentType AND target_id = @targetId`, {
                tenantId: req.user.tenantId,
                courseId,
                assignmentType,
                targetId,
            });
            if (existing.length === 0) {
                const result = await database_service_1.DatabaseService.query(`INSERT INTO course_assignments (tenant_id, course_id, assignment_type, target_id, target_role, is_mandatory, due_date, assigned_by)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @courseId, @assignmentType, @targetId, @targetRole, @isMandatory, @dueDate, @assignedBy)`, {
                    tenantId: req.user.tenantId,
                    courseId,
                    assignmentType,
                    targetId,
                    targetRole: targetRole || null,
                    isMandatory: isMandatory || false,
                    dueDate: dueDate || null,
                    assignedBy: req.user.id,
                });
                createdAssignments.push({
                    id: result[0].id,
                    courseId: courseId,
                    assignmentType: assignmentType,
                    targetId: targetId,
                });
            }
        }
        res.status(201).json({
            success: true,
            data: createdAssignments,
            message: `${createdAssignments.length} assignment(s) created`,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/assignments/:id
 * @desc Remove a course assignment
 */
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const assignmentId = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute(`DELETE FROM course_assignments WHERE id = @id AND tenant_id = @tenantId`, {
            id: assignmentId,
            tenantId: req.user.tenantId,
        });
        res.json({
            success: true,
            message: 'Assignment removed',
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/assignments/users
 * @desc Get users for assignment selection
 */
router.get('/users', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const search = req.query.search;
        let whereClause = 'WHERE tenant_id = @tenantId AND is_active = 1 AND deleted_at IS NULL';
        const params = { tenantId: req.user.tenantId };
        if (search) {
            whereClause += ' AND (display_name LIKE @search OR email LIKE @search)';
            params.search = `%${search}%`;
        }
        const users = await database_service_1.DatabaseService.query(`SELECT id, display_name, email, role 
       FROM users 
       ${whereClause}
       ORDER BY display_name`, params);
        res.json({
            success: true,
            data: users.map((u) => ({
                id: u.id,
                displayName: u.display_name,
                email: u.email,
                role: u.role,
            })),
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/assignments/my-courses
 * @desc Get courses assigned to current user
 */
router.get('/my-courses', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const enterpriseId = req.user.enterpriseId;
        const directionId = req.user.directionId;
        const serviceId = req.user.serviceId;
        const userRole = req.user.role;
        // Get all courses assigned to user directly or via their organization/role
        const courses = await database_service_1.DatabaseService.query(`SELECT DISTINCT c.*, 
              ca.is_mandatory, ca.due_date,
              (SELECT COUNT(*) FROM modules WHERE course_id = c.id) as module_count
       FROM courses c
       INNER JOIN course_assignments ca ON c.id = ca.course_id AND ca.tenant_id = c.tenant_id
       WHERE c.tenant_id = @tenantId
         AND c.is_published = 1
         AND (
           (ca.assignment_type = 'user' AND ca.target_id = @userId)
           OR (ca.assignment_type = 'enterprise' AND ca.target_id = @enterpriseId)
           OR (ca.assignment_type = 'direction' AND ca.target_id = @directionId)
           OR (ca.assignment_type = 'service' AND ca.target_id = @serviceId)
           OR (ca.assignment_type = 'role' AND ca.target_role = @userRole)
         )
       ORDER BY ca.is_mandatory DESC, ca.due_date ASC`, {
            tenantId: req.user.tenantId,
            userId,
            enterpriseId: enterpriseId || 0,
            directionId: directionId || 0,
            serviceId: serviceId || 0,
            userRole,
        });
        res.json({
            success: true,
            data: courses.map((c) => ({
                id: c.id,
                title: c.title,
                description: c.description,
                category: c.category,
                level: c.level,
                duration: c.duration,
                isMandatory: c.is_mandatory,
                dueDate: c.due_date,
                moduleCount: c.module_count,
            })),
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=assignment.routes.js.map