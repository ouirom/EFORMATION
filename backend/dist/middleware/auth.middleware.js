"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.authorizeScope = exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("./error.middleware");
const authenticateHandler = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.slice(7)
            : req.cookies?.accessToken;
        if (!token) {
            throw (0, error_middleware_1.UnauthorizedError)('No token provided');
        }
        const payload = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
        // Verify user still exists and is active
        const users = await database_service_1.DatabaseService.query(`SELECT id, tenant_id, email, role, enterprise_id, direction_id, service_id, is_active 
       FROM users WHERE id = @id AND tenant_id = @tenantId AND deleted_at IS NULL`, { id: payload.id, tenantId: payload.tenantId });
        if (users.length === 0 || !users[0].is_active) {
            throw (0, error_middleware_1.UnauthorizedError)('User not found or inactive');
        }
        const user = users[0];
        req.user = {
            id: user.id,
            tenantId: user.tenant_id,
            email: user.email,
            role: user.role,
            enterpriseId: user.enterprise_id,
            directionId: user.direction_id,
            serviceId: user.service_id,
        };
        // Override tenant from token if not set
        if (!req.tenantId) {
            req.tenantId = user.tenant_id;
        }
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            next((0, error_middleware_1.UnauthorizedError)('Invalid token'));
        }
        else if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            next((0, error_middleware_1.UnauthorizedError)('Token expired'));
        }
        else {
            next(error);
        }
    }
};
const authenticate = (req, res, next) => {
    return authenticateHandler(req, res, next);
};
exports.authenticate = authenticate;
// Role hierarchy
const ROLE_HIERARCHY = {
    admin: 5,
    director: 4,
    manager: 3,
    supervisor: 2,
    agent: 1,
};
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        req = req;
        if (!req.user) {
            return next((0, error_middleware_1.UnauthorizedError)('Authentication required'));
        }
        const userRole = req.user.role;
        const userRoleLevel = ROLE_HIERARCHY[userRole] || 0;
        // Check if user's role is in allowed roles or has higher hierarchy
        const isAllowed = allowedRoles.some((role) => {
            const requiredLevel = ROLE_HIERARCHY[role] || 0;
            return userRoleLevel >= requiredLevel || userRole === role;
        });
        if (!isAllowed) {
            return next((0, error_middleware_1.ForbiddenError)('Insufficient permissions'));
        }
        next();
    };
};
exports.authorize = authorize;
// Check if user can access resource in their organizational scope
const authorizeScope = (scopeField) => {
    return (req, res, next) => {
        req = req;
        if (!req.user) {
            return next((0, error_middleware_1.UnauthorizedError)('Authentication required'));
        }
        // Admins can access everything
        if (req.user.role === 'admin') {
            return next();
        }
        const resourceScopeId = req.params[scopeField] || req.body[scopeField];
        const userScopeId = req.user[scopeField];
        // If resource scope is specified and user has a scope, check match
        if (resourceScopeId && userScopeId) {
            if (parseInt(resourceScopeId, 10) !== userScopeId) {
                // Directors can access all directions in their enterprise
                if (req.user.role === 'director' && scopeField !== 'enterpriseId') {
                    // They need to verify the direction/service belongs to their enterprise
                    // This should be handled in the controller with proper DB queries
                    return next();
                }
                // Managers can access all services in their direction
                if (req.user.role === 'manager' && scopeField === 'serviceId') {
                    return next();
                }
                return next((0, error_middleware_1.ForbiddenError)('Access denied to this organizational scope'));
            }
        }
        next();
    };
};
exports.authorizeScope = authorizeScope;
const optionalAuthHandler = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.slice(7)
            : req.cookies?.accessToken;
        if (token) {
            const payload = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
            req.user = payload;
        }
        next();
    }
    catch {
        // Continue without user
        next();
    }
};
const optionalAuth = (req, res, next) => {
    return optionalAuthHandler(req, res, next);
};
exports.optionalAuth = optionalAuth;
//# sourceMappingURL=auth.middleware.js.map