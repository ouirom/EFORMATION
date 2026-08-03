import { Request, Response, NextFunction } from 'express';
export interface TenantRequest extends Request {
    tenantId?: number;
    tenantSlug?: string;
}
export declare const tenantMiddleware: (req: any, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=tenant.middleware.d.ts.map