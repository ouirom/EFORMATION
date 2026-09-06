-- 032_course_assignments_team_type.sql
-- Lets a course/lesson be assigned to a team (course_assignments.assignment_type
-- = 'team', target_id = teams.id), alongside the existing user/enterprise/
-- direction/service/role targets. Team membership itself is resolved at read
-- time via team_members (see backend/src/utils/teamAssignment.ts), the same
-- way team_members.member_type already resolves user/enterprise/direction/
-- service down to concrete users. Idempotent: safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'course_assignments' AND con.conname = 'course_assignments_assignment_type_check'
  ) THEN
    ALTER TABLE course_assignments DROP CONSTRAINT course_assignments_assignment_type_check;
  END IF;

  ALTER TABLE course_assignments ADD CONSTRAINT course_assignments_assignment_type_check
    CHECK (assignment_type IN ('role', 'service', 'direction', 'enterprise', 'user', 'team'));
END $$;
