-- 034_tenant_course_categories.sql
-- Turns `categories` into the per-tenant course category list. Before this, the
-- admin "Course categories" panel wrote to this table but nothing ever read it
-- back: courses.category held one of 8 codes hardcoded in the frontend, and
-- courses.category_id stayed NULL everywhere.
--
-- Model after this migration:
--   * categories.code  -- stable key, unique per tenant, stored in courses.category.
--                         Never changes, so renaming a category never detaches courses.
--   * categories.name  -- admin-chosen label. NULL means "default label": the frontend
--                         translates the 8 built-in codes (technology, hr, ...) in FR/EN.
--   * courses.category keeps holding the code (search, reports, AI, import and
--     analytics all read it unchanged). courses.category_id is left as-is, unused.
--
-- Every tenant gets the 8 built-in categories; any other code already used by a
-- course is registered too, so no course points at an unknown category.
-- New tenants get the defaults from CategoryService.seedDefaults (platform.routes.ts).
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'code'
  ) THEN
    ALTER TABLE categories ADD COLUMN code VARCHAR(50);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE categories ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc');
  END IF;

  ALTER TABLE categories ALTER COLUMN name DROP NOT NULL;

  -- Rows created through the old panel have no code yet: derive one from the name.
  UPDATE categories
  SET code = COALESCE(
    NULLIF(trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))), ''),
    'category-' || id
  )
  WHERE code IS NULL;

  ALTER TABLE categories ALTER COLUMN code SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'uq_categories_tenant_code'
  ) THEN
    ALTER TABLE categories ADD CONSTRAINT uq_categories_tenant_code UNIQUE (tenant_id, code);
  END IF;
END $$;

-- 'tech' was an older spelling of 'technology' (see frontend lib/categories.ts).
UPDATE courses SET category = 'technology' WHERE category = 'tech';

-- Built-in categories for every tenant (name NULL = translated default label).
INSERT INTO categories (tenant_id, code, name)
SELECT t.id, d.code, NULL
FROM tenants t
CROSS JOIN (VALUES
  ('technology'), ('management'), ('marketing'), ('finance'),
  ('hr'), ('soft-skills'), ('compliance'), ('other')
) AS d(code)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.tenant_id = t.id AND c.code = d.code
);

-- Any other code already on a course (free text from imports, etc.) becomes a
-- category of its own, labelled with that same text.
INSERT INTO categories (tenant_id, code, name)
SELECT DISTINCT co.tenant_id, co.category, co.category
FROM courses co
WHERE co.category IS NOT NULL AND co.category <> ''
  AND NOT EXISTS (
    SELECT 1 FROM categories c WHERE c.tenant_id = co.tenant_id AND c.code = co.category
  );
