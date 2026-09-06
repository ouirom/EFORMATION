-- 027_lesson_presence_check.sql
-- Two per-lesson learner-engagement settings: presence_check_percent triggers an
-- "are you still there?" prompt once that fraction of the lesson's duration_min has
-- been spent (NULL = disabled), and reset_time_on_reopen controls whether reopening
-- the lesson after a break resumes the accumulated time_spent_seconds or restarts it
-- at zero. Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'presence_check_percent'
  ) THEN
    ALTER TABLE lessons ADD COLUMN presence_check_percent INTEGER NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_lessons_presence_check_percent'
  ) THEN
    ALTER TABLE lessons ADD CONSTRAINT chk_lessons_presence_check_percent
      CHECK (presence_check_percent IS NULL OR (presence_check_percent >= 0 AND presence_check_percent <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'reset_time_on_reopen'
  ) THEN
    ALTER TABLE lessons ADD COLUMN reset_time_on_reopen BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
