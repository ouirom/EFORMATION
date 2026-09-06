-- 029_favorites.sql
-- Lets a user mark a course or a lesson as a favorite. Polymorphic, same idea as
-- course_assignments' assignment_type/target_id: one table for both entity kinds
-- instead of two near-identical ones. Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS favorites (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL,
  user_id           BIGINT NOT NULL,
  favoritable_type  VARCHAR(20) NOT NULL CHECK (favoritable_type IN ('course', 'lesson')),
  favoritable_id    BIGINT NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uq_favorites_entry'
  ) THEN
    ALTER TABLE favorites ADD CONSTRAINT uq_favorites_entry UNIQUE (user_id, favoritable_type, favoritable_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_favorites_user_id'
  ) THEN
    CREATE INDEX idx_favorites_user_id ON favorites(user_id);
  END IF;
END $$;
