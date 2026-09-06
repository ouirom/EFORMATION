import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest, ROLE_HIERARCHY } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db, IS_PG } from '../database/db-helpers';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error.middleware';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// Manager and above can author/moderate blog content -- matches the authorize()
// threshold already used on the write routes below. A plain role-name array here
// (e.g. ['admin', 'director']) would silently exclude super_admin and manager.
const canManageBlog = (role: string) => (ROLE_HIERARCHY[role] || 0) >= ROLE_HIERARCHY.manager;

// ==================== BLOG POSTS ====================

/**
 * @route GET /api/v1/blog/posts
 * @desc List blog posts
 */
router.get('/posts', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req, { defaultLimit: 10, maxLimit: 50 });
    const categoryId = req.query.categoryId as string;
    const tagId = req.query.tagId as string;
    const status = req.query.status as string;
    const search = req.query.search as string;

    let whereClause = 'WHERE bp.tenant_id = @tenantId';
    const params: Record<string, any> = { tenantId: req.user!.tenantId };

    // Non-managers only see published posts
    if (!canManageBlog(req.user!.role)) {
      whereClause += ' AND bp.status = @pubStatus';
      params.pubStatus = 'published';
    } else if (status) {
      whereClause += ' AND bp.status = @status';
      params.status = status;
    }

    if (categoryId) {
      whereClause += ' AND bp.category_id = @categoryId';
      params.categoryId = parseInt(categoryId, 10);
    }

    if (tagId) {
      whereClause += ' AND EXISTS (SELECT 1 FROM blog_post_tags bpt WHERE bpt.post_id = bp.id AND bpt.tag_id = @tagId)';
      params.tagId = parseInt(tagId, 10);
    }

    if (search) {
      whereClause += ' AND (bp.title LIKE @search OR bp.body LIKE @search)';
      params.search = `%${search}%`;
    }

    const [countResult, posts] = await Promise.all([
      DatabaseService.query<{ total: number }>(
        `SELECT COUNT(*) as total FROM blog_posts bp ${whereClause}`,
        params
      ),
      DatabaseService.query<any>(
        `SELECT bp.*, u.display_name as author_name, bc.name as category_name,
                (SELECT COUNT(*) FROM blog_comments WHERE post_id = bp.id AND deleted_at IS NULL) as comment_count
         FROM blog_posts bp
         LEFT JOIN users u ON bp.author_id = u.id
         LEFT JOIN blog_categories bc ON bp.category_id = bc.id
         ${whereClause}
         ORDER BY bp.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        { ...params, offset, limit }
      ),
    ]);

    // Get tags for posts
    const postsWithTags = await Promise.all(
      posts.map(async (post: any) => {
        const tags = await DatabaseService.query<any>(
          `SELECT bt.* FROM blog_tags bt
           JOIN blog_post_tags bpt ON bt.id = bpt.tag_id
           WHERE bpt.post_id = @postId`,
          { postId: post.id }
        );
        return { ...post, tags };
      })
    );

    res.json({
      success: true,
      data: postsWithTags,
      meta: buildPaginationMeta(countResult[0].total, page, limit),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/blog/posts/:id
 * @desc Get blog post by ID
 */
router.get('/posts/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);

    const posts = await DatabaseService.query<any>(
      `SELECT bp.*, u.display_name as author_name, bc.name as category_name
       FROM blog_posts bp
       LEFT JOIN users u ON bp.author_id = u.id
       LEFT JOIN blog_categories bc ON bp.category_id = bc.id
       WHERE bp.id = @postId AND bp.tenant_id = @tenantId`,
      { postId, tenantId: req.user!.tenantId }
    );

    if (posts.length === 0) {
      throw NotFoundError('Blog post');
    }

    // A draft/archived post is only visible to the roles that can manage the
    // blog -- otherwise anyone could read an unpublished post just by guessing
    // its id, bypassing the status filter the list endpoint applies.
    if (posts[0].status !== 'published' && !canManageBlog(req.user!.role)) {
      throw NotFoundError('Blog post');
    }

    // Get tags
    const tags = await DatabaseService.query<any>(
      `SELECT bt.* FROM blog_tags bt
       JOIN blog_post_tags bpt ON bt.id = bpt.tag_id
       WHERE bpt.post_id = @postId`,
      { postId }
    );

    // Increment view count
    await DatabaseService.execute(
      'UPDATE blog_posts SET view_count = view_count + 1 WHERE id = @postId',
      { postId }
    );

    res.json({
      success: true,
      data: { ...posts[0], tags },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/blog/posts
 * @desc Create a blog post
 */
router.post(
  '/posts',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('title').notEmpty().trim(),
    body('body').notEmpty(),
    body('categoryId').optional().isInt(),
    body('status').optional().isIn(['draft', 'published']),
    body('tagIds').optional().isArray(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { title, body: postBody, categoryId, status, tagIds, featuredImageId } = req.body;

      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO blog_posts (tenant_id, title, slug, body, author_id, category_id, status, featured_image_id, published_at)
             VALUES (@tenantId, @title, @slug, @body, @authorId, @categoryId, @status, @featuredImageId,
                     CASE WHEN @status = 'published' THEN ${db.now()} ELSE NULL END)
             RETURNING id`
          : `INSERT INTO blog_posts (tenant_id, title, slug, body, author_id, category_id, status, featured_image_id, published_at)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @title, @slug, @body, @authorId, @categoryId, @status, @featuredImageId,
                     CASE WHEN @status = 'published' THEN SYSUTCDATETIME() ELSE NULL END)`,
        {
          tenantId: req.user!.tenantId,
          title,
          slug,
          body: postBody,
          authorId: req.user!.id,
          categoryId: categoryId || null,
          status: status || 'draft',
          featuredImageId: featuredImageId || null,
        }
      );

      const postId = result[0].id;

      // Add tags
      if (tagIds && tagIds.length > 0) {
        for (const tagId of tagIds) {
          await DatabaseService.execute(
            `INSERT INTO blog_post_tags (post_id, tag_id) VALUES (@postId, @tagId)`,
            { postId, tagId }
          );
        }
      }

      const post = await DatabaseService.query<any>(
        'SELECT * FROM blog_posts WHERE id = @postId',
        { postId }
      );

      res.status(201).json({ success: true, data: post[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/blog/posts/:id
 * @desc Update a blog post
 */
router.put(
  '/posts/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const { title, body: postBody, categoryId, status, tagIds, featuredImageId } = req.body;

      const existing = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM blog_posts WHERE id = @postId AND tenant_id = @tenantId',
        { postId, tenantId: req.user!.tenantId }
      );
      if (existing.length === 0) {
        throw NotFoundError('Blog post');
      }

      const updateFields: string[] = [];
      const params: Record<string, any> = { postId, tenantId: req.user!.tenantId };

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
          updateFields.push(`published_at = COALESCE(published_at, ${db.now()})`);
        }
      }
      if (featuredImageId !== undefined) {
        updateFields.push('featured_image_id = @featuredImageId');
        params.featuredImageId = featuredImageId || null;
      }

      if (updateFields.length > 0) {
        updateFields.push(`updated_at = ${db.now()}`);
        await DatabaseService.execute(
          `UPDATE blog_posts SET ${updateFields.join(', ')} WHERE id = @postId AND tenant_id = @tenantId`,
          params
        );
      }

      // Update tags
      if (tagIds !== undefined) {
        await DatabaseService.execute('DELETE FROM blog_post_tags WHERE post_id = @postId', { postId });
        for (const tagId of tagIds) {
          await DatabaseService.execute(
            `INSERT INTO blog_post_tags (post_id, tag_id) VALUES (@postId, @tagId)`,
            { postId, tagId }
          );
        }
      }

      const post = await DatabaseService.query<any>(
        'SELECT * FROM blog_posts WHERE id = @postId AND tenant_id = @tenantId',
        { postId, tenantId: req.user!.tenantId }
      );

      res.json({ success: true, data: post[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/blog/posts/:id
 * @desc Delete a blog post
 */
router.delete('/posts/:id', authenticate, authorize('admin', 'director'), async (req: AuthRequest, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);
    // blog_post_tags/blog_comments have no ON DELETE CASCADE -- deleting a post
    // that still has tags or comments would otherwise fail on the FK constraint.
    await DatabaseService.execute('DELETE FROM blog_post_tags WHERE post_id = @postId', { postId });
    await DatabaseService.execute('DELETE FROM blog_comments WHERE post_id = @postId', { postId });
    await DatabaseService.execute(
      'DELETE FROM blog_posts WHERE id = @postId AND tenant_id = @tenantId',
      { postId, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, message: 'Blog post deleted' });
  } catch (error) {
    next(error);
  }
});

// ==================== CATEGORIES ====================

/**
 * @route GET /api/v1/blog/categories
 * @desc List blog categories
 */
router.get('/categories', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const categories = await DatabaseService.query<any>(
      `SELECT bc.*, (SELECT COUNT(*) FROM blog_posts WHERE category_id = bc.id) as post_count
       FROM blog_categories bc
       WHERE bc.tenant_id = @tenantId
       ORDER BY bc.name`,
      { tenantId: req.user!.tenantId }
    );
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/blog/categories
 * @desc Create a blog category
 */
router.post(
  '/categories',
  authenticate,
  authorize('admin', 'director'),
  [body('name').notEmpty().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const slug = req.body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const existing = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM blog_categories WHERE tenant_id = @tenantId AND slug = @slug',
        { tenantId: req.user!.tenantId, slug }
      );
      if (existing.length > 0) {
        throw BadRequestError('This category already exists');
      }

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO blog_categories (tenant_id, name, slug)
             VALUES (@tenantId, @name, @slug)
             RETURNING id`
          : `INSERT INTO blog_categories (tenant_id, name, slug)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @name, @slug)`,
        { tenantId: req.user!.tenantId, name: req.body.name, slug }
      );

      const category = await DatabaseService.query<any>(
        'SELECT * FROM blog_categories WHERE id = @id',
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: category[0] });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== TAGS ====================

/**
 * @route GET /api/v1/blog/tags
 * @desc List blog tags
 */
router.get('/tags', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tags = await DatabaseService.query<any>(
      `SELECT bt.*, (SELECT COUNT(*) FROM blog_post_tags WHERE tag_id = bt.id) as post_count
       FROM blog_tags bt
       WHERE bt.tenant_id = @tenantId
       ORDER BY bt.name`,
      { tenantId: req.user!.tenantId }
    );
    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/blog/tags
 * @desc Create a blog tag
 */
router.post(
  '/tags',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [body('name').notEmpty().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const slug = req.body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const existing = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM blog_tags WHERE tenant_id = @tenantId AND slug = @slug',
        { tenantId: req.user!.tenantId, slug }
      );
      if (existing.length > 0) {
        throw BadRequestError('This tag already exists');
      }

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO blog_tags (tenant_id, name, slug)
             VALUES (@tenantId, @name, @slug)
             RETURNING id`
          : `INSERT INTO blog_tags (tenant_id, name, slug)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @name, @slug)`,
        { tenantId: req.user!.tenantId, name: req.body.name, slug }
      );

      const tag = await DatabaseService.query<any>(
        'SELECT * FROM blog_tags WHERE id = @id',
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: tag[0] });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== COMMENTS ====================

/**
 * @route GET /api/v1/blog/posts/:id/comments
 * @desc Get comments for a post
 */
router.get('/posts/:id/comments', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);

    const posts = await DatabaseService.query<{ status: string }>(
      'SELECT status FROM blog_posts WHERE id = @postId AND tenant_id = @tenantId',
      { postId, tenantId: req.user!.tenantId }
    );
    if (posts.length === 0 || (posts[0].status !== 'published' && !canManageBlog(req.user!.role))) {
      throw NotFoundError('Blog post');
    }

    const comments = await DatabaseService.query<any>(
      `SELECT bc.*, u.display_name as author_name
       FROM blog_comments bc
       LEFT JOIN users u ON bc.user_id = u.id
       WHERE bc.post_id = @postId AND bc.tenant_id = @tenantId AND bc.deleted_at IS NULL
       ORDER BY bc.created_at ASC`,
      { postId, tenantId: req.user!.tenantId }
    );

    // Build comment tree
    const commentMap = new Map<number, any>();
    const rootComments: any[] = [];

    comments.forEach((comment: any) => {
      comment.replies = [];
      commentMap.set(comment.id, comment);
    });

    comments.forEach((comment: any) => {
      if (comment.parent_id) {
        const parent = commentMap.get(comment.parent_id);
        if (parent) {
          parent.replies.push(comment);
        }
      } else {
        rootComments.push(comment);
      }
    });

    res.json({ success: true, data: rootComments });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/blog/posts/:id/comments
 * @desc Add a comment to a post
 */
router.post(
  '/posts/:id/comments',
  authenticate,
  [
    body('body').notEmpty().trim(),
    body('parentId').optional().isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const postId = parseInt(req.params.id, 10);

      const posts = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM blog_posts WHERE id = @postId AND tenant_id = @tenantId',
        { postId, tenantId: req.user!.tenantId }
      );
      if (posts.length === 0) {
        throw NotFoundError('Blog post');
      }

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO blog_comments (tenant_id, post_id, user_id, body, parent_id)
             VALUES (@tenantId, @postId, @userId, @body, @parentId)
             RETURNING id`
          : `INSERT INTO blog_comments (tenant_id, post_id, user_id, body, parent_id)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @postId, @userId, @body, @parentId)`,
        {
          tenantId: req.user!.tenantId,
          postId,
          userId: req.user!.id,
          body: req.body.body,
          parentId: req.body.parentId || null,
        }
      );

      const comment = await DatabaseService.query<any>(
        `SELECT bc.*, u.display_name as author_name
         FROM blog_comments bc
         LEFT JOIN users u ON bc.user_id = u.id
         WHERE bc.id = @id`,
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: comment[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/blog/comments/:id
 * @desc Delete a comment
 */
router.delete('/comments/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const commentId = parseInt(req.params.id, 10);

    // Check ownership or admin
    const comments = await DatabaseService.query<any>(
      'SELECT user_id FROM blog_comments WHERE id = @commentId AND tenant_id = @tenantId',
      { commentId, tenantId: req.user!.tenantId }
    );

    if (comments.length === 0) {
      throw NotFoundError('Comment');
    }

    if (comments[0].user_id !== req.user!.id && !canManageBlog(req.user!.role)) {
      throw ForbiddenError('Not authorized to delete this comment');
    }

    await DatabaseService.execute(
      `UPDATE blog_comments SET deleted_at = ${db.now()} WHERE id = @commentId AND tenant_id = @tenantId`,
      { commentId, tenantId: req.user!.tenantId }
    );

    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
