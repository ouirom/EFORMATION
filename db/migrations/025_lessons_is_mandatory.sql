-- 025_lessons_is_mandatory.sql
-- A course can already be flagged mandatory (course_assignments.is_mandatory), but that's
-- a per-assignment flag, not a property of the course content itself -- there was no way
-- to mark an individual lesson within a course as required vs. optional. Idempotent: safe
-- to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'is_mandatory'
  ) THEN
    ALTER TABLE lessons ADD COLUMN is_mandatory BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
