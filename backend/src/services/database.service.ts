import sql, { ConnectionPool, Request as MssqlRequest } from 'mssql/msnodesqlv8';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getKnex, closeKnex } from '../database/knex';

// Which backend query()/execute() route through — see config/index.ts for why
// 'mssql' stays on the native Windows-Auth driver instead of also going
// through Knex (this project's own dev SQL Server instance is Windows-Auth-only,
// which Knex's tedious-based mssql client can't authenticate against at all).
const IS_PG = config.database.client === 'pg';

// A control character that can never legitimately appear in this app's SQL
// text — safe to use as a placeholder sentinel without risk of colliding
// with real query content.
const SENTINEL = '\u0001';

/**
 * Translates this app's mssql-style `@paramName` placeholders into Knex's
 * `:paramName` named-binding syntax, for the PostgreSQL path only — the
 * mssql path still binds `@paramName` directly via the driver's own
 * `request.input()`. `@@`-prefixed tokens (mssql system variables like
 * `@@ROWCOUNT` — none currently used in this codebase, but guarded
 * defensively in case one is ever introduced) are left untouched.
 */
function toKnexNamedParams(queryString: string): string {
  return queryString
    .replace(/@@(\w+)/g, `${SENTINEL}$1${SENTINEL}`)
    .replace(/@(\w+)/g, ':$1')
    .replace(new RegExp(`${SENTINEL}(\\w+)${SENTINEL}`, 'g'), '@@$1');
}

/** Shared by query()/execute() on the mssql path — infers an mssql SQL type per JS value. */
function bindMssqlParams(request: MssqlRequest, params?: Record<string, any>): void {
  if (!params) return;
  Object.entries(params).forEach(([key, value]) => {
    if (value === null) {
      request.input(key, sql.NVarChar, null);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        request.input(key, sql.BigInt, value);
      } else {
        request.input(key, sql.Decimal(18, 4), value);
      }
    } else if (typeof value === 'boolean') {
      request.input(key, sql.Bit, value);
    } else if (value instanceof Date) {
      request.input(key, sql.DateTime2, value);
    } else if (typeof value === 'object') {
      request.input(key, sql.NVarChar(sql.MAX), JSON.stringify(value));
    } else {
      request.input(key, sql.NVarChar, value);
    }
  });
}

export class DatabaseService {
  private static pool: ConnectionPool | null = null;

  public static async initialize(): Promise<void> {
    if (IS_PG) {
      // Knex manages its own pool lazily; run one cheap query so a bad
      // connection fails fast at boot, matching the mssql path's behavior.
      await getKnex().raw('select 1');
      logger.info(`Connected to PostgreSQL: ${config.database.server}/${config.database.database}`);
      return;
    }

    if (this.pool) {
      return;
    }

    try {
      // Connection string for Windows Authentication using ODBC Driver
      const connectionString = `Driver={ODBC Driver 17 for SQL Server};Server=${config.database.server};Database=${config.database.database};Trusted_Connection=Yes;`;

      logger.info(`Connecting to SQL Server: ${config.database.server}/${config.database.database}`);

      this.pool = await new sql.ConnectionPool({
        connectionString,
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000,
        },
      }).connect();

      logger.info('Connected to SQL Server database using Windows Authentication');
    } catch (error: any) {
      console.error('Database connection error details:', error);
      logger.error('Database connection error:', {
        message: error.message,
        code: error.code,
        server: config.database.server,
        database: config.database.database,
      });
      throw error;
    }
  }

  /** mssql-only — there is no equivalent "raw pool" object on the pg/Knex path. */
  public static async getPool(): Promise<ConnectionPool> {
    if (!this.pool) {
      await this.initialize();
    }
    if (!this.pool) {
      throw new Error('getPool() is only available when DB_CLIENT=mssql');
    }
    return this.pool;
  }

  public static async query<T = any>(
    queryString: string,
    params?: Record<string, any>
  ): Promise<T[]> {
    if (IS_PG) {
      const result = await getKnex().raw(toKnexNamedParams(queryString), params || {});
      return (result.rows ?? result) as T[];
    }

    const pool = await this.getPool();
    const request = pool.request();
    bindMssqlParams(request, params);

    const result = await request.query(queryString);
    return result.recordset as T[];
  }

  public static async execute(
    queryString: string,
    params?: Record<string, any>
  ): Promise<{ rowsAffected: number; insertedId?: number }> {
    if (IS_PG) {
      const result = await getKnex().raw(toKnexNamedParams(queryString), params || {});
      let insertedId: number | undefined;
      if (result.rows && result.rows[0]?.id !== undefined) {
        insertedId = result.rows[0].id;
      }
      return {
        rowsAffected: result.rowCount ?? 0,
        insertedId,
      };
    }

    const pool = await this.getPool();
    const request = pool.request();
    bindMssqlParams(request, params);

    const result = await request.query(queryString);

    let insertedId: number | undefined;
    if (result.recordset && result.recordset[0]?.id) {
      insertedId = result.recordset[0].id;
    }

    return {
      rowsAffected: result.rowsAffected.reduce((a, b) => a + b, 0),
      insertedId,
    };
  }

  public static async transaction<T>(
    callback: (transaction: sql.Transaction) => Promise<T>
  ): Promise<T> {
    if (IS_PG) {
      // Unused anywhere in the current codebase (verified: no call sites) —
      // left unimplemented rather than silently wrong. Wire up Knex's
      // .transaction() here before any caller starts relying on this.
      throw new Error('DatabaseService.transaction() is not yet implemented for DB_CLIENT=pg');
    }

    const pool = await this.getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  public static async close(): Promise<void> {
    if (IS_PG) {
      await closeKnex();
      logger.info('Database connection closed');
      return;
    }

    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      logger.info('Database connection closed');
    }
  }
}

// Export types for use in other files
export { sql };
