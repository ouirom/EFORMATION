import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db, IS_PG } from '../database/db-helpers';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/badges
 * @desc List all badges
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const badges = await DatabaseService.query<any>(
      `SELECT b.*, f.storage_key as icon_url,
              (SELECT COUNT(*) FROM user_badges WHERE badge_id = b.id) as awarded_count
       FROM badges b
       LEFT JOIN file_assets f ON b.icon_file_id = f.id
       WHERE b.tenant_id = @tenantId
       ORDER BY b.name`,
      { tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: badges });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/badges/:id
 * @desc Get badge by ID
 */
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const badgeId = parseInt(req.params.id, 10);

    const badges = await DatabaseService.query<any>(
      `SELECT b.*, f.storage_key as icon_url
       FROM badges b
       LEFT JOIN file_assets f ON b.icon_file_id = f.id
       WHERE b.id = @badgeId AND b.tenant_id = @tenantId`,
      { badgeId, tenantId: req.user!.tenantId }
    );

    if (badges.length === 0) {
      throw NotFoundError('Badge');
    }

    // Get recent awardees
    const awardees = await DatabaseService.query<any>(
      IS_PG
        ? `SELECT ub.awarded_at, u.display_name, u.email
           FROM user_badges ub
           JOIN users u ON ub.user_id = u.id
           WHERE ub.badge_id = @badgeId
           ORDER BY ub.awarded_at DESC
           LIMIT 10`
        : `SELECT TOP 10 ub.awarded_at, u.display_name, u.email
           FROM user_badges ub
           JOIN users u ON ub.user_id = u.id
           WHERE ub.badge_id = @badgeId
           ORDER BY ub.awarded_at DESC`,
      { badgeId }
    );

    res.json({
      success: true,
      data: {
        ...badges[0],
        recentAwardees: awardees,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/badges
 * @desc Create a new badge
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director'),
  [
    body('code').notEmpty().trim(),
    body('name').notEmpty().trim(),
    body('description').optional().trim(),
    body('iconFileId').optional().isInt(),
    body('criteria').isObject(),
    body('badgeType').optional().trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO badges (tenant_id, code, name, description, icon_file_id, criteria, badge_type)
             VALUES (@tenantId, @code, @name, @description, @iconFileId, @criteria, @badgeType)
             RETURNING id`
          : `INSERT INTO badges (tenant_id, code, name, description, icon_file_id, criteria, badge_type)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @code, @name, @description, @iconFileId, @criteria, @badgeType)`,
        {
          tenantId: req.user!.tenantId,
          code: req.body.code,
          name: req.body.name,
          description: req.body.description || null,
          iconFileId: req.body.iconFileId || null,
          criteria: JSON.stringify(req.body.criteria),
          badgeType: req.body.badgeType || null,
        }
      );

      const badge = await DatabaseService.query<any>(
        'SELECT * FROM badges WHERE id = @id',
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: badge[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/badges/:id
 * @desc Update badge
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'director'),
  [
    body('name').optional().trim(),
    body('description').optional().trim(),
    body('iconFileId').optional().isInt(),
    body('criteria').optional().isObject(),
    body('badgeType').optional().trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const badgeId = parseInt(req.params.id, 10);

      const updateFields: string[] = [];
      const params: Record<string, any> = { badgeId, tenantId: req.user!.tenantId };

      if (req.body.name) {
        updateFields.push('name = @name');
        params.name = req.body.name;
      }
      if (req.body.description !== undefined) {
        updateFields.push('description = @description');
        params.description = req.body.description;
      }
      if (req.body.iconFileId !== undefined) {
        updateFields.push('icon_file_id = @iconFileId');
        params.iconFileId = req.body.iconFileId;
      }
      if (req.body.criteria) {
        updateFields.push('criteria = @criteria');
        params.criteria = JSON.stringify(req.body.criteria);
      }
      if (req.body.badgeType !== undefined) {
        updateFields.push('badge_type = @badgeType');
        params.badgeType = req.body.badgeType || null;
      }

      if (updateFields.length > 0) {
        await DatabaseService.execute(
          `UPDATE badges SET ${updateFields.join(', ')} WHERE id = @badgeId AND tenant_id = @tenantId`,
          params
        );
      }

      const badge = await DatabaseService.query<any>(
        'SELECT * FROM badges WHERE id = @badgeId AND tenant_id = @tenantId',
        { badgeId, tenantId: req.user!.tenantId }
      );

      res.json({ success: true, data: badge[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/badges/:id
 * @desc Delete badge
 */
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const badgeId = parseInt(req.params.id, 10);
    await DatabaseService.execute(
      'DELETE FROM badges WHERE id = @badgeId AND tenant_id = @tenantId',
      { badgeId, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, message: 'Badge deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/badges/:id/award
 * @desc Manually award badge to user
 */
router.post(
  '/:id/award',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [body('userId').isInt()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const badgeId = parseInt(req.params.id, 10);
      const userId = req.body.userId;

      // Check if already awarded
      const existing = await DatabaseService.query<any>(
        'SELECT id FROM user_badges WHERE user_id = @userId AND badge_id = @badgeId',
        { userId, badgeId }
      );

      if (existing.length > 0) {
        throw BadRequestError('User already has this badge');
      }

      await DatabaseService.execute(
        `INSERT INTO user_badges (tenant_id, user_id, badge_id)
         VALUES (@tenantId, @userId, @badgeId)`,
        { tenantId: req.user!.tenantId, userId, badgeId }
      );

      res.json({ success: true, message: 'Badge awarded successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/badges/:id/revoke/:userId
 * @desc Revoke badge from user
 */
router.delete(
  '/:id/revoke/:userId',
  authenticate,
  authorize('admin'),
  async (req: AuthRequest, res, next) => {
    try {
      const badgeId = parseInt(req.params.id, 10);
      const userId = parseInt(req.params.userId, 10);

      await DatabaseService.execute(
        'DELETE FROM user_badges WHERE user_id = @userId AND badge_id = @badgeId AND tenant_id = @tenantId',
        { userId, badgeId, tenantId: req.user!.tenantId }
      );

      res.json({ success: true, message: 'Badge revoked' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/badges/stats/leaderboard
 * @desc Get badge leaderboard
 */
router.get('/stats/leaderboard', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const leaderboard = await DatabaseService.query<any>(
      IS_PG
        ? `SELECT u.id, u.display_name, u.email,
                  COUNT(ub.badge_id) as badge_count,
                  (SELECT COUNT(*) FROM certificates WHERE user_id = u.id) as certificate_count
           FROM users u
           LEFT JOIN user_badges ub ON u.id = ub.user_id
           WHERE u.tenant_id = @tenantId AND u.deleted_at IS NULL
           GROUP BY u.id, u.display_name, u.email
           ORDER BY badge_count DESC, certificate_count DESC
           LIMIT 50`
        : `SELECT TOP 50 u.id, u.display_name, u.email,
                  COUNT(ub.badge_id) as badge_count,
                  (SELECT COUNT(*) FROM certificates WHERE user_id = u.id) as certificate_count
           FROM users u
           LEFT JOIN user_badges ub ON u.id = ub.user_id
           WHERE u.tenant_id = @tenantId AND u.deleted_at IS NULL
           GROUP BY u.id, u.display_name, u.email
           ORDER BY badge_count DESC, certificate_count DESC`,
      { tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: leaderboard });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/badges/my-badges
 * @desc Get current user's badges
 */
router.get('/my-badges', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const badges = await DatabaseService.query<any>(
      `SELECT ub.*, b.code, b.name, b.description, b.badge_type, b.criteria,
              q.title as quiz_title, c.title as course_title
       FROM user_badges ub
       JOIN badges b ON ub.badge_id = b.id
       LEFT JOIN quizzes q ON ub.quiz_id = q.id
       LEFT JOIN courses c ON ub.course_id = c.id
       WHERE ub.user_id = @userId AND ub.tenant_id = @tenantId
       ORDER BY ub.awarded_at DESC`,
      { userId: req.user!.id, tenantId: req.user!.tenantId }
    );

    // Count by type
    const stats = {
      total: badges.length,
      trophies: badges.filter((b: any) => b.badge_type === 'trophy').length,
      quizBadges: badges.filter((b: any) => b.badge_type === 'quiz_completion' || b.badge_type === 'perfect_score').length,
      courseBadges: badges.filter((b: any) => b.badge_type === 'course_start' || b.badge_type === 'course_completion').length,
    };

    res.json({ success: true, data: { badges, stats } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/badges/award-quiz
 * @desc Award badges for quiz completion (called after quiz submission)
 */
router.post('/award-quiz', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { quizId, score, passed } = req.body;
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;
    
    const awardedBadges: any[] = [];

    // 1. Badge "Quiz Réussi" si passé
    if (passed) {
      const quizCompletedBadge = await DatabaseService.query<any>(
        `SELECT id FROM badges WHERE code = 'QUIZ_COMPLETED' AND tenant_id = @tenantId`,
        { tenantId }
      );
      
      if (quizCompletedBadge.length > 0) {
        // Check if not already awarded for this quiz
        const existing = await DatabaseService.query<any>(
          `SELECT id FROM user_badges WHERE user_id = @userId AND badge_id = @badgeId AND quiz_id = @quizId`,
          { userId, badgeId: quizCompletedBadge[0].id, quizId }
        );
        
        if (existing.length === 0) {
          await DatabaseService.execute(
            `INSERT INTO user_badges (tenant_id, user_id, badge_id, quiz_id, score, awarded_at)
             VALUES (@tenantId, @userId, @badgeId, @quizId, @score, ${db.now()})`,
            { tenantId, userId, badgeId: quizCompletedBadge[0].id, quizId, score }
          );
          awardedBadges.push({ code: 'QUIZ_COMPLETED', name: 'Quiz Réussi', type: 'badge' });
        }
      }
    }

    // 2. Badge/Trophée "Score Parfait" si 100%
    if (score === 100) {
      const perfectScoreBadge = await DatabaseService.query<any>(
        `SELECT id FROM badges WHERE code = 'PERFECT_SCORE' AND tenant_id = @tenantId`,
        { tenantId }
      );
      
      if (perfectScoreBadge.length > 0) {
        const existing = await DatabaseService.query<any>(
          `SELECT id FROM user_badges WHERE user_id = @userId AND badge_id = @badgeId AND quiz_id = @quizId`,
          { userId, badgeId: perfectScoreBadge[0].id, quizId }
        );
        
        if (existing.length === 0) {
          await DatabaseService.execute(
            `INSERT INTO user_badges (tenant_id, user_id, badge_id, quiz_id, score, awarded_at)
             VALUES (@tenantId, @userId, @badgeId, @quizId, @score, ${db.now()})`,
            { tenantId, userId, badgeId: perfectScoreBadge[0].id, quizId, score }
          );
          awardedBadges.push({ code: 'PERFECT_SCORE', name: 'Score Parfait', type: 'badge' });
        }
      }

      // 3. Trophée Or pour 100%
      const trophyGold = await DatabaseService.query<any>(
        `SELECT id FROM badges WHERE code = 'TROPHY_GOLD' AND tenant_id = @tenantId`,
        { tenantId }
      );
      
      if (trophyGold.length > 0) {
        const existing = await DatabaseService.query<any>(
          `SELECT id FROM user_badges WHERE user_id = @userId AND badge_id = @badgeId AND quiz_id = @quizId`,
          { userId, badgeId: trophyGold[0].id, quizId }
        );
        
        if (existing.length === 0) {
          await DatabaseService.execute(
            `INSERT INTO user_badges (tenant_id, user_id, badge_id, quiz_id, score, awarded_at)
             VALUES (@tenantId, @userId, @badgeId, @quizId, @score, ${db.now()})`,
            { tenantId, userId, badgeId: trophyGold[0].id, quizId, score }
          );
          awardedBadges.push({ code: 'TROPHY_GOLD', name: 'Trophée Or 🏆', type: 'trophy' });
        }
      }
    }

    res.json({ 
      success: true, 
      data: { 
        awardedBadges,
        message: awardedBadges.length > 0 
          ? `Félicitations ! Vous avez obtenu ${awardedBadges.length} récompense(s) !`
          : null
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/badges/award-course
 * @desc Award badges for course progress (start/complete)
 */
router.post('/award-course', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { courseId, action } = req.body; // action: 'start' or 'complete'
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;
    
    const awardedBadges: any[] = [];

    if (action === 'start') {
      const badge = await DatabaseService.query<any>(
        `SELECT id FROM badges WHERE code = 'COURSE_STARTED' AND tenant_id = @tenantId`,
        { tenantId }
      );
      
      if (badge.length > 0) {
        const existing = await DatabaseService.query<any>(
          `SELECT id FROM user_badges WHERE user_id = @userId AND badge_id = @badgeId AND course_id = @courseId`,
          { userId, badgeId: badge[0].id, courseId }
        );
        
        if (existing.length === 0) {
          await DatabaseService.execute(
            `INSERT INTO user_badges (tenant_id, user_id, badge_id, course_id, awarded_at)
             VALUES (@tenantId, @userId, @badgeId, @courseId, ${db.now()})`,
            { tenantId, userId, badgeId: badge[0].id, courseId }
          );
          awardedBadges.push({ code: 'COURSE_STARTED', name: 'Explorateur', type: 'badge' });
        }
      }
    }

    if (action === 'complete') {
      const badge = await DatabaseService.query<any>(
        `SELECT id FROM badges WHERE code = 'COURSE_COMPLETED' AND tenant_id = @tenantId`,
        { tenantId }
      );
      
      if (badge.length > 0) {
        const existing = await DatabaseService.query<any>(
          `SELECT id FROM user_badges WHERE user_id = @userId AND badge_id = @badgeId AND course_id = @courseId`,
          { userId, badgeId: badge[0].id, courseId }
        );
        
        if (existing.length === 0) {
          await DatabaseService.execute(
            `INSERT INTO user_badges (tenant_id, user_id, badge_id, course_id, awarded_at)
             VALUES (@tenantId, @userId, @badgeId, @courseId, ${db.now()})`,
            { tenantId, userId, badgeId: badge[0].id, courseId }
          );
          awardedBadges.push({ code: 'COURSE_COMPLETED', name: 'Diplômé', type: 'badge' });
        }
      }
    }

    res.json({ 
      success: true, 
      data: { 
        awardedBadges,
        message: awardedBadges.length > 0 
          ? `Nouveau badge obtenu !`
          : null
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
