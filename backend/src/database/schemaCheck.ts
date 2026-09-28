import { DatabaseService } from '../services/database.service';
import { logger } from '../utils/logger';

/**
 * Columns the current code depends on that only exist once a given migration has
 * run. Checked at startup so a database that missed a migration shows up as one
 * explicit log line naming the fix, instead of scattered 500s on the routes that
 * touch it. Add an entry whenever a migration adds something the code reads.
 */
const REQUIRED_COLUMNS: { table: string; column: string; migration: string }[] = [
  { table: 'categories', column: 'code', migration: '034_tenant_course_categories' },
  { table: 'tenant_settings', column: 'require_registration_approval', migration: '035_tenant_security_settings' },
  { table: 'users', column: 'locked_until', migration: '035_tenant_security_settings' },
  { table: 'tenant_sso_settings', column: 'ldap_url', migration: '036_tenant_sso_settings' },
  { table: 'tenant_settings', column: 'xp_per_level', migration: '037_tenant_learning_settings' },
  { table: 'users', column: 'subsidiary_id', migration: '038_subsidiaries' },
];

/** Returns the migrations that still need to run (empty when the schema is up to date). */
export async function findMissingMigrations(): Promise<string[]> {
  const missing = new Set<string>();
  for (const { table, column, migration } of REQUIRED_COLUMNS) {
    const rows = await DatabaseService.query<{ n: number }>(
      `SELECT COUNT(*) as n FROM information_schema.columns
       WHERE table_name = @table AND column_name = @column`,
      { table, column }
    );
    if (!Number(rows[0]?.n)) missing.add(migration);
  }
  return [...missing];
}

/** Logs (without stopping the server -- the rest of the app still works) any migration left to apply. */
export async function warnAboutMissingMigrations(): Promise<void> {
  try {
    const missing = await findMissingMigrations();
    if (missing.length > 0) {
      logger.error(
        `Database schema is behind the code -- missing migration(s): ${missing.join(', ')}. ` +
          'Run `npm run migrate:latest` in backend/ (or apply db/migrations/<name>.sql by hand).'
      );
    }
  } catch (error) {
    logger.warn('Could not verify the database schema', { error });
  }
}
