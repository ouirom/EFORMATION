-- 024_courses_lessons_soft_delete.sql
-- Audit finding: deleting a course/lesson physically cascaded into hard-deleting
-- certificates, evaluations, enrollments and lesson_progress -- destroying a
-- learner's completion/certificate history. courses and lessons now get deleted_at
-- like users already has; delete becomes an UPDATE, and reads filter it out.
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE courses ADD COLUMN deleted_at TIMESTAMP NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE lessons ADD COLUMN deleted_at TIMESTAMP NULL;
  END IF;
END $$;
