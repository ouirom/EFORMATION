import type { Knex } from 'knex';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Runs db/migrations/034_tenant_course_categories.sql through the Knex runner
 * (`npm run migrate:latest` from backend/), so deploying doesn't depend on
 * someone remembering to apply the .sql file by hand. The .sql file stays the
 * single source of truth -- this only executes it. It is idempotent, so this is
 * a no-op on a database where it was already applied manually.
 *
 * Postgres only: the script uses a DO $$ block. The SQL Server fallback has no
 * equivalent yet, and nothing in it has the per-tenant categories model.
 */
export async function up(knex: Knex): Promise<void> {
  if (knex.client.config.client !== 'pg') {
    throw new Error('034_tenant_course_categories only supports Postgres (DB_CLIENT=pg)');
  }
  const sql = readFileSync(join(__dirname, '..', 'migrations', '034_tenant_course_categories.sql'), 'utf8');
  await knex.raw(sql);
}

/**
 * Intentionally a no-op: undoing this would drop `categories.code`, which every
 * course's category now points at, and delete the categories admins created.
 * Roll back by hand if ever needed.
 */
export async function down(): Promise<void> {}
