import { Request, Response, NextFunction } from 'express';
export interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
    code?: string;
    details?: any;
}
export declare class ApiError extends Error implements AppError {
    statusCode: number;
    isOperational: boolean;
    code?: string;
    details?: any;
    constructor(message: string, statusCode?: number, code?: string, details?: any);
}
export declare const errorHandler: (err: AppError, req: Request, res: Response, next: NextFunction) => void;
export declare const BadRequestError: (message: string, code?: string, details?: any) => ApiError;
export declare const UnauthorizedError: (message?: string) => ApiError;
export declare const ForbiddenError: (message?: string) => ApiError;
export declare const NotFoundError: (resource?: string) => ApiError;
export declare const ConflictError: (message: string, code?: string) => ApiError;
export declare const ValidationError: (message: string, details?: any) => ApiError;
export declare const InternalError: (message?: string) => ApiError;
//# sourceMappingURL=error.middleware.d.ts.map