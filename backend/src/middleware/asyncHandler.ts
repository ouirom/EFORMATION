import { Request, Response, NextFunction } from 'express';

/**
 * Wrapper for async middleware/route handlers to prevent unhandled promise rejections
 * and properly handle TypeScript typing
 */
export const asyncHandler = (
  fn: (req: any, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: any, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

