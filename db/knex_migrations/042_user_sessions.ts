import type { Knex } from 'knex';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Runs db/migrations/042_user_sessions.sql through the Knex runner
 * (`npm run migrate:latest` from backend/), so deploying doesn't depend on
 * someone remembering to apply the .sql file by hand. The .sql file stays the
 * single source of truth -- this only executes it. It is idempotent, so this is
 * a no-op on a database where it was already applied manually.
 *
 * Postgres only: the script uses Postgres syntax (BIGSERIAL, CREATE INDEX IF NOT
 * EXISTS). The SQL Server fallback has no equivalent yet.
 */
export async function up(knex: Knex): Promise<void> {
  if (knex.client.config.client !== 'pg') {
    throw new Error('042_user_sessions only supports Postgres (DB_CLIENT=pg)');
  }
  const sql = readFileSync(join(__dirname, '..', 'migrations', '042_user_sessions.sql'), 'utf8');
  await knex.raw(sql);
}

/** Intentionally a no-op: the running code needs the table (drop it by hand to really roll back). */
export async function down(): Promise<void> {}
