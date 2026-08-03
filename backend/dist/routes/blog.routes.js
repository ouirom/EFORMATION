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
// ==================== BLOG POSTS ====================
/**
 * @route GET /api/v1/blog/posts
 * @desc List blog posts
 */
router.get('/posts', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const offset = (page - 1) * limit;
        const categoryId = req.query.categoryId;
        const tag = req.query.tag;
        const status = req.query.status;
        const search = req.query.search;
        let query = `SELECT bp.*, u.display_name as author_name, bc.name as category_name,
                        (SELECT COUNT(*) FROM blog_comments WHERE post_id = bp.id AND deleted_at IS NULL) as comment_count
                 FROM blog_posts bp
                 LEFT JOIN users u ON bp.author_id = u.id
                 LEFT JOIN blog_categories bc ON bp.category_id = bc.id
                 WHERE bp.tenant_id = @tenantId`;
        const params = { tenantId: req.user.tenantId };
        // Non-admins only see published posts
        if (!['admin', 'director'].includes(req.user.role)) {
            query += ' AND bp.status = @pubStatus';
            params.pubStatus = 'published';
        }
        else if (status) {
            query += ' AND bp.status = @status';
            params.status = status;
        }
        if (categoryId) {
            query += ' AND bp.category_id = @categoryId';
            params.categoryId = parseInt(categoryId, 10);
        }
        if (search) {
            query += ' AND (bp.title LIKE @search OR bp.body LIKE @search)';
            params.search = `%${search}%`;
        }
        const [countResult, posts] = await Promise.all([
            database_service_1.DatabaseService.query(`SELECT COUNT(*) as total FROM blog_posts bp WHERE bp.tenant_id = @tenantId ${!['admin', 'director'].includes(req.user.role) ? "AND bp.status = 'published'" : ''}`, { tenantId: req.user.tenantId }),
            database_service_1.DatabaseService.query(`${query} ORDER BY bp.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`, { ...params, offset, limit }),
        ]);
        // Get tags for posts
        const postsWithTags = await Promise.all(posts.map(async (post) => {
            const tags = await database_service_1.DatabaseService.query(`SELECT bt.* FROM blog_tags bt
           JOIN blog_post_tags bpt ON bt.id = bpt.tag_id
           WHERE bpt.post_id = @postId`, { postId: post.id });
            return { ...post, tags };
        }));
        res.json({
            success: true,
            data: postsWithTags,
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
 * @route GET /api/v1/blog/posts/:id
 * @desc Get blog post by ID
 */
router.get('/posts/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const postId = parseInt(req.params.id, 10);
        const posts = await database_service_1.DatabaseService.query(`SELECT bp.*, u.display_name as author_name, bc.name as category_name
       FROM blog_posts bp
       LEFT JOIN users u ON bp.author_id = u.id
       LEFT JOIN blog_categories bc ON bp.category_id = bc.id
       WHERE bp.id = @postId AND bp.tenant_id = @tenantId`, { postId, tenantId: req.user.tenantId });
        if (posts.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Blog post');
        }
        // Get tags
        const tags = await database_service_1.DatabaseService.query(`SELECT bt.* FROM blog_tags bt
       JOIN blog_post_tags bpt ON bt.id = bpt.tag_id
       WHERE bpt.post_id = @postId`, { postId });
        // Increment view count
        await database_service_1.DatabaseService.execute('UPDATE blog_posts SET view_count = view_count + 1 WHERE id = @postId', { postId });
        res.json({
            success: true,
            data: { ...posts[0], tags },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/blog/posts
 * @desc Create a blog post
 */
router.post('/posts', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('title').notEmpty().trim(),
    (0, express_validator_1.body)('body').notEmpty(),
    (0, express_validator_1.body)('categoryId').optional().isInt(),
    (0, express_validator_1.body)('status').optional().isIn(['draft', 'published']),
    (0, express_validator_1.body)('tagIds').optional().isArray(),
], async (req, res, next) => {
    try {
        validate(req);
        const { title, body: postBody, categoryId, status, tagIds, featuredImageId } = req.body;
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        const result = await database_service_1.DatabaseService.query(`INSERT INTO blog_posts (tenant_id, title, slug, body, author_id, category_id, status, featured_image_id, published_at)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @title, @slug, @body, @authorId, @categoryId, @status, @featuredImageId, 
                 CASE WHEN @status = 'published' THEN SYSUTCDATETIME() ELSE NULL END)`, {
            tenantId: req.user.tenantId,
            title,
            slug,
            body: postBody,
            authorId: req.user.id,
            categoryId: categoryId || null,
            status: status || 'draft',
            featuredImageId: featuredImageId || null,
        });
        const postId = result[0].id;
        // Add tags
        if (tagIds && tagIds.length > 0) {
            for (const tagId of tagIds) {
                await database_service_1.DatabaseService.execute(`INSERT INTO blog_post_tags (post_id, tag_id) VALUES (@postId, @tagId)`, { postId, tagId });
            }
        }
        const post = await database_service_1.DatabaseService.query('SELECT * FROM blog_posts WHERE id = @postId', { postId });
        res.status(201).json({ success: true, data: post[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/blog/posts/:id
 * @desc Update a blog post
 */
router.put('/posts/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const postId = parseInt(req.params.id, 10);
        const { title, body: postBody, categoryId, status, tagIds, featuredImageId } = req.body;
        const updateFields = [];
        const params = { postId, tenantId: req.user.tenantId };
        if (title) {
            updateFields.push('title = @title');
            params.title = title;
            updateFields.push('slug = @slug');
            params.slug = title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
        }
        if (postBody) {
            updateFields.push('body = @body');
            params.body = postBody;
        }
        if (categoryId !== undefined) {
            updateFields.push('category_id = @categoryId');
            params.categoryId = categoryId || null;
        }
        if (status) {
            updateFields.push('status = @status');
            params.status = status;
            if (status === 'published') {
                updateFields.push('published_at = COALESCE(published_at, SYSUTCDATETIME())');
            }
        }
        if (featuredImageId !== undefined) {
            updateFields.push('featured_image_id = @featuredImageId');
            params.featuredImageId = featuredImageId || null;
        }
        if (updateFields.length > 0) {
            updateFields.push('updated_at = SYSUTCDATETIME()');
            await database_service_1.DatabaseService.execute(`UPDATE blog_posts SET ${updateFields.join(', ')} WHERE id = @postId AND tenant_id = @tenantId`, params);
        }
        // Update tags
        if (tagIds !== undefined) {
            await database_service_1.DatabaseService.execute('DELETE FROM blog_post_tags WHERE post_id = @postId', { postId });
            for (const tagId of tagIds) {
                await database_service_1.DatabaseService.execute(`INSERT INTO blog_post_tags (post_id, tag_id) VALUES (@postId, @tagId)`, { postId, tagId });
            }
        }
        const post = await database_service_1.DatabaseService.query('SELECT * FROM blog_posts WHERE id = @postId', { postId });
        res.json({ success: true, data: post[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/blog/posts/:id
 * @desc Delete a blog post
 */
router.delete('/posts/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), async (req, res, next) => {
    try {
        const postId = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute('DELETE FROM blog_posts WHERE id = @postId AND tenant_id = @tenantId', { postId, tenantId: req.user.tenantId });
        res.json({ success: true, message: 'Blog post deleted' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== CATEGORIES ====================
/**
 * @route GET /api/v1/blog/categories
 * @desc List blog categories
 */
router.get('/categories', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const categories = await database_service_1.DatabaseService.query(`SELECT bc.*, (SELECT COUNT(*) FROM blog_posts WHERE category_id = bc.id) as post_count
       FROM blog_categories bc
       WHERE bc.tenant_id = @tenantId
       ORDER BY bc.name`, { tenantId: req.user.tenantId });
        res.json({ success: true, data: categories });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/blog/categories
 * @desc Create a blog category
 */
router.post('/categories', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), [(0, express_validator_1.body)('name').notEmpty().trim()], async (req, res, next) => {
    try {
        validate(req);
        const slug = req.body.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        const result = await database_service_1.DatabaseService.query(`INSERT INTO blog_categories (tenant_id, name, slug)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name, @slug)`, { tenantId: req.user.tenantId, name: req.body.name, slug });
        const category = await database_service_1.DatabaseService.query('SELECT * FROM blog_categories WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: category[0] });
    }
    catch (error) {
        next(error);
    }
});
// ==================== TAGS ====================
/**
 * @route GET /api/v1/blog/tags
 * @desc List blog tags
 */
router.get('/tags', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const tags = await database_service_1.DatabaseService.query(`SELECT bt.*, (SELECT COUNT(*) FROM blog_post_tags WHERE tag_id = bt.id) as post_count
       FROM blog_tags bt
       WHERE bt.tenant_id = @tenantId
       ORDER BY bt.name`, { tenantId: req.user.tenantId });
        res.json({ success: true, data: tags });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/blog/tags
 * @desc Create a blog tag
 */
router.post('/tags', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [(0, express_validator_1.body)('name').notEmpty().trim()], async (req, res, next) => {
    try {
        validate(req);
        const slug = req.body.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        const result = await database_service_1.DatabaseService.query(`INSERT INTO blog_tags (tenant_id, name, slug)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name, @slug)`, { tenantId: req.user.tenantId, name: req.body.name, slug });
        const tag = await database_service_1.DatabaseService.query('SELECT * FROM blog_tags WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: tag[0] });
    }
    catch (error) {
        next(error);
    }
});
// ==================== COMMENTS ====================
/**
 * @route GET /api/v1/blog/posts/:id/comments
 * @desc Get comments for a post
 */
router.get('/posts/:id/comments', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const postId = parseInt(req.params.id, 10);
        const comments = await database_service_1.DatabaseService.query(`SELECT bc.*, u.display_name as author_name
       FROM blog_comments bc
       LEFT JOIN users u ON bc.user_id = u.id
       WHERE bc.post_id = @postId AND bc.deleted_at IS NULL
       ORDER BY bc.created_at ASC`, { postId });
        // Build comment tree
        const commentMap = new Map();
        const rootComments = [];
        comments.forEach((comment) => {
            comment.replies = [];
            commentMap.set(comment.id, comment);
        });
        comments.forEach((comment) => {
            if (comment.parent_id) {
                const parent = commentMap.get(comment.parent_id);
                if (parent) {
                    parent.replies.push(comment);
                }
            }
            else {
                rootComments.push(comment);
            }
        });
        res.json({ success: true, data: rootComments });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/blog/posts/:id/comments
 * @desc Add a comment to a post
 */
router.post('/posts/:id/comments', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('body').notEmpty().trim(),
    (0, express_validator_1.body)('parentId').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        const postId = parseInt(req.params.id, 10);
        const result = await database_service_1.DatabaseService.query(`INSERT INTO blog_comments (tenant_id, post_id, user_id, body, parent_id)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @postId, @userId, @body, @parentId)`, {
            tenantId: req.user.tenantId,
            postId,
            userId: req.user.id,
            body: req.body.body,
            parentId: req.body.parentId || null,
        });
        const comment = await database_service_1.DatabaseService.query(`SELECT bc.*, u.display_name as author_name
         FROM blog_comments bc
         LEFT JOIN users u ON bc.user_id = u.id
         WHERE bc.id = @id`, { id: result[0].id });
        res.status(201).json({ success: true, data: comment[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/blog/comments/:id
 * @desc Delete a comment
 */
router.delete('/comments/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const commentId = parseInt(req.params.id, 10);
        // Check ownership or admin
        const comments = await database_service_1.DatabaseService.query('SELECT user_id FROM blog_comments WHERE id = @commentId', { commentId });
        if (comments.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Comment');
        }
        if (comments[0].user_id !== req.user.id && !['admin', 'director'].includes(req.user.role)) {
            throw (0, error_middleware_1.BadRequestError)('Not authorized to delete this comment');
        }
        await database_service_1.DatabaseService.execute('UPDATE blog_comments SET deleted_at = SYSUTCDATETIME() WHERE id = @commentId', { commentId });
        res.json({ success: true, message: 'Comment deleted' });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=blog.routes.js.map