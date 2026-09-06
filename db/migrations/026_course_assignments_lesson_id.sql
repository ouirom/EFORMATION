-- 026_course_assignments_lesson_id.sql
-- Course assignments could only ever target a whole course -- adds an optional
-- lesson_id so a specific lesson within a course can be pushed to someone
-- (due date/mandatory/notification) without reassigning the whole course.
-- Access itself is still entirely inherited from the parent course
-- (CourseService.canAccessCourse); this is a tracking/notification scope only.
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_assignments' AND column_name = 'lesson_id'
  ) THEN
    ALTER TABLE course_assignments ADD COLUMN lesson_id BIGINT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_course_assignments_lesson'
  ) THEN
    ALTER TABLE course_assignments
      ADD CONSTRAINT fk_course_assignments_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_course_assignments_lesson_id'
  ) THEN
    CREATE INDEX idx_course_assignments_lesson_id ON course_assignments(lesson_id);
  END IF;
END $$;
