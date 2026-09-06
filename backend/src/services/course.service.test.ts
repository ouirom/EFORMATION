import { CourseService } from './course.service';
import { DatabaseService } from './database.service';

jest.mock('./database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function mockListResponses() {
  mockedQuery.mockImplementation((query: string) => {
    if (query.includes('SELECT COUNT(*) as total FROM courses')) return Promise.resolve([{ total: 1 }]);
    if (query.includes('SELECT c.*, u.display_name as creator_name')) {
      return Promise.resolve([
        { id: 1, tenant_id: 10, title: 'Draft Course', description: null, category: null, level: 'beginner', duration: null, audience_scope: null, prerequisites: null, is_published: false, created_by: 2, created_at: '2026-01-01', updated_at: '2026-01-01', creator_name: 'Director Demo', module_count: 0, avg_rating: null, enrolled_count: 0 },
      ]);
    }
    return Promise.resolve([]);
  });
}

describe('CourseService.findAll role-based visibility', () => {
  const pagination = { page: 1, limit: 20 };
  const filters = {};

  it('does not apply the published/audience-scope filter for admin', async () => {
    mockListResponses();
    await CourseService.findAll(10, pagination, filters, 1, 'admin', undefined, undefined, undefined);
    const countCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT COUNT(*) as total'));
    expect(countCall[0]).not.toContain('is_published');
  });

  it('does not apply the published/audience-scope filter for director (course management role)', async () => {
    mockListResponses();
    await CourseService.findAll(10, pagination, filters, 2, 'director', undefined, 5, undefined);
    const countCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT COUNT(*) as total'));
    expect(countCall[0]).not.toContain('is_published');
  });

  it('does not apply the published/audience-scope filter for manager (course management role)', async () => {
    mockListResponses();
    await CourseService.findAll(10, pagination, filters, 3, 'manager', undefined, undefined, 7);
    const countCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT COUNT(*) as total'));
    expect(countCall[0]).not.toContain('is_published');
  });

  it('does not apply the published/audience-scope filter for super_admin, ranked above manager in ROLE_HIERARCHY', async () => {
    mockListResponses();
    await CourseService.findAll(10, pagination, filters, 6, 'super_admin', undefined, undefined, undefined);
    const countCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT COUNT(*) as total'));
    expect(countCall[0]).not.toContain('is_published');
  });

  it('applies the published/audience-scope filter for a learner role (supervisor)', async () => {
    mockListResponses();
    await CourseService.findAll(10, pagination, filters, 4, 'supervisor', undefined, undefined, undefined);
    const countCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT COUNT(*) as total'));
    expect(countCall[0]).toContain('is_published');
  });

  it('applies the published/audience-scope filter for a learner role (agent)', async () => {
    mockListResponses();
    await CourseService.findAll(10, pagination, filters, 5, 'agent', undefined, undefined, undefined);
    const countCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT COUNT(*) as total'));
    expect(countCall[0]).toContain('is_published');
  });

  it("treats 'general' the same as a NULL audience_scope for a learner", async () => {
    mockListResponses();
    await CourseService.findAll(10, pagination, filters, 5, 'agent', 1, undefined, undefined);
    const countCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT COUNT(*) as total'));
    expect(countCall[0]).toContain('audience_scope IS NULL');
    expect(countCall[0]).toContain("= 'general'");
  });

  it("scopes the 'enterprise' level to the caller's own enterpriseId", async () => {
    mockListResponses();
    await CourseService.findAll(10, pagination, filters, 5, 'agent', 9, undefined, undefined);
    const countCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT COUNT(*) as total'));
    expect(countCall[0]).toMatch(/= 'enterprise' AND [^)]*userEnterpriseId/);
    expect(countCall[1].userEnterpriseId).toBe(9);
  });
});

describe('CourseService.canAccessCourse', () => {
  const learner = { id: 5, role: 'agent', enterpriseId: 1, directionId: 2, serviceId: 3 };

  // canAccessCourse now runs a single query with the audience-scope/enrollment/assignment
  // conditions combined via OR/EXISTS (see accessibleCoursesCondition), evaluated by the
  // database itself -- a mocked DatabaseService can only stand in for "did a matching row
  // come back", not exercise which specific OR branch matched. That combined SQL logic is
  // covered by live-DB verification instead; these tests check the query is shaped
  // correctly per role and that the boolean result follows the row count.

  it('allows a course management role via an unconditional query, without audience/enrollment/assignment checks', async () => {
    mockedQuery.mockResolvedValue([{ id: 1 }]);
    const allowed = await CourseService.canAccessCourse(10, 1, { id: 2, role: 'director' });
    expect(allowed).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    const [query] = mockedQuery.mock.calls[0];
    expect(query).toContain('1=1');
    expect(query).not.toContain('audience_scope');
  });

  it('denies a management-role lookup for a course outside the tenant', async () => {
    mockedQuery.mockResolvedValue([]);
    const allowed = await CourseService.canAccessCourse(10, 999, { id: 2, role: 'admin' });
    expect(allowed).toBe(false);
  });

  it('checks audience_scope, enrollments, and course_assignments for a learner role', async () => {
    mockedQuery.mockResolvedValue([{ id: 1 }]);
    const allowed = await CourseService.canAccessCourse(10, 1, learner);
    expect(allowed).toBe(true);
    const [query, params] = mockedQuery.mock.calls[0];
    expect(query).toContain('audience_scope');
    expect(query).toContain('FROM enrollments');
    expect(query).toContain('FROM course_assignments');
    expect(params).toMatchObject({ userId: 5, userDirectionId: 2, userServiceId: 3, userRole: 'agent' });
  });

  it('denies a learner when no row matches (no audience scope, enrollment, or assignment)', async () => {
    mockedQuery.mockResolvedValue([]);
    const allowed = await CourseService.canAccessCourse(10, 1, learner);
    expect(allowed).toBe(false);
  });

  it("treats a 'general' audience_scope the same as a NULL one -- both open to everyone", async () => {
    mockedQuery.mockResolvedValue([{ id: 1 }]);
    await CourseService.canAccessCourse(10, 1, learner);
    const [query] = mockedQuery.mock.calls[0];
    expect(query).toContain("audience_scope IS NULL");
    expect(query).toContain("= 'general'");
  });

  it("scopes the 'enterprise' level to the user's own enterpriseId (not open to the whole tenant)", async () => {
    mockedQuery.mockResolvedValue([{ id: 1 }]);
    await CourseService.canAccessCourse(10, 1, learner);
    const [query, params] = mockedQuery.mock.calls[0];
    // The enterprise branch must check ids, not match unconditionally like it used to.
    expect(query).toMatch(/= 'enterprise' AND [^)]*userEnterpriseId/);
    expect(params.userEnterpriseId).toBe(1);
  });

  it('omits both the audience_scope and course_assignments enterprise/direction/service branches for a learner with none of those ids, to avoid an undefined SQL binding', async () => {
    mockedQuery.mockResolvedValue([]);
    await CourseService.canAccessCourse(10, 1, { id: 5, role: 'agent' });
    const [query, params] = mockedQuery.mock.calls[0];
    // A user with no enterprise/direction/service (e.g. super_admin) must not reference
    // @userEnterpriseId/@userDirectionId/@userServiceId anywhere in the query -- Knex's raw
    // named-binding compiler throws "Undefined binding(s) detected" if a param is referenced
    // in the SQL text but its value is undefined, which crashed getLessonCatalog/canAccessCourse
    // for exactly this user shape in production.
    expect(query).not.toMatch(/level'\) = 'enterprise'/);
    expect(query).not.toContain('@userEnterpriseId');
    expect(query).not.toContain('@userDirectionId');
    expect(query).not.toContain('@userServiceId');
    expect(query).toContain("assignment_type = 'user'");
    expect(query).toContain("assignment_type = 'role'");
    expect(params).toMatchObject({ userId: 5, userRole: 'agent' });
  });

  it("checks course_assignments for a 'team' assignment via a nested team_members lookup", async () => {
    mockedQuery.mockResolvedValue([{ id: 1 }]);
    await CourseService.canAccessCourse(10, 1, learner);
    const [query] = mockedQuery.mock.calls[0];
    expect(query).toContain("assignment_type = 'team'");
    expect(query).toContain('FROM team_members tm');
    expect(query).toContain('tm.team_id = ca.target_id');
  });

  it("still checks the team's own user-membership branch even when the learner has no enterprise/direction/service id", async () => {
    mockedQuery.mockResolvedValue([]);
    await CourseService.canAccessCourse(10, 1, { id: 5, role: 'agent' });
    const [query] = mockedQuery.mock.calls[0];
    expect(query).toContain("assignment_type = 'team'");
    expect(query).toContain("(tm.member_type = 'user' AND tm.target_id = @userId)");
    expect(query).not.toContain("tm.member_type = 'enterprise'");
    expect(query).not.toContain("tm.member_type = 'direction'");
    expect(query).not.toContain("tm.member_type = 'service'");
  });
});
