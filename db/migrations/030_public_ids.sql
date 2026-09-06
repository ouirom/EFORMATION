-- 030_public_ids.sql
-- Opaque public identifiers for courses and lessons, used in browser-facing URLs
-- instead of the sequential internal id (so a URL doesn't reveal how many
-- courses/lessons exist or their creation order). Internal foreign keys and every
-- API call that isn't itself a shareable browser URL keep using the numeric id
-- unchanged -- see backend/src/utils/resolvePublicId.ts for the dual-mode lookup.
-- gen_random_uuid() is native to Postgres 13+, no pgcrypto extension needed.
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'public_id'
  ) THEN
    ALTER TABLE courses ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uq_courses_public_id'
  ) THEN
    ALTER TABLE courses ADD CONSTRAINT uq_courses_public_id UNIQUE (public_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'public_id'
  ) THEN
    ALTER TABLE lessons ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uq_lessons_public_id'
  ) THEN
    ALTER TABLE lessons ADD CONSTRAINT uq_lessons_public_id UNIQUE (public_id);
  END IF;
END $$;
