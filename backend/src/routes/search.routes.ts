import { Router } from 'express';
import { query, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError } from '../middleware/error.middleware';
import { db, IS_PG } from '../database/db-helpers';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/search
 * @desc Global search across multiple entities. Returns a flat, ranked array
 * of { id, type, title, description, url, metadata, score } so the frontend
 * can render results directly without knowing the underlying entity shape.
 */
router.get(
  '/',
  authenticate,
  [query('q').notEmpty().trim().isLength({ min: 2 })],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const searchQuery = req.query.q as string;
      const requestedTypes = ((req.query.types as string) || (req.query.type as string) || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const isAdmin = ['admin', 'director', 'manager'].includes(req.user!.role);
      const allTypes = ['course', 'lesson', 'quiz', 'blog', 'badge', 'live_session', ...(isAdmin ? ['user'] : [])];
      const types = requestedTypes.length > 0 && !requestedTypes.includes('all') ? requestedTypes : allTypes;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const tenantId = req.user!.tenantId;
      const like = `%${searchQuery}%`;
      const exact = `${searchQuery}%`;
      const startsWithQuery = (title: string) => title?.toLowerCase().startsWith(searchQuery.toLowerCase());

      const results: any[] = [];

      // Search courses
      if (types.includes('course')) {
        const courses = await DatabaseService.query<any>(
          IS_PG
            ? `SELECT id, title, description, category
               FROM courses
               WHERE tenant_id = @tenantId AND is_published = ${db.bool(true)}
                 AND (title LIKE @like OR description LIKE @like OR category LIKE @like)
               ORDER BY CASE WHEN title LIKE @exact THEN 0 ELSE 1 END, title
               LIMIT @limit`
            : `SELECT TOP (@limit) id, title, description, category
               FROM courses
               WHERE tenant_id = @tenantId AND is_published = ${db.bool(true)}
                 AND (title LIKE @like OR description LIKE @like OR category LIKE @like)
               ORDER BY CASE WHEN title LIKE @exact THEN 0 ELSE 1 END, title`,
          { tenantId, like, exact, limit }
        );
        results.push(
          ...courses.map((c) => ({
            id: c.id,
            type: 'course',
            title: c.title,
            description: c.description || c.category || '',
            url: `/courses/${c.id}`,
            metadata: { category: c.category },
            score: startsWithQuery(c.title) ? 1 : 0.75,
          }))
        );
      }

      // Search lessons
      if (types.includes('lesson')) {
        const lessons = await DatabaseService.query<any>(
          IS_PG
            ? `SELECT l.id, l.title, c.id as course_id, c.title as course_title
               FROM lessons l
               JOIN modules m ON l.module_id = m.id
               JOIN courses c ON m.course_id = c.id
               WHERE c.tenant_id = @tenantId AND c.is_published = ${db.bool(true)} AND l.title LIKE @like
               ORDER BY CASE WHEN l.title LIKE @exact THEN 0 ELSE 1 END, l.title
               LIMIT @limit`
            : `SELECT TOP (@limit) l.id, l.title, c.id as course_id, c.title as course_title
               FROM lessons l
               JOIN modules m ON l.module_id = m.id
               JOIN courses c ON m.course_id = c.id
               WHERE c.tenant_id = @tenantId AND c.is_published = ${db.bool(true)} AND l.title LIKE @like
               ORDER BY CASE WHEN l.title LIKE @exact THEN 0 ELSE 1 END, l.title`,
          { tenantId, like, exact, limit }
        );
        results.push(
          ...lessons.map((l) => ({
            id: l.id,
            type: 'lesson',
            title: l.title,
            description: l.course_title,
            url: `/courses/${l.course_id}/lessons/${l.id}`,
            metadata: { courseTitle: l.course_title },
            score: startsWithQuery(l.title) ? 0.9 : 0.65,
          }))
        );
      }

      // Search quizzes
      if (types.includes('quiz')) {
        const quizzes = await DatabaseService.query<any>(
          IS_PG
            ? `SELECT q.id, q.title, c.title as course_title
               FROM quizzes q
               JOIN lessons l ON q.lesson_id = l.id
               JOIN modules m ON l.module_id = m.id
               JOIN courses c ON m.course_id = c.id
               WHERE q.tenant_id = @tenantId AND c.is_published = ${db.bool(true)} AND q.title LIKE @like
               ORDER BY CASE WHEN q.title LIKE @exact THEN 0 ELSE 1 END, q.title
               LIMIT @limit`
            : `SELECT TOP (@limit) q.id, q.title, c.title as course_title
               FROM quizzes q
               JOIN lessons l ON q.lesson_id = l.id
               JOIN modules m ON l.module_id = m.id
               JOIN courses c ON m.course_id = c.id
               WHERE q.tenant_id = @tenantId AND c.is_published = ${db.bool(true)} AND q.title LIKE @like
               ORDER BY CASE WHEN q.title LIKE @exact THEN 0 ELSE 1 END, q.title`,
          { tenantId, like, exact, limit }
        );
        results.push(
          ...quizzes.map((q) => ({
            id: q.id,
            type: 'quiz',
            title: q.title,
            description: q.course_title,
            url: `/quizzes/${q.id}`,
            metadata: { courseTitle: q.course_title },
            score: startsWithQuery(q.title) ? 0.85 : 0.6,
          }))
        );
      }

      // Search blog posts (no per-post page yet, link to the blog list)
      if (types.includes('blog')) {
        const posts = await DatabaseService.query<any>(
          IS_PG
            ? `SELECT id, title
               FROM blog_posts
               WHERE tenant_id = @tenantId AND status = 'published'
                 AND (title LIKE @like OR body LIKE @like)
               ORDER BY CASE WHEN title LIKE @exact THEN 0 ELSE 1 END, title
               LIMIT @limit`
            : `SELECT TOP (@limit) id, title
               FROM blog_posts
               WHERE tenant_id = @tenantId AND status = 'published'
                 AND (title LIKE @like OR body LIKE @like)
               ORDER BY CASE WHEN title LIKE @exact THEN 0 ELSE 1 END, title`,
          { tenantId, like, exact, limit }
        );
        results.push(
          ...posts.map((p) => ({
            id: p.id,
            type: 'blog',
            title: p.title,
            description: '',
            url: '/blog',
            metadata: {},
            score: startsWithQuery(p.title) ? 0.8 : 0.55,
          }))
        );
      }

      // Search badges (no per-badge page yet, link to the badges list)
      if (types.includes('badge')) {
        const badges = await DatabaseService.query<any>(
          IS_PG
            ? `SELECT id, name, description
               FROM badges
               WHERE tenant_id = @tenantId AND (name LIKE @like OR description LIKE @like)
               ORDER BY name
               LIMIT @limit`
            : `SELECT TOP (@limit) id, name, description
               FROM badges
               WHERE tenant_id = @tenantId AND (name LIKE @like OR description LIKE @like)
               ORDER BY name`,
          { tenantId, like, limit }
        );
        results.push(
          ...badges.map((b) => ({
            id: b.id,
            type: 'badge',
            title: b.name,
            description: b.description || '',
            url: isAdmin ? '/admin/badges' : '/badges',
            metadata: {},
            score: 0.5,
          }))
        );
      }

      // Search live sessions (no per-session page yet, link to the sessions list)
      if (types.includes('live_session')) {
        const sessions = await DatabaseService.query<any>(
          IS_PG
            ? `SELECT id, title, status
               FROM live_sessions
               WHERE tenant_id = @tenantId AND title LIKE @like
               ORDER BY CASE WHEN title LIKE @exact THEN 0 ELSE 1 END, title
               LIMIT @limit`
            : `SELECT TOP (@limit) id, title, status
               FROM live_sessions
               WHERE tenant_id = @tenantId AND title LIKE @like
               ORDER BY CASE WHEN title LIKE @exact THEN 0 ELSE 1 END, title`,
          { tenantId, like, exact, limit }
        );
        results.push(
          ...sessions.map((s) => ({
            id: s.id,
            type: 'live_session',
            title: s.title,
            description: s.status,
            url: isAdmin ? '/admin/live-sessions' : '/live',
            metadata: { status: s.status },
            score: startsWithQuery(s.title) ? 0.8 : 0.55,
          }))
        );
      }

      // Search users (admin/director/manager only)
      if (types.includes('user') && isAdmin) {
        const users = await DatabaseService.query<any>(
          IS_PG
            ? `SELECT id, display_name, email, role
               FROM users
               WHERE tenant_id = @tenantId AND is_active = ${db.bool(true)}
                 AND (display_name LIKE @like OR email LIKE @like)
               ORDER BY CASE WHEN display_name LIKE @exact THEN 0 ELSE 1 END, display_name
               LIMIT @limit`
            : `SELECT TOP (@limit) id, display_name, email, role
               FROM users
               WHERE tenant_id = @tenantId AND is_active = ${db.bool(true)}
                 AND (display_name LIKE @like OR email LIKE @like)
               ORDER BY CASE WHEN display_name LIKE @exact THEN 0 ELSE 1 END, display_name`,
          { tenantId, like, exact, limit }
        );
        results.push(
          ...users.map((u) => ({
            id: u.id,
            type: 'user',
            title: u.display_name,
            description: u.email,
            url: '/admin/users',
            metadata: { role: u.role },
            score: startsWithQuery(u.display_name) ? 0.9 : 0.65,
          }))
        );
      }

      results.sort((a, b) => b.score - a.score);

      res.json({
        success: true,
        data: results,
        meta: {
          query: searchQuery,
          totalResults: results.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/search/courses
 * @desc Search courses with filters
 */
router.get('/courses', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const searchQuery = req.query.q as string || '';
    const category = req.query.category as string;
    const difficulty = req.query.difficulty as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy as string || 'title';
    const sortOrder = req.query.sortOrder as string || 'asc';

    let query = `SELECT c.*, u.display_name as author_name,
                        (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrollment_count
                 FROM courses c
                 LEFT JOIN users u ON c.created_by = u.id
                 WHERE c.tenant_id = @tenantId AND c.status = 'published'`;
    const params: Record<string, any> = { tenantId: req.user!.tenantId };

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
    const countQuery = query.replace(
      'SELECT c.*, u.display_name as author_name, (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrollment_count',
      'SELECT COUNT(*) as total'
    );

    const validSortFields = ['title', 'created_at', 'enrollment_count'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'title';
    const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    query += ` ORDER BY ${sortField === 'enrollment_count' ? 'enrollment_count' : `c.${sortField}`} ${order}`;
    query += ' OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';

    const [countResult, courses] = await Promise.all([
      DatabaseService.query<{ total: number }>(countQuery, params),
      DatabaseService.query<any>(`${query}`, { ...params, offset, limit }),
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
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/search/users
 * @desc Search users with filters
 */
router.get('/users', authenticate, async (req: AuthRequest, res, next) => {
  try {
    // Only managers and above can search users
    if (!['admin', 'director', 'manager'].includes(req.user!.role)) {
      res.status(403).json({ success: false, message: 'Not authorized' });
      return;
    }

    const searchQuery = req.query.q as string || '';
    const role = req.query.role as string;
    const enterpriseId = req.query.enterpriseId as string;
    const directionId = req.query.directionId as string;
    const serviceId = req.query.serviceId as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;

    let query = `SELECT u.id, u.display_name, u.email, u.role, u.is_active, u.created_at,
                        e.name as enterprise_name, d.name as direction_name, s.name as service_name
                 FROM users u
                 LEFT JOIN enterprises e ON u.enterprise_id = e.id
                 LEFT JOIN directions d ON u.direction_id = d.id
                 LEFT JOIN services s ON u.service_id = s.id
                 WHERE u.tenant_id = @tenantId`;
    const params: Record<string, any> = { tenantId: req.user!.tenantId };

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

    const countQuery = query.replace(
      `SELECT u.id, u.display_name, u.email, u.role, u.is_active, u.created_at,
                        e.name as enterprise_name, d.name as direction_name, s.name as service_name`,
      'SELECT COUNT(*) as total'
    );

    query += ' ORDER BY u.display_name OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';

    const [countResult, users] = await Promise.all([
      DatabaseService.query<{ total: number }>(countQuery, params),
      DatabaseService.query<any>(`${query}`, { ...params, offset, limit }),
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
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/search/suggestions
 * @desc Get search suggestions/autocomplete
 */
router.get('/suggestions', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const prefix = req.query.q as string || '';
    if (prefix.length < 2) {
      res.json({ success: true, data: [] });
      return;
    }

    const tenantId = req.user!.tenantId;

    // Get suggestions from courses and lessons
    const suggestions = await DatabaseService.query<any>(
      IS_PG
        ? `(SELECT title as text, 'course' as type FROM courses
            WHERE tenant_id = @tenantId AND status = 'published' AND title LIKE @prefix LIMIT 10)
           UNION
           (SELECT l.title as text, 'lesson' as type FROM lessons l
            JOIN modules m ON l.module_id = m.id
            JOIN courses c ON m.course_id = c.id
            WHERE c.tenant_id = @tenantId AND c.status = 'published' AND l.title LIKE @prefix LIMIT 10)
           UNION
           (SELECT name as text, 'badge' as type FROM badges
            WHERE tenant_id = @tenantId AND name LIKE @prefix LIMIT 5)`
        : `SELECT TOP 10 title as text, 'course' as type FROM courses
           WHERE tenant_id = @tenantId AND status = 'published' AND title LIKE @prefix
           UNION
           SELECT TOP 10 l.title as text, 'lesson' as type FROM lessons l
           JOIN modules m ON l.module_id = m.id
           JOIN courses c ON m.course_id = c.id
           WHERE c.tenant_id = @tenantId AND c.status = 'published' AND l.title LIKE @prefix
           UNION
           SELECT TOP 5 name as text, 'badge' as type FROM badges
           WHERE tenant_id = @tenantId AND name LIKE @prefix`,
      { tenantId, prefix: `${prefix}%` }
    );

    res.json({ success: true, data: suggestions });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/search/recent
 * @desc Get user's recent searches
 */
router.get('/recent', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const searches = await DatabaseService.query<any>(
      IS_PG
        ? `SELECT query, searched_at FROM search_history
           WHERE user_id = @userId
           ORDER BY searched_at DESC
           LIMIT 10`
        : `SELECT TOP 10 query, searched_at FROM search_history
           WHERE user_id = @userId
           ORDER BY searched_at DESC`,
      { userId: req.user!.id }
    );

    res.json({ success: true, data: searches });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/search/log
 * @desc Log a search query (for analytics and recent searches)
 */
router.post('/log', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { query: searchQuery, resultCount } = req.body;

    if (searchQuery && searchQuery.length >= 2) {
      await DatabaseService.execute(
        `INSERT INTO search_history (tenant_id, user_id, query, result_count)
         VALUES (@tenantId, @userId, @query, @resultCount)`,
        {
          tenantId: req.user!.tenantId,
          userId: req.user!.id,
          query: searchQuery,
          resultCount: resultCount || 0,
        }
      );
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
