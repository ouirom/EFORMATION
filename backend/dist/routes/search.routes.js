"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
/**
 * @route GET /api/v1/search
 * @desc Global search across multiple entities
 */
router.get('/', auth_middleware_1.authenticate, [(0, express_validator_1.query)('q').notEmpty().trim().isLength({ min: 2 })], async (req, res, next) => {
    try {
        validate(req);
        const searchQuery = req.query.q;
        const types = req.query.types?.split(',') || ['courses', 'lessons', 'users', 'blog'];
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const tenantId = req.user.tenantId;
        const results = {};
        // Search courses
        if (types.includes('courses')) {
            const courses = await database_service_1.DatabaseService.query(`SELECT TOP (@limit) id, title, description, category, 'course' as type
           FROM courses
           WHERE tenant_id = @tenantId AND status = 'published'
             AND (title LIKE @search OR description LIKE @search OR category LIKE @search)
           ORDER BY 
             CASE WHEN title LIKE @exactSearch THEN 0 ELSE 1 END,
             title`, { tenantId, search: `%${searchQuery}%`, exactSearch: `${searchQuery}%`, limit });
            results.courses = courses;
        }
        // Search lessons
        if (types.includes('lessons')) {
            const lessons = await database_service_1.DatabaseService.query(`SELECT TOP (@limit) l.id, l.title, l.description, c.title as course_title, 'lesson' as type
           FROM lessons l
           JOIN modules m ON l.module_id = m.id
           JOIN courses c ON m.course_id = c.id
           WHERE c.tenant_id = @tenantId AND c.status = 'published'
             AND (l.title LIKE @search OR l.description LIKE @search)
           ORDER BY 
             CASE WHEN l.title LIKE @exactSearch THEN 0 ELSE 1 END,
             l.title`, { tenantId, search: `%${searchQuery}%`, exactSearch: `${searchQuery}%`, limit });
            results.lessons = lessons;
        }
        // Search users (admin/director only)
        if (types.includes('users') && ['admin', 'director', 'manager'].includes(req.user.role)) {
            const users = await database_service_1.DatabaseService.query(`SELECT TOP (@limit) id, display_name, email, role, 'user' as type
           FROM users
           WHERE tenant_id = @tenantId AND is_active = 1
             AND (display_name LIKE @search OR email LIKE @search)
           ORDER BY 
             CASE WHEN display_name LIKE @exactSearch THEN 0 ELSE 1 END,
             display_name`, { tenantId, search: `%${searchQuery}%`, exactSearch: `${searchQuery}%`, limit });
            results.users = users;
        }
        // Search blog posts
        if (types.includes('blog')) {
            const posts = await database_service_1.DatabaseService.query(`SELECT TOP (@limit) id, title, slug, 'blog_post' as type
           FROM blog_posts
           WHERE tenant_id = @tenantId AND status = 'published'
             AND (title LIKE @search OR body LIKE @search)
           ORDER BY 
             CASE WHEN title LIKE @exactSearch THEN 0 ELSE 1 END,
             title`, { tenantId, search: `%${searchQuery}%`, exactSearch: `${searchQuery}%`, limit });
            results.blog = posts;
        }
        // Search quizzes
        if (types.includes('quizzes')) {
            const quizzes = await database_service_1.DatabaseService.query(`SELECT TOP (@limit) q.id, q.title, c.title as course_title, 'quiz' as type
           FROM quizzes q
           LEFT JOIN courses c ON q.course_id = c.id
           WHERE q.tenant_id = @tenantId
             AND q.title LIKE @search
           ORDER BY q.title`, { tenantId, search: `%${searchQuery}%`, limit });
            results.quizzes = quizzes;
        }
        // Search badges
        if (types.includes('badges')) {
            const badges = await database_service_1.DatabaseService.query(`SELECT TOP (@limit) id, name, description, type, 'badge' as type
           FROM badges
           WHERE tenant_id = @tenantId
             AND (name LIKE @search OR description LIKE @search)
           ORDER BY name`, { tenantId, search: `%${searchQuery}%`, limit });
            results.badges = badges;
        }
        // Calculate total results
        const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
        res.json({
            success: true,
            data: results,
            meta: {
                query: searchQuery,
                totalResults,
                types: Object.keys(results),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/search/courses
 * @desc Search courses with filters
 */
router.get('/courses', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const searchQuery = req.query.q || '';
        const category = req.query.category;
        const difficulty = req.query.difficulty;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = (page - 1) * limit;
        const sortBy = req.query.sortBy || 'title';
        const sortOrder = req.query.sortOrder || 'asc';
        let query = `SELECT c.*, u.display_name as author_name,
                        (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrollment_count
                 FROM courses c
                 LEFT JOIN users u ON c.created_by = u.id
                 WHERE c.tenant_id = @tenantId AND c.status = 'published'`;
        const params = { tenantId: req.user.tenantId };
        if (searchQuery) {
            query += ' AND (c.title LIKE @search OR c.description LIKE @search)';
            params.search = `%${searchQuery}%`;
        }
        if (category) {
            query += ' AND c.category = @category';
            params.category = category;
        }
        if (difficulty) {
            query += ' AND c.difficulty_level = @difficulty';
            params.difficulty = difficulty;
        }
        // Count query
        const countQuery = query.replace('SELECT c.*, u.display_name as author_name, (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrollment_count', 'SELECT COUNT(*) as total');
        const validSortFields = ['title', 'created_at', 'enrollment_count'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'title';
        const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        query += ` ORDER BY ${sortField === 'enrollment_count' ? 'enrollment_count' : `c.${sortField}`} ${order}`;
        query += ' OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
        const [countResult, courses] = await Promise.all([
            database_service_1.DatabaseService.query(countQuery, params),
            database_service_1.DatabaseService.query(`${query}`, { ...params, offset, limit }),
        ]);
        res.json({
            success: true,
            data: courses,
            meta: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit),
                query: searchQuery,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/search/users
 * @desc Search users with filters
 */
router.get('/users', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        // Only managers and above can search users
        if (!['admin', 'director', 'manager'].includes(req.user.role)) {
            res.status(403).json({ success: false, message: 'Not authorized' });
            return;
        }
        const searchQuery = req.query.q || '';
        const role = req.query.role;
        const enterpriseId = req.query.enterpriseId;
        const directionId = req.query.directionId;
        const serviceId = req.query.serviceId;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = (page - 1) * limit;
        let query = `SELECT u.id, u.display_name, u.email, u.role, u.is_active, u.created_at,
                        e.name as enterprise_name, d.name as direction_name, s.name as service_name
                 FROM users u
                 LEFT JOIN enterprises e ON u.enterprise_id = e.id
                 LEFT JOIN directions d ON u.direction_id = d.id
                 LEFT JOIN services s ON u.service_id = s.id
                 WHERE u.tenant_id = @tenantId`;
        const params = { tenantId: req.user.tenantId };
        if (searchQuery) {
            query += ' AND (u.display_name LIKE @search OR u.email LIKE @search)';
            params.search = `%${searchQuery}%`;
        }
        if (role) {
            query += ' AND u.role = @role';
            params.role = role;
        }
        if (enterpriseId) {
            query += ' AND u.enterprise_id = @enterpriseId';
            params.enterpriseId = parseInt(enterpriseId, 10);
        }
        if (directionId) {
            query += ' AND u.direction_id = @directionId';
            params.directionId = parseInt(directionId, 10);
        }
        if (serviceId) {
            query += ' AND u.service_id = @serviceId';
            params.serviceId = parseInt(serviceId, 10);
        }
        const countQuery = query.replace(`SELECT u.id, u.display_name, u.email, u.role, u.is_active, u.created_at,
                        e.name as enterprise_name, d.name as direction_name, s.name as service_name`, 'SELECT COUNT(*) as total');
        query += ' ORDER BY u.display_name OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
        const [countResult, users] = await Promise.all([
            database_service_1.DatabaseService.query(countQuery, params),
            database_service_1.DatabaseService.query(`${query}`, { ...params, offset, limit }),
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
 * @route GET /api/v1/search/suggestions
 * @desc Get search suggestions/autocomplete
 */
router.get('/suggestions', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const prefix = req.query.q || '';
        if (prefix.length < 2) {
            res.json({ success: true, data: [] });
            return;
        }
        const tenantId = req.user.tenantId;
        // Get suggestions from courses and lessons
        const suggestions = await database_service_1.DatabaseService.query(`SELECT TOP 25 text, type FROM (
         SELECT title as text, 'course' as type FROM courses
         WHERE tenant_id = @tenantId AND status = 'published' AND title LIKE @prefix
         UNION
         SELECT l.title as text, 'lesson' as type FROM lessons l
         JOIN modules m ON l.module_id = m.id
         JOIN courses c ON m.course_id = c.id
         WHERE c.tenant_id = @tenantId AND c.status = 'published' AND l.title LIKE @prefix
         UNION
         SELECT name as text, 'badge' as type FROM badges
         WHERE tenant_id = @tenantId AND name LIKE @prefix
       ) combined`, { tenantId, prefix: `${prefix}%` });
        res.json({ success: true, data: suggestions });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/search/recent
 * @desc Get user's recent searches
 */
router.get('/recent', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const searches = await database_service_1.DatabaseService.query(`SELECT TOP 10 query, searched_at FROM search_history
       WHERE user_id = @userId
       ORDER BY searched_at DESC`, { userId: req.user.id });
        res.json({ success: true, data: searches });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/search/log
 * @desc Log a search query (for analytics and recent searches)
 */
router.post('/log', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { query: searchQuery, resultCount } = req.body;
        if (searchQuery && searchQuery.length >= 2) {
            await database_service_1.DatabaseService.execute(`INSERT INTO search_history (tenant_id, user_id, query, result_count)
         VALUES (@tenantId, @userId, @query, @resultCount)`, {
                tenantId: req.user.tenantId,
                userId: req.user.id,
                query: searchQuery,
                resultCount: resultCount || 0,
            });
        }
        res.json({ success: true });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=search.routes.js.map