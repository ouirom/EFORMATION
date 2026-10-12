import type { Knex } from 'knex';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Runs db/migrations/041_tenant_external_theme.sql through the Knex runner
 * (`npm run migrate:latest` from backend/), so deploying doesn't depend on
 * someone remembering to apply the .sql file by hand. The .sql file stays the
 * single source of truth -- this only executes it. It is idempotent, so this is
 * a no-op on a database where it was already applied manually.
 *
 * Postgres only: the script uses a DO $$ block. The SQL Server fallback has no
 * equivalent yet.
 */
export async function up(knex: Knex): Promise<void> {
  if (knex.client.config.client !== 'pg') {
    throw new Error('041_tenant_external_theme only supports Postgres (DB_CLIENT=pg)');
  }
  const sql = readFileSync(join(__dirname, '..', 'migrations', '041_tenant_external_theme.sql'), 'utf8');
  await knex.raw(sql);
}

/** Intentionally a no-op: dropping the columns would erase the partner theme an admin chose. */
export async function down(): Promise<void> {}
