import { Pool } from 'pg';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { translateForPostgres } from '../../utils/sql-dialect';
import { DatabaseDriver } from './types';

export class PostgresDriver implements DatabaseDriver {
  private pool: Pool | null = null;

  private getPool(): Pool {
    if (this.pool) return this.pool;

    logger.info(`Connecting to PostgreSQL: ${config.database.server}/${config.database.database}`);

    this.pool = new Pool({
      host: config.database.server,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
      max: config.database.pool.max,
      idleTimeoutMillis: config.database.pool.idleTimeoutMillis,
    });

    this.pool.on('connect', () => logger.info('Connected to PostgreSQL database'));
    this.pool.on('error', (error) => logger.error('PostgreSQL pool error:', { message: error.message }));

    return this.pool;
  }

  public async query<T = any>(queryString: string, params?: Record<string, any>): Promise<T[]> {
    const pool = this.getPool();
    const { text, values } = translateForPostgres(queryString, params);
    const result = await pool.query(text, values);
    return result.rows as T[];
  }

  public async execute(
    queryString: string,
    params?: Record<string, any>
  ): Promise<{ rowsAffected: number; insertedId?: number }> {
    const pool = this.getPool();
    const { text, values } = translateForPostgres(queryString, params);
    const result = await pool.query(text, values);

    let insertedId: number | undefined;
    if (result.rows && result.rows[0]?.id) {
      insertedId = result.rows[0].id;
    }

    return {
      rowsAffected: result.rowCount ?? 0,
      insertedId,
    };
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database connection closed');
    }
  }
}
