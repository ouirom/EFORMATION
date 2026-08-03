"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalError = exports.ValidationError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.BadRequestError = exports.errorHandler = exports.ApiError = void 0;
const logger_1 = require("../utils/logger");
class ApiError extends Error {
    statusCode;
    isOperational;
    code;
    details;
    constructor(message, statusCode = 500, code, details) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.ApiError = ApiError;
const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    // Log error
    if (statusCode >= 500) {
        logger_1.logger.error({
            err,
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userId: req.user?.id,
        }, 'Server error');
    }
    else {
        logger_1.logger.warn({
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
exports.errorHandler = errorHandler;
// Error factory functions
const BadRequestError = (message, code, details) => new ApiError(message, 400, code || 'BAD_REQUEST', details);
exports.BadRequestError = BadRequestError;
const UnauthorizedError = (message = 'Unauthorized') => new ApiError(message, 401, 'UNAUTHORIZED');
exports.UnauthorizedError = UnauthorizedError;
const ForbiddenError = (message = 'Forbidden') => new ApiError(message, 403, 'FORBIDDEN');
exports.ForbiddenError = ForbiddenError;
const NotFoundError = (resource = 'Resource') => new ApiError(`${resource} not found`, 404, 'NOT_FOUND');
exports.NotFoundError = NotFoundError;
const ConflictError = (message, code) => new ApiError(message, 409, code || 'CONFLICT');
exports.ConflictError = ConflictError;
const ValidationError = (message, details) => new ApiError(message, 422, 'VALIDATION_ERROR', details);
exports.ValidationError = ValidationError;
const InternalError = (message = 'Internal server error') => new ApiError(message, 500, 'INTERNAL_ERROR');
exports.InternalError = InternalError;
//# sourceMappingURL=error.middleware.js.map