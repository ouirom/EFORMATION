import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { captureException } from '../utils/sentry';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string;
  details?: any;
}

export class ApiError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;
  code?: string;
  details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error
  if (statusCode >= 500) {
    logger.error({
      err,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userId: (req as any).user?.id,
    }, 'Server error');
    captureException(err);
  } else {
    logger.warn({
      statusCode,
      message,
      method: req.method,
      url: req.originalUrl,
      code: err.code,
    }, 'Client error');
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: err.code,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        details: err.details,
      }),
    },
  });
};

// Error factory functions
export const BadRequestError = (message: string, code?: string, details?: any) =>
  new ApiError(message, 400, code || 'BAD_REQUEST', details);

export const UnauthorizedError = (message: string = 'Unauthorized') =>
  new ApiError(message, 401, 'UNAUTHORIZED');

export const ForbiddenError = (message: string = 'Forbidden') =>
  new ApiError(message, 403, 'FORBIDDEN');

export const NotFoundError = (resource: string = 'Resource') =>
  new ApiError(`${resource} not found`, 404, 'NOT_FOUND');

export const ConflictError = (message: string, code?: string) =>
  new ApiError(message, 409, code || 'CONFLICT');

export const ValidationError = (message: string, details?: any) =>
  new ApiError(message, 422, 'VALIDATION_ERROR', details);

export const InternalError = (message: string = 'Internal server error') =>
  new ApiError(message, 500, 'INTERNAL_ERROR');

export const ServiceUnavailableError = (message: string = 'Service unavailable') =>
  new ApiError(message, 503, 'SERVICE_UNAVAILABLE');
