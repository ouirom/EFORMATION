import type { Knex } from 'knex';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Runs db/migrations/044_login_alerts.sql through the Knex runner
 * (`npm run migrate:latest` from backend/), so deploying doesn't depend on
 * someone remembering to apply the .sql file by hand. The .sql file stays the
 * single source of truth -- this only executes it. It is idempotent, so this is
 * a no-op on a database where it was already applied manually.
 *
 * Postgres only: the script uses Postgres syntax (DO $$, CREATE INDEX IF NOT
 * EXISTS). The SQL Server fallback has no equivalent yet.
 */
export async function up(knex: Knex): Promise<void> {
  if (knex.client.config.client !== 'pg') {
    throw new Error('044_login_alerts only supports Postgres (DB_CLIENT=pg)');
  }
  const sql = readFileSync(join(__dirname, '..', 'migrations', '044_login_alerts.sql'), 'utf8');
  await knex.raw(sql);
}

/** Intentionally a no-op: dropping the column would forget the organization's choice. */
export async function down(): Promise<void> {}
