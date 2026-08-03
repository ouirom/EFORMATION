import { TenantRequest } from './tenant.middleware';
export interface UserPayload {
    id: number;
    tenantId: number;
    email: string;
    role: string;
    enterpriseId?: number;
    directionId?: number;
    serviceId?: number;
}
export interface AuthRequest extends TenantRequest {
    user?: UserPayload;
}
export declare const authenticate: (req: any, res: any, next: any) => Promise<void>;
export declare const authorize: (...allowedRoles: string[]) => (req: any, res: any, next: any) => void;
export declare const authorizeScope: (scopeField: "enterpriseId" | "directionId" | "serviceId") => (req: any, res: any, next: any) => void;
export declare const optionalAuth: (req: any, res: any, next: any) => Promise<void>;
//# sourceMappingURL=auth.middleware.d.ts.map