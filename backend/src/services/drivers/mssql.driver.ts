import sql, { ConnectionPool } from 'mssql';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { DatabaseDriver } from './types';

function bindParams(request: sql.Request, params?: Record<string, any>): void {
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

export class MssqlDriver implements DatabaseDriver {
  private pool: ConnectionPool | null = null;

  private async getPool(): Promise<ConnectionPool> {
    if (this.pool) return this.pool;

    logger.info(`Connecting to SQL Server: ${config.database.server}/${config.database.database}`);

    this.pool = await new sql.ConnectionPool({
      server: config.database.server,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      options: config.database.options,
      pool: config.database.pool,
    }).connect();

    logger.info('Connected to SQL Server database');
    return this.pool;
  }

  public async query<T = any>(queryString: string, params?: Record<string, any>): Promise<T[]> {
    const pool = await this.getPool();
    const request = pool.request();
    bindParams(request, params);
    const result = await request.query(queryString);
    return result.recordset as T[];
  }

  public async execute(
    queryString: string,
    params?: Record<string, any>
  ): Promise<{ rowsAffected: number; insertedId?: number }> {
    const pool = await this.getPool();
    const request = pool.request();
    bindParams(request, params);
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

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      logger.info('Database connection closed');
    }
  }
}
