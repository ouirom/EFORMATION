import { ROLE_HIERARCHY } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { ForbiddenError, NotFoundError } from '../middleware/error.middleware';

export interface HierarchyRequester {
  id: number;
  tenantId?: number;
  role: string;
  directionId?: number;
  serviceId?: number;
}

export interface HierarchyTarget {
  role: string;
  direction_id: number | null;
  service_id: number | null;
  supervisor_id: number | null;
}

/**
 * Whether `requester` may view/manage `target` per the org hierarchy: target's
 * role level must be strictly below requester's, AND target must fall within
 * requester's own scope — a director's whole direction, a manager's whole
 * service, or a supervisor's explicitly assigned direct reports (supervisor_id).
 * Does not special-case admin/super_admin — callers check that separately since
 * not every caller wants the "admins see everyone" bypass.
 */
export function isInHierarchicalScope(requester: HierarchyRequester, target: HierarchyTarget): boolean {
  const requesterLevel = ROLE_HIERARCHY[requester.role] || 0;
  const targetLevel = ROLE_HIERARCHY[target.role] || 0;
  if (targetLevel >= requesterLevel) return false;

  if (requester.role === 'director' && requester.directionId && target.direction_id === requester.directionId) return true;
  if (requester.role === 'manager' && requester.serviceId && target.service_id === requester.serviceId) return true;
  if (requester.role === 'supervisor' && target.supervisor_id === requester.id) return true;
  return false;
}

/**
 * Resolves a user id taken from a URL ('me' or a numeric id) for per-user data
 * (badges, certificates, progress, quiz attempts) and applies the same visibility
 * rule as GET /users/:id: self, admins/super_admins, or a strict subordinate in
 * scope. Unknown or non-numeric ids are a 404; out-of-scope ones a 403.
 */
export async function resolveViewableUserId(
  requester: HierarchyRequester & { tenantId: number },
  rawId: string
): Promise<number> {
  if (rawId === 'me') return requester.id;

  const userId = parseInt(rawId, 10);
  if (Number.isNaN(userId)) throw NotFoundError('User');
  if (userId === requester.id || requester.role === 'admin' || requester.role === 'super_admin') {
    return userId;
  }

  const targets = await DatabaseService.query<HierarchyTarget>(
    `SELECT role, direction_id, service_id, supervisor_id FROM users
     WHERE id = @userId AND tenant_id = @tenantId AND deleted_at IS NULL`,
    { userId, tenantId: requester.tenantId }
  );
  if (targets.length === 0) throw NotFoundError('User');
  if (!isInHierarchicalScope(requester, targets[0])) {
    throw ForbiddenError('Insufficient permissions to view this user');
  }
  return userId;
}
