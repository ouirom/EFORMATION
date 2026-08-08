import { config } from '../config';
import { DatabaseDriver } from './drivers/types';
import { MssqlDriver } from './drivers/mssql.driver';
import { PostgresDriver } from './drivers/postgres.driver';

export class DatabaseService {
  private static driver: DatabaseDriver | null = null;

  private static getDriver(): DatabaseDriver {
    if (!this.driver) {
      this.driver = config.database.client === 'postgres' ? new PostgresDriver() : new MssqlDriver();
    }
    return this.driver;
  }

  public static async initialize(): Promise<void> {
    // Trigger a connection now so startup fails fast on bad DB config.
    await this.getDriver().query('SELECT 1 as ok');
  }

  public static async query<T = any>(queryString: string, params?: Record<string, any>): Promise<T[]> {
    return this.getDriver().query<T>(queryString, params);
  }

  public static async execute(
    queryString: string,
    params?: Record<string, any>
  ): Promise<{ rowsAffected: number; insertedId?: number }> {
    return this.getDriver().execute(queryString, params);
  }

  public static async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}
