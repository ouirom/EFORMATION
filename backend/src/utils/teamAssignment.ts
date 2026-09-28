/**
 * course_assignments.assignment_type = 'team' points target_id at teams.id, but
 * team membership itself is polymorphic (team_members.member_type = user/
 * enterprise/subsidiary/direction/service, same shape as course_assignments' own target
 * types). So "does this user get a team assignment" always needs a second,
 * nested resolution against team_members -- these two helpers build that
 * EXISTS fragment consistently everywhere a course_assignments OR-chain exists
 * (course.service.ts, assignment.routes.ts, reminder.service.ts, team.service.ts),
 * instead of four copies silently drifting apart.
 */

/**
 * For a single, already-known user (bound query params) -- e.g. "can THIS
 * request's user access this course". Only references an id param when the
 * caller actually has that id (mirrors the rest of these OR-chains, which omit
 * a branch entirely for a falsy id rather than binding a possibly-undefined
 * param -- an unbound-but-referenced param crashes the query).
 */
export function teamAssignmentClause(
  caAlias: string,
  userIdParam: string,
  enterpriseIdParam?: string | null,
  directionIdParam?: string | null,
  serviceIdParam?: string | null,
  subsidiaryIdParam?: string | null
): string {
  const memberConditions = [
    `(tm.member_type = 'user' AND tm.target_id = @${userIdParam})`,
    enterpriseIdParam ? `(tm.member_type = 'enterprise' AND tm.target_id = @${enterpriseIdParam})` : '',
    subsidiaryIdParam ? `(tm.member_type = 'subsidiary' AND tm.target_id = @${subsidiaryIdParam})` : '',
    directionIdParam ? `(tm.member_type = 'direction' AND tm.target_id = @${directionIdParam})` : '',
    serviceIdParam ? `(tm.member_type = 'service' AND tm.target_id = @${serviceIdParam})` : '',
  ].filter(Boolean).join(' OR ');

  return `(${caAlias}.assignment_type = 'team' AND EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = ${caAlias}.target_id AND (${memberConditions})
  ))`;
}

/**
 * For a bulk query correlating against a users row per iteration (e.g. "which
 * of these users does this assignment affect") -- compares team_members
 * columns directly against the correlated user row's columns instead of bound
 * params, so a NULL enterprise/direction/service on that row simply never
 * matches rather than needing to be conditionally omitted.
 */
export function teamAssignmentClauseForUserRow(caAlias: string, userAlias: string): string {
  return `(${caAlias}.assignment_type = 'team' AND EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = ${caAlias}.target_id AND (
      (tm.member_type = 'user' AND tm.target_id = ${userAlias}.id)
      OR (tm.member_type = 'enterprise' AND tm.target_id = ${userAlias}.enterprise_id)
      OR (tm.member_type = 'subsidiary' AND tm.target_id = ${userAlias}.subsidiary_id)
      OR (tm.member_type = 'direction' AND tm.target_id = ${userAlias}.direction_id)
      OR (tm.member_type = 'service' AND tm.target_id = ${userAlias}.service_id)
    )
  ))`;
}
