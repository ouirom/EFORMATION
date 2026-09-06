-- 021_add_missing_foreign_keys.sql
-- Adds missing FK constraints on lesson_progress and certificate_templates
-- (audit finding: no referential integrity, 2 orphan lesson_progress rows found
-- pointing at deleted lessons). Idempotent: safe to re-run.

-- Clean up known orphan rows before adding the constraint (lesson_id no longer exists).
DELETE FROM lesson_progress lp
WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = lp.lesson_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_lesson_progress_tenant'
  ) THEN
    ALTER TABLE lesson_progress
      ADD CONSTRAINT fk_lesson_progress_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_lesson_progress_user'
  ) THEN
    ALTER TABLE lesson_progress
      ADD CONSTRAINT fk_lesson_progress_user FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_lesson_progress_lesson'
  ) THEN
    ALTER TABLE lesson_progress
      ADD CONSTRAINT fk_lesson_progress_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_lesson_progress_course'
  ) THEN
    ALTER TABLE lesson_progress
      ADD CONSTRAINT fk_lesson_progress_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_certificate_templates_tenant'
  ) THEN
    ALTER TABLE certificate_templates
      ADD CONSTRAINT fk_certificate_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_certificate_templates_bg_file'
  ) THEN
    ALTER TABLE certificate_templates
      ADD CONSTRAINT fk_certificate_templates_bg_file FOREIGN KEY (background_file_id) REFERENCES file_assets(id) ON DELETE SET NULL;
  END IF;
END $$;
