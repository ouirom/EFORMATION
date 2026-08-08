export declare class DatabaseService {
    private static driver;
    private static getDriver;
    static initialize(): Promise<void>;
    static query<T = any>(queryString: string, params?: Record<string, any>): Promise<T[]>;
    static execute(queryString: string, params?: Record<string, any>): Promise<{
        rowsAffected: number;
        insertedId?: number;
    }>;
    static close(): Promise<void>;
}
//# sourceMappingURL=database.service.d.ts.map