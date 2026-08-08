import { DatabaseDriver } from './types';
export declare class PostgresDriver implements DatabaseDriver {
    private pool;
    private getPool;
    query<T = any>(queryString: string, params?: Record<string, any>): Promise<T[]>;
    execute(queryString: string, params?: Record<string, any>): Promise<{
        rowsAffected: number;
        insertedId?: number;
    }>;
    close(): Promise<void>;
}
//# sourceMappingURL=postgres.driver.d.ts.map