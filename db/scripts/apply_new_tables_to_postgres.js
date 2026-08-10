// One-time script: applies just the newly-added tables (from migration 011 /
// db/bci_lms_schema_postgres.sql) to the LIVE Postgres database, without re-running the
// whole schema file (which would collide on ALTER TABLE ... ADD CONSTRAINT for
// already-existing constraints -- those aren't idempotent). Extracts the relevant
// CREATE TABLE / ADD CONSTRAINT statements straight from the regenerated schema file
// so there's no risk of hand-transcription drift between the two.
//
// Run from backend/: PG_MIGRATE_PASSWORD=... node ../db/scripts/apply_new_tables_to_postgres.js
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const NEW_TABLES = [
  'ai_usage_logs', 'scheduled_reports', 'blog_categories', 'blog_tags',
  'blog_post_tags', 'blog_comments', 'push_subscriptions', 'user_devices',
  'user_profiles', 'search_history', 'webhooks', 'webhook_deliveries',
];

const schemaPath = path.join(__dirname, '..', 'bci_lms_schema_postgres.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

const statements = [];

for (const t of NEW_TABLES) {
  const re = new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([\\s\\S]*?\\n\\);`, 'm');
  const m = schema.match(re);
  if (!m) throw new Error(`Could not find CREATE TABLE for ${t} in ${schemaPath}`);
  statements.push(m[0]);
}

// blog_posts already exists in Postgres -- CREATE TABLE IF NOT EXISTS is a no-op for it,
// so its 5 new columns need an explicit ADD COLUMN IF NOT EXISTS (Postgres-native).
// Must run before the FK/unique constraints below, several of which reference these
// new columns (e.g. blog_posts.category_id).
statements.push(`
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS category_id BIGINT,
  ADD COLUMN IF NOT EXISTS slug VARCHAR(255),
  ADD COLUMN IF NOT EXISTS featured_image_id BIGINT,
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
`.trim());

// Unique constraints / FKs that touch any of the new tables (as the altered table or
// as a REFERENCES target, e.g. blog_post_tags -> blog_posts/blog_tags).
const alterLines = schema.split('\n').filter((line) => {
  if (!line.startsWith('ALTER TABLE')) return false;
  return NEW_TABLES.some((t) => line.includes(`ALTER TABLE ${t} `) || line.includes(`REFERENCES ${t} `));
});
statements.push(...alterLines);

async function main() {
  if (!process.env.PG_MIGRATE_PASSWORD) {
    console.error('Set PG_MIGRATE_PASSWORD in the environment before running this script.');
    process.exit(1);
  }
  const pg = new Client({
    host: 'localhost', port: 5432, database: 'db_eformation',
    user: 'postgres', password: process.env.PG_MIGRATE_PASSWORD,
  });
  await pg.connect();
  await pg.query('BEGIN');
  try {
    for (const stmt of statements) {
      await pg.query(stmt);
    }
    await pg.query('COMMIT');
    console.log(`Applied ${statements.length} statements (${NEW_TABLES.length} new tables + blog_posts columns) to Postgres.`);
  } catch (e) {
    await pg.query('ROLLBACK');
    console.error('Failed, rolled back:', e.message);
    process.exit(1);
  } finally {
    await pg.end();
  }
}

main();
