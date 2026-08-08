import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// ==================== BLOG POSTS ====================

/**
 * @route GET /api/v1/blog/posts
 * @desc List blog posts
 */
router.get('/posts', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;
    const categoryId = req.query.categoryId as string;
    const tag = req.query.tag as string;
    const status = req.query.status as string;
    const search = req.query.search as string;

    let query = `SELECT bp.*, u.display_name as author_name, bc.name as category_name,
                        (SELECT COUNT(*) FROM comments WHERE post_id = bp.id AND deleted_at IS NULL) as comment_count
                 FROM blog_posts bp
                 LEFT JOIN users u ON bp.author_id = u.id
                 LEFT JOIN categories bc ON bp.category_id = bc.id
                 WHERE bp.tenant_id = @tenantId`;
    const params: Record<string, any> = { tenantId: req.user!.tenantId };

    // Non-admins only see published posts
    if (!['admin', 'director'].includes(req.user!.role)) {
      query += ' AND bp.status = @pubStatus';
      params.pubStatus = 'published';
    } else if (status) {
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
      DatabaseService.query<{ total: number }>(
        `SELECT COUNT(*) as total FROM blog_posts bp WHERE bp.tenant_id = @tenantId ${!['admin', 'director'].includes(req.user!.role) ? "AND bp.status = 'published'" : ''}`,
        { tenantId: req.user!.tenantId }
      ),
      DatabaseService.query<any>(
        `${query} ORDER BY bp.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        { ...params, offset, limit }
      ),
    ]);

    // Get tags for posts
    const postsWithTags = await Promise.all(
      posts.map(async (post: any) => {
        const tags = await DatabaseService.query<any>(
          `SELECT bt.* FROM tags bt
           JOIN post_tags bpt ON bt.id = bpt.tag_id
           WHERE bpt.post_id = @postId`,
          { postId: post.id }
        );
        return { ...post, tags };
      })
    );

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
       LEFT JOIN categories bc ON bp.category_id = bc.id
       WHERE bp.id = @postId AND bp.tenant_id = @tenantId`,
      { postId, tenantId: req.user!.tenantId }
    );

    if (posts.length === 0) {
      throw NotFoundError('Blog post');
    }

    // Get tags
    const tags = await DatabaseService.query<any>(
      `SELECT bt.* FROM tags bt
       JOIN post_tags bpt ON bt.id = bpt.tag_id
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
        `INSERT INTO blog_posts (tenant_id, title, slug, body, author_id, category_id, status, featured_image_id, published_at)
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
            `INSERT INTO post_tags (post_id, tag_id) VALUES (@postId, @tagId)`,
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
          updateFields.push('published_at = COALESCE(published_at, SYSUTCDATETIME())');
        }
      }
      if (featuredImageId !== undefined) {
        updateFields.push('featured_image_id = @featuredImageId');
        params.featuredImageId = featuredImageId || null;
      }

      if (updateFields.length > 0) {
        updateFields.push('updated_at = SYSUTCDATETIME()');
        await DatabaseService.execute(
          `UPDATE blog_posts SET ${updateFields.join(', ')} WHERE id = @postId AND tenant_id = @tenantId`,
          params
        );
      }

      // Update tags
      if (tagIds !== undefined) {
        await DatabaseService.execute('DELETE FROM post_tags WHERE post_id = @postId', { postId });
        for (const tagId of tagIds) {
          await DatabaseService.execute(
            `INSERT INTO post_tags (post_id, tag_id) VALUES (@postId, @tagId)`,
            { postId, tagId }
          );
        }
      }

      const post = await DatabaseService.query<any>(
        'SELECT * FROM blog_posts WHERE id = @postId',
        { postId }
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
       FROM categories bc
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

      const result = await DatabaseService.query<{ id: number }>(
        `INSERT INTO categories (tenant_id, name, slug)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name, @slug)`,
        { tenantId: req.user!.tenantId, name: req.body.name, slug }
      );

      const category = await DatabaseService.query<any>(
        'SELECT * FROM categories WHERE id = @id',
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
      `SELECT bt.*, (SELECT COUNT(*) FROM post_tags WHERE tag_id = bt.id) as post_count
       FROM tags bt
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

      const result = await DatabaseService.query<{ id: number }>(
        `INSERT INTO tags (tenant_id, name, slug)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name, @slug)`,
        { tenantId: req.user!.tenantId, name: req.body.name, slug }
      );

      const tag = await DatabaseService.query<any>(
        'SELECT * FROM tags WHERE id = @id',
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

    const comments = await DatabaseService.query<any>(
      `SELECT bc.*, u.display_name as author_name
       FROM comments bc
       LEFT JOIN users u ON bc.user_id = u.id
       WHERE bc.post_id = @postId AND bc.deleted_at IS NULL
       ORDER BY bc.created_at ASC`,
      { postId }
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

      const result = await DatabaseService.query<{ id: number }>(
        `INSERT INTO comments (tenant_id, post_id, user_id, body, parent_id)
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
         FROM comments bc
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
      'SELECT user_id FROM comments WHERE id = @commentId',
      { commentId }
    );

    if (comments.length === 0) {
      throw NotFoundError('Comment');
    }

    if (comments[0].user_id !== req.user!.id && !['admin', 'director'].includes(req.user!.role)) {
      throw BadRequestError('Not authorized to delete this comment');
    }

    await DatabaseService.execute(
      'UPDATE comments SET deleted_at = SYSUTCDATETIME() WHERE id = @commentId',
      { commentId }
    );

    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
