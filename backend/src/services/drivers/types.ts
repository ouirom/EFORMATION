export interface DatabaseDriver {
  query<T = any>(queryString: string, params?: Record<string, any>): Promise<T[]>;
  execute(
    queryString: string,
    params?: Record<string, any>
  ): Promise<{ rowsAffected: number; insertedId?: number }>;
  close(): Promise<void>;
}
