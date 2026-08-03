import { Response, NextFunction } from 'express';
/**
 * Wrapper for async middleware/route handlers to prevent unhandled promise rejections
 * and properly handle TypeScript typing
 */
export declare const asyncHandler: (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) => (req: any, res: Response, next: NextFunction) => void;
//# sourceMappingURL=asyncHandler.d.ts.map