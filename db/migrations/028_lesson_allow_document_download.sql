-- 028_lesson_allow_document_download.sql
-- Per-lesson setting: whether the learner may download the lesson's document at all,
-- as opposed to only viewing it inline. Defaults to TRUE (today's behavior -- downloads
-- were always allowed) so existing lessons are unaffected. Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'allow_document_download'
  ) THEN
    ALTER TABLE lessons ADD COLUMN allow_document_download BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;
