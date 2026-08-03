import sql, { ConnectionPool } from 'mssql/msnodesqlv8';
export declare class DatabaseService {
    private static pool;
    static initialize(): Promise<ConnectionPool>;
    static getPool(): Promise<ConnectionPool>;
    static query<T = any>(queryString: string, params?: Record<string, any>): Promise<T[]>;
    static execute(queryString: string, params?: Record<string, any>): Promise<{
        rowsAffected: number;
        insertedId?: number;
    }>;
    static transaction<T>(callback: (transaction: sql.Transaction) => Promise<T>): Promise<T>;
    static close(): Promise<void>;
}
export { sql };
//# sourceMappingURL=database.service.d.ts.map