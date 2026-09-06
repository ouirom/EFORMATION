import { DatabaseService } from './database.service';
import { db } from '../database/db-helpers';
import { ROLE_HIERARCHY } from '../middleware/auth.middleware';
import { teamAssignmentClauseForUserRow } from '../utils/teamAssignment';

export interface TeamMember {
  id: number;
  displayName: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  enrolledCount: number;
  completedCount: number;
  avgProgress: number;
  lastActivity: string | null;
  overdueCount: number;
}

interface Requester {
  tenantId: number;
  id: number;
  role: string;
  directionId?: number;
  serviceId?: number;
}

export class TeamService {
  /**
   * The users hierarchically attached to `requester`, scoped by their role:
   * director -> subordinates (manager/supervisor/agent) in their direction,
   * manager -> subordinates (supervisor/agent) in their service, supervisor ->
   * only the agents explicitly assigned to them via `users.supervisor_id`
   * (a direct-report relationship, independent of service membership — two
   * supervisors in the same service can each own a different set of agents).
   * Peers and superiors within the same org unit are never included — a
   * director's team excludes other directors, a manager's excludes other
   * managers, etc. admin/super_admin see the whole tenant. Shared by
   * GET /analytics/my-team and the team-report cron job so both read the
   * exact same scoping + activity data.
   */
  static async getTeamActivity(requester: Requester): Promise<TeamMember[]> {
    const { tenantId, id: requesterId, role, directionId, serviceId } = requester;

    let scopeClause = '1 = 0'; // no scope resolved -> no results, rather than leaking the whole tenant
    const params: Record<string, any> = { tenantId, requesterId };
    const roleLevelSql = `CASE u.role
      WHEN 'super_admin' THEN 6 WHEN 'admin' THEN 5 WHEN 'director' THEN 4
      WHEN 'manager' THEN 3 WHEN 'supervisor' THEN 2
      WHEN 'agent' THEN 1 WHEN 'externe' THEN 1 WHEN 'stagiaire' THEN 1 ELSE 0 END`;

    if (role === 'admin' || role === 'super_admin') {
      scopeClause = 'u.id <> @requesterId';
    } else if (role === 'director' && directionId) {
      scopeClause = `u.direction_id = @directionId AND (${roleLevelSql}) < @requesterLevel`;
      params.directionId = directionId;
      params.requesterLevel = ROLE_HIERARCHY[role];
    } else if (role === 'manager' && serviceId) {
      scopeClause = `u.service_id = @serviceId AND (${roleLevelSql}) < @requesterLevel`;
      params.serviceId = serviceId;
      params.requesterLevel = ROLE_HIERARCHY[role];
    } else if (role === 'supervisor') {
      scopeClause = 'u.supervisor_id = @requesterId';
    }

    const team = await DatabaseService.query<any>(
      `SELECT u.id, u.display_name, u.email, u.role, u.avatar_url,
              e.enrolled_count, e.completed_count, e.avg_progress,
              lp.last_activity,
              COALESCE(overdue.overdue_count, 0) as overdue_count
       FROM users u
       LEFT JOIN (
         SELECT user_id, COUNT(*) as enrolled_count,
                SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed_count,
                AVG(COALESCE(progress_percent, 0)) as avg_progress
         FROM enrollments GROUP BY user_id
       ) e ON e.user_id = u.id
       LEFT JOIN (
         SELECT user_id, MAX(last_accessed_at) as last_activity
         FROM lesson_progress GROUP BY user_id
       ) lp ON lp.user_id = u.id
       LEFT JOIN (
         SELECT u2.id as user_id, COUNT(*) as overdue_count
         FROM course_assignments ca
         JOIN users u2 ON (
           (ca.assignment_type = 'user' AND u2.id = ca.target_id)
           OR (ca.assignment_type = 'enterprise' AND u2.enterprise_id = ca.target_id)
           OR (ca.assignment_type = 'direction' AND u2.direction_id = ca.target_id)
           OR (ca.assignment_type = 'service' AND u2.service_id = ca.target_id)
           OR (ca.assignment_type = 'role' AND u2.role = ca.target_role)
           OR ${teamAssignmentClauseForUserRow('ca', 'u2')}
         )
         LEFT JOIN enrollments en ON en.course_id = ca.course_id AND en.user_id = u2.id
         WHERE ca.tenant_id = @tenantId AND ca.is_mandatory = ${db.bool(true)} AND ca.due_date < ${db.now()}
           AND (en.completed_at IS NULL AND (en.progress_percent IS NULL OR en.progress_percent < 100))
         GROUP BY u2.id
       ) overdue ON overdue.user_id = u.id
       WHERE u.tenant_id = @tenantId AND u.deleted_at IS NULL AND u.is_active = ${db.bool(true)} AND ${scopeClause}
       ORDER BY u.display_name`,
      params
    );

    return team.map((m: any) => ({
      id: m.id,
      displayName: m.display_name,
      email: m.email,
      role: m.role,
      avatarUrl: m.avatar_url,
      enrolledCount: m.enrolled_count || 0,
      completedCount: m.completed_count || 0,
      avgProgress: Math.round(m.avg_progress || 0),
      lastActivity: m.last_activity,
      overdueCount: m.overdue_count,
    }));
  }
}
