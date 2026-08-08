"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const config_1 = require("../config");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
/**
 * @route POST /api/v1/users
 * @desc Create a new user (admin only)
 */
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    (0, express_validator_1.body)('displayName').notEmpty().trim(),
    (0, express_validator_1.body)('role').isIn(['admin', 'director', 'manager', 'supervisor', 'agent']),
    (0, express_validator_1.body)('enterpriseId').optional().isInt(),
    (0, express_validator_1.body)('directionId').optional().isInt(),
    (0, express_validator_1.body)('serviceId').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        // Directors can only create non-admin users
        if (req.user.role === 'director' && req.body.role === 'admin') {
            throw (0, error_middleware_1.BadRequestError)('Directors cannot create admin users');
        }
        // Check if email already exists
        const existingUsers = await database_service_1.DatabaseService.query('SELECT id FROM users WHERE email = @email AND tenant_id = @tenantId', { email: req.body.email, tenantId: req.user.tenantId });
        if (existingUsers.length > 0) {
            throw (0, error_middleware_1.ConflictError)('Email already registered');
        }
        // Generate username from email
        const username = req.body.email.split('@')[0] + '_' + Date.now().toString(36);
        // Hash password
        const passwordHash = await bcryptjs_1.default.hash(req.body.password, config_1.config.bcryptRounds);
        // Insert user
        const result = await database_service_1.DatabaseService.query(`INSERT INTO users (
          tenant_id, email, username, password_hash, display_name, role,
          enterprise_id, direction_id, service_id, is_active
        )
        OUTPUT INSERTED.id
        VALUES (
          @tenantId, @email, @username, @passwordHash, @displayName, @role,
          @enterpriseId, @directionId, @serviceId, 1
        )`, {
            tenantId: req.user.tenantId,
            email: req.body.email,
            username,
            passwordHash,
            displayName: req.body.displayName,
            role: req.body.role,
            enterpriseId: req.body.enterpriseId || null,
            directionId: req.body.directionId || null,
            serviceId: req.body.serviceId || null,
        });
        const userId = result[0].id;
        // Get created user
        const users = await database_service_1.DatabaseService.query(`SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.is_active,
                u.enterprise_id, u.direction_id, u.service_id, u.created_at,
                e.name as enterprise_name, d.name as direction_name, s.name as service_name
         FROM users u
         LEFT JOIN enterprises e ON u.enterprise_id = e.id
         LEFT JOIN directions d ON u.direction_id = d.id
         LEFT JOIN services s ON u.service_id = s.id
         WHERE u.id = @userId`, { userId });
        res.status(201).json({
            success: true,
            data: users[0],
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/users
 * @desc List users (with filters)
 */
router.get('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = (page - 1) * limit;
        const search = req.query.search;
        const role = req.query.role;
        const directionId = req.query.directionId;
        const serviceId = req.query.serviceId;
        let whereClause = 'WHERE u.tenant_id = @tenantId AND u.deleted_at IS NULL';
        const params = { tenantId: req.user.tenantId, limit, offset };
        if (search) {
            whereClause += ` AND (u.display_name LIKE @search OR u.email LIKE @search)`;
            params.search = `%${search}%`;
        }
        if (role) {
            whereClause += ' AND u.role = @role';
            params.role = role;
        }
        if (directionId) {
            whereClause += ' AND u.direction_id = @directionId';
            params.directionId = parseInt(directionId, 10);
        }
        if (serviceId) {
            whereClause += ' AND u.service_id = @serviceId';
            params.serviceId = parseInt(serviceId, 10);
        }
        // Apply scope restrictions for non-admins
        if (req.user.role === 'director' && req.user.directionId) {
            whereClause += ' AND u.direction_id = @userDirectionId';
            params.userDirectionId = req.user.directionId;
        }
        else if (req.user.role === 'manager' && req.user.serviceId) {
            whereClause += ' AND u.service_id = @userServiceId';
            params.userServiceId = req.user.serviceId;
        }
        const [countResult, users] = await Promise.all([
            database_service_1.DatabaseService.query(`SELECT COUNT(*) as total FROM users u ${whereClause}`, params),
            database_service_1.DatabaseService.query(`SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.is_active,
                u.enterprise_id, u.direction_id, u.service_id, u.created_at,
                e.name as enterprise_name, d.name as direction_name, s.name as service_name
         FROM users u
         LEFT JOIN enterprises e ON u.enterprise_id = e.id
         LEFT JOIN directions d ON u.direction_id = d.id
         LEFT JOIN services s ON u.service_id = s.id
         ${whereClause}
         ORDER BY u.created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`, params),
        ]);
        res.json({
            success: true,
            data: users,
            meta: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/users/:id
 * @desc Get user by ID
 */
router.get('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const users = await database_service_1.DatabaseService.query(`SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.is_active,
              u.enterprise_id, u.direction_id, u.service_id, u.created_at, u.updated_at,
              e.name as enterprise_name, d.name as direction_name, s.name as service_name
       FROM users u
       LEFT JOIN enterprises e ON u.enterprise_id = e.id
       LEFT JOIN directions d ON u.direction_id = d.id
       LEFT JOIN services s ON u.service_id = s.id
       WHERE u.id = @userId AND u.tenant_id = @tenantId AND u.deleted_at IS NULL`, { userId, tenantId: req.user.tenantId });
        if (users.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('User');
        }
        res.json({
            success: true,
            data: users[0],
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/users/:id
 * @desc Update user
 */
router.put('/:id', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('displayName').optional().trim(),
    (0, express_validator_1.body)('avatarUrl').optional({ nullable: true }).isString(),
    (0, express_validator_1.body)('role').optional().isIn(['admin', 'director', 'manager', 'supervisor', 'agent']),
    (0, express_validator_1.body)('isActive').optional().isBoolean(),
    (0, express_validator_1.body)('enterpriseId').optional().isInt(),
    (0, express_validator_1.body)('directionId').optional().isInt(),
    (0, express_validator_1.body)('serviceId').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        const userId = parseInt(req.params.id, 10);
        // Check permissions
        const canEdit = req.user.role === 'admin' ||
            (req.user.role === 'director' && req.body.role !== 'admin') ||
            req.user.id === userId;
        if (!canEdit) {
            throw (0, error_middleware_1.BadRequestError)('Insufficient permissions to update this user');
        }
        const updateFields = [];
        const params = { userId, tenantId: req.user.tenantId };
        if (req.body.displayName) {
            updateFields.push('display_name = @displayName');
            params.displayName = req.body.displayName;
        }
        if (req.body.avatarUrl !== undefined) {
            updateFields.push('avatar_url = @avatarUrl');
            params.avatarUrl = req.body.avatarUrl;
        }
        if (req.body.role && req.user.role === 'admin') {
            updateFields.push('role = @role');
            params.role = req.body.role;
        }
        if (req.body.isActive !== undefined && req.user.role === 'admin') {
            updateFields.push('is_active = @isActive');
            params.isActive = req.body.isActive;
        }
        if (req.body.enterpriseId !== undefined) {
            updateFields.push('enterprise_id = @enterpriseId');
            params.enterpriseId = req.body.enterpriseId;
        }
        if (req.body.directionId !== undefined) {
            updateFields.push('direction_id = @directionId');
            params.directionId = req.body.directionId;
        }
        if (req.body.serviceId !== undefined) {
            updateFields.push('service_id = @serviceId');
            params.serviceId = req.body.serviceId;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE users SET ${updateFields.join(', ')}, updated_at = SYSUTCDATETIME()
           WHERE id = @userId AND tenant_id = @tenantId`, params);
        }
        const users = await database_service_1.DatabaseService.query(`SELECT id, email, username, display_name, avatar_url, role, is_active,
                enterprise_id, direction_id, service_id
         FROM users WHERE id = @userId AND tenant_id = @tenantId`, { userId, tenantId: req.user.tenantId });
        res.json({
            success: true,
            data: users[0],
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/users/:id
 * @desc Soft delete user
 */
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id, 10);
        if (userId === req.user.id) {
            throw (0, error_middleware_1.BadRequestError)('Cannot delete your own account');
        }
        await database_service_1.DatabaseService.execute(`UPDATE users SET deleted_at = SYSUTCDATETIME(), is_active = 0
       WHERE id = @userId AND tenant_id = @tenantId`, { userId, tenantId: req.user.tenantId });
        res.json({
            success: true,
            message: 'User deleted successfully',
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/users/:id/badges
 * @desc Get user's badges
 */
router.get('/:id/badges', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const badges = await database_service_1.DatabaseService.query(`SELECT b.id, b.code, b.name, b.description, ub.awarded_at,
              f.storage_key as icon_url
       FROM user_badges ub
       JOIN badges b ON ub.badge_id = b.id
       LEFT JOIN file_assets f ON b.icon_file_id = f.id
       WHERE ub.user_id = @userId AND ub.tenant_id = @tenantId
       ORDER BY ub.awarded_at DESC`, { userId, tenantId: req.user.tenantId });
        res.json({
            success: true,
            data: badges,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/users/:id/certificates
 * @desc Get user's certificates
 */
router.get('/:id/certificates', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const certificates = await database_service_1.DatabaseService.query(`SELECT c.id, c.serial, c.issued_at, co.title as course_title,
              f.storage_key as pdf_url
       FROM certificates c
       JOIN courses co ON c.course_id = co.id
       LEFT JOIN file_assets f ON c.pdf_file_id = f.id
       WHERE c.user_id = @userId AND c.tenant_id = @tenantId
       ORDER BY c.issued_at DESC`, { userId, tenantId: req.user.tenantId });
        res.json({
            success: true,
            data: certificates,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/users/:id/progress
 * @desc Get user's learning progress
 */
router.get('/:id/progress', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id, 10);
        // Get course progress
        const progress = await database_service_1.DatabaseService.query(`SELECT 
        c.id as course_id, c.title as course_title,
        COUNT(DISTINCT a.quiz_id) as quizzes_attempted,
        MAX(a.score) as best_score,
        (SELECT COUNT(*) FROM quizzes q 
         JOIN lessons l ON q.lesson_id = l.id 
         JOIN modules m ON l.module_id = m.id 
         WHERE m.course_id = c.id) as total_quizzes,
        CASE WHEN cert.id IS NOT NULL THEN 1 ELSE 0 END as completed
       FROM courses c
       LEFT JOIN modules m ON m.course_id = c.id
       LEFT JOIN lessons l ON l.module_id = m.id
       LEFT JOIN quizzes q ON q.lesson_id = l.id
       LEFT JOIN attempts a ON a.quiz_id = q.id AND a.user_id = @userId
       LEFT JOIN certificates cert ON cert.course_id = c.id AND cert.user_id = @userId
       WHERE c.tenant_id = @tenantId AND c.is_published = 1
       GROUP BY c.id, c.title, cert.id
       ORDER BY c.title`, { userId, tenantId: req.user.tenantId });
        res.json({
            success: true,
            data: progress,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=user.routes.js.map