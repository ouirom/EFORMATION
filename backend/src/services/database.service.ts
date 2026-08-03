import sql, { ConnectionPool, config as SqlConfig } from 'mssql/msnodesqlv8';
import { config } from '../config';
import { logger } from '../utils/logger';

export class DatabaseService {
  private static pool: ConnectionPool | null = null;

  public static async initialize(): Promise<ConnectionPool> {
    if (this.pool) {
      return this.pool;
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
      return this.pool;
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

  public static async getPool(): Promise<ConnectionPool> {
    if (!this.pool) {
      return this.initialize();
    }
    return this.pool;
  }

  public static async query<T = any>(
    queryString: string,
    params?: Record<string, any>
  ): Promise<T[]> {
    const pool = await this.getPool();
    const request = pool.request();

    if (params) {
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

    const result = await request.query(queryString);
    return result.recordset as T[];
  }

  public static async execute(
    queryString: string,
    params?: Record<string, any>
  ): Promise<{ rowsAffected: number; insertedId?: number }> {
    const pool = await this.getPool();
    const request = pool.request();

    if (params) {
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
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      logger.info('Database connection closed');
    }
  }
}

// Export types for use in other files
export { sql };
