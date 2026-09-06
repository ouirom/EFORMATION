import { teamAssignmentClause, teamAssignmentClauseForUserRow } from './teamAssignment';

describe('teamAssignmentClause', () => {
  it('always includes the user-membership branch', () => {
    const clause = teamAssignmentClause('ca', 'userId');
    expect(clause).toContain("ca.assignment_type = 'team'");
    expect(clause).toContain('tm.team_id = ca.target_id');
    expect(clause).toContain("(tm.member_type = 'user' AND tm.target_id = @userId)");
  });

  it('omits an org-unit branch when its param name is not provided, to avoid an unbound param reference', () => {
    const clause = teamAssignmentClause('ca', 'userId', null, null, null);
    expect(clause).not.toContain('enterprise');
    expect(clause).not.toContain('direction');
    expect(clause).not.toContain('service');
  });

  it('includes every org-unit branch when all param names are provided', () => {
    const clause = teamAssignmentClause('ca', 'userId', 'userEnterpriseId', 'userDirectionId', 'userServiceId');
    expect(clause).toContain("(tm.member_type = 'enterprise' AND tm.target_id = @userEnterpriseId)");
    expect(clause).toContain("(tm.member_type = 'direction' AND tm.target_id = @userDirectionId)");
    expect(clause).toContain("(tm.member_type = 'service' AND tm.target_id = @userServiceId)");
  });
});

describe('teamAssignmentClauseForUserRow', () => {
  it('correlates against the given user row alias for every member type', () => {
    const clause = teamAssignmentClauseForUserRow('ca', 'u2');
    expect(clause).toContain("(tm.member_type = 'user' AND tm.target_id = u2.id)");
    expect(clause).toContain("(tm.member_type = 'enterprise' AND tm.target_id = u2.enterprise_id)");
    expect(clause).toContain("(tm.member_type = 'direction' AND tm.target_id = u2.direction_id)");
    expect(clause).toContain("(tm.member_type = 'service' AND tm.target_id = u2.service_id)");
    expect(clause).toContain('tm.team_id = ca.target_id');
  });
});
