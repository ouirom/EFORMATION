import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { DatabaseService } from '../services/database.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { db, IS_PG } from '../database/db-helpers';

const router = Router();

const MEMBER_TYPES = ['user', 'enterprise', 'direction', 'service'];

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// Every member entry resolves to zero or more users through this OR-join --
// the same "polymorphic target" pattern course_assignments uses, so a team
// stays live: adding a whole service/direction/enterprise pulls in future
// members of that unit without any resync.
const resolvedUsersJoin = (userAlias = 'u') => `
  JOIN users ${userAlias} ON (
    (tm.member_type = 'user' AND ${userAlias}.id = tm.target_id)
    OR (tm.member_type = 'enterprise' AND ${userAlias}.enterprise_id = tm.target_id)
    OR (tm.member_type = 'direction' AND ${userAlias}.direction_id = tm.target_id)
    OR (tm.member_type = 'service' AND ${userAlias}.service_id = tm.target_id)
  )
`;

const memberBodyValidators = [
  body('members').optional().isArray(),
  body('members.*.memberType').optional().isIn(MEMBER_TYPES),
  body('members.*.targetId').optional().isInt(),
];

const MEMBER_TARGET_TABLE: Record<string, string> = {
  user: 'users',
  enterprise: 'enterprises',
  direction: 'directions',
  service: 'services',
};

async function insertMembers(teamId: number, tenantId: number, members: Array<{ memberType: string; targetId: number }>) {
  for (const member of members) {
    if (!MEMBER_TYPES.includes(member.memberType) || !Number.isInteger(member.targetId)) {
      throw BadRequestError('Invalid team member entry');
    }

    // Every target must belong to the caller's own tenant, or a team could be made to
    // resolve (and leak names/emails of) users from another tenant entirely.
    const targetTable = MEMBER_TARGET_TABLE[member.memberType];
    const validTarget = await DatabaseService.query<{ id: number }>(
      `SELECT id FROM ${targetTable} WHERE id = @targetId AND tenant_id = @tenantId`,
      { targetId: member.targetId, tenantId }
    );
    if (validTarget.length === 0) {
      throw BadRequestError('One or more team members do not belong to this organization', 'INVALID_TARGET');
    }

    const existing = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM team_members WHERE team_id = @teamId AND member_type = @memberType AND target_id = @targetId',
      { teamId, memberType: member.memberType, targetId: member.targetId }
    );
    if (existing.length > 0) continue;
    await DatabaseService.execute(
      `INSERT INTO team_members (team_id, member_type, target_id) VALUES (@teamId, @memberType, @targetId)`,
      { teamId, memberType: member.memberType, targetId: member.targetId }
    );
  }
}

/** Managers only manage the teams they personally created; admin/director have full
 * tenant visibility (consistent with their broader authority elsewhere in the app). */
function scopeClauseFor(user: { role: string; id: number }, tableAlias = ''): { clause: string; params: Record<string, any> } {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  if (user.role === 'manager') {
    return { clause: ` AND ${prefix}created_by = @requesterId`, params: { requesterId: user.id } };
  }
  return { clause: '', params: {} };
}

/**
 * @route GET /api/v1/teams
 * @desc List teams for the tenant, with raw + resolved member counts
 */
router.get('/', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const scope = scopeClauseFor(req.user!, 't');
    const teams = await DatabaseService.query<any>(
      `SELECT t.*, u.display_name as created_by_name,
              (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_entry_count,
              (SELECT COUNT(DISTINCT u2.id) FROM team_members tm ${resolvedUsersJoin('u2')} WHERE tm.team_id = t.id) as resolved_user_count
       FROM teams t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.tenant_id = @tenantId ${scope.clause}
       ORDER BY t.created_at DESC`,
      { tenantId, ...scope.params }
    );

    res.json({
      success: true,
      data: teams.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        createdBy: t.created_by,
        createdByName: t.created_by_name,
        memberEntryCount: t.member_entry_count,
        resolvedUserCount: t.resolved_user_count,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/teams/:id
 * @desc Team detail: raw member entries (with resolved names) + distinct resolved users
 */
router.get('/:id', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const tenantId = req.user!.tenantId;
    const scope = scopeClauseFor(req.user!);

    const teams = await DatabaseService.query<any>(
      `SELECT * FROM teams WHERE id = @id AND tenant_id = @tenantId${scope.clause}`,
      { id, tenantId, ...scope.params }
    );
    if (teams.length === 0) throw NotFoundError('Team');

    const members = await DatabaseService.query<any>(
      `SELECT tm.id, tm.member_type, tm.target_id,
              CASE
                WHEN tm.member_type = 'user' THEN (SELECT display_name FROM users WHERE id = tm.target_id)
                WHEN tm.member_type = 'enterprise' THEN (SELECT name FROM enterprises WHERE id = tm.target_id)
                WHEN tm.member_type = 'direction' THEN (SELECT name FROM directions WHERE id = tm.target_id)
                WHEN tm.member_type = 'service' THEN (SELECT name FROM services WHERE id = tm.target_id)
                ELSE NULL
              END as target_name
       FROM team_members tm
       WHERE tm.team_id = @id
       ORDER BY tm.member_type, target_name`,
      { id }
    );

    const resolvedUsers = await DatabaseService.query<any>(
      `SELECT DISTINCT u.id, u.display_name, u.email
       FROM team_members tm
       ${resolvedUsersJoin()}
       WHERE tm.team_id = @id
       ORDER BY u.display_name`,
      { id }
    );

    res.json({
      success: true,
      data: {
        id: teams[0].id,
        name: teams[0].name,
        description: teams[0].description,
        createdAt: teams[0].created_at,
        updatedAt: teams[0].updated_at,
        members: members.map((m: any) => ({
          id: m.id,
          memberType: m.member_type,
          targetId: m.target_id,
          targetName: m.target_name,
        })),
        resolvedUsers: resolvedUsers.map((u: any) => ({
          id: u.id,
          displayName: u.display_name,
          email: u.email,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/teams
 * @desc Create a team with an initial mixed-type member selection
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [body('name').notEmpty().trim(), body('description').optional({ nullable: true }).trim(), ...memberBodyValidators],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO teams (tenant_id, name, description, created_by)
             VALUES (@tenantId, @name, @description, @createdBy)
             RETURNING id`
          : `INSERT INTO teams (tenant_id, name, description, created_by)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @name, @description, @createdBy)`,
        {
          tenantId,
          name: req.body.name,
          description: req.body.description || null,
          createdBy: req.user!.id,
        }
      );

      const teamId = result[0].id;
      if (Array.isArray(req.body.members) && req.body.members.length > 0) {
        await insertMembers(teamId, tenantId, req.body.members);
      }

      const team = await DatabaseService.query<any>('SELECT * FROM teams WHERE id = @id', { id: teamId });
      res.status(201).json({ success: true, data: team[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/teams/:id
 * @desc Update name/description; if `members` is provided, fully replace the member set
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [body('name').optional().trim(), body('description').optional({ nullable: true }).trim(), ...memberBodyValidators],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const id = parseInt(req.params.id, 10);
      const tenantId = req.user!.tenantId;
      const scope = scopeClauseFor(req.user!);

      const existing = await DatabaseService.query<{ id: number }>(
        `SELECT id FROM teams WHERE id = @id AND tenant_id = @tenantId${scope.clause}`,
        { id, tenantId, ...scope.params }
      );
      if (existing.length === 0) throw NotFoundError('Team');

      const updateFields: string[] = [];
      const params: Record<string, any> = { id, tenantId };
      if (req.body.name !== undefined) { updateFields.push('name = @name'); params.name = req.body.name; }
      if (req.body.description !== undefined) { updateFields.push('description = @description'); params.description = req.body.description; }

      if (updateFields.length > 0) {
        await DatabaseService.execute(
          `UPDATE teams SET ${updateFields.join(', ')}, updated_at = ${db.now()} WHERE id = @id AND tenant_id = @tenantId`,
          params
        );
      }

      if (Array.isArray(req.body.members)) {
        await DatabaseService.execute('DELETE FROM team_members WHERE team_id = @id', { id });
        if (req.body.members.length > 0) {
          await insertMembers(id, tenantId, req.body.members);
        }
      }

      const team = await DatabaseService.query<any>('SELECT * FROM teams WHERE id = @id', { id });
      res.json({ success: true, data: team[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/teams/:id
 */
router.delete('/:id', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const tenantId = req.user!.tenantId;
    const scope = scopeClauseFor(req.user!);

    const existing = await DatabaseService.query<{ id: number }>(
      `SELECT id FROM teams WHERE id = @id AND tenant_id = @tenantId${scope.clause}`,
      { id, tenantId, ...scope.params }
    );
    if (existing.length === 0) throw NotFoundError('Team');

    await DatabaseService.execute('DELETE FROM team_members WHERE team_id = @id', { id });
    await DatabaseService.execute('DELETE FROM teams WHERE id = @id AND tenant_id = @tenantId', { id, tenantId });

    res.json({ success: true, message: 'Team deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
