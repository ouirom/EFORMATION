import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { DatabaseService } from '../services/database.service';
import { UnauthorizedError, ForbiddenError } from './error.middleware';
import { TenantRequest } from './tenant.middleware';
import { SessionService, sessionRevokedError, sessionReplacedError } from '../services/session.service';

export interface UserPayload {
  id: number;
  tenantId: number;
  email: string;
  // Only populated via the authenticate middleware's DB lookup, not the signed JWT payload itself.
  displayName?: string;
  avatarUrl?: string | null;
  role: string;
  enterpriseId?: number;
  subsidiaryId?: number;
  directionId?: number;
  serviceId?: number;
}

export interface AuthRequest extends TenantRequest {
  user?: UserPayload;
  /** The login session the access token belongs to (claim `sid`). */
  sessionId?: string;
}

/**
 * Verifies an access token and, when it names a session (every token issued
 * since sessions exist does), that the session is still live -- so logout,
 * "déconnecter cet appareil" and an admin force-logout take effect at once
 * instead of when the token expires. Tokens without `sid` predate sessions and
 * stay valid until they expire. Shared with the WebSocket handshake.
 */
export async function verifyAccessToken(token: string): Promise<UserPayload & { sid?: string }> {
  const payload = jwt.verify(token, config.jwt.secret) as UserPayload & { sid?: string; type?: string };
  // Other tokens signed with the same secret (password reset, ...) all carry a
  // `type`; an access token never does.
  if (!payload || typeof payload !== 'object' || payload.type) {
    throw UnauthorizedError('Invalid token');
  }
  if (payload.sid && !(await SessionService.isActive(payload.sid, payload.id))) {
    // Closed by a login on another device (one session per user): say so, the
    // web app then tells the user why they were signed out.
    const reason = await SessionService.revokedReason(payload.sid, payload.id).catch(() => null);
    throw reason === 'replaced_by_new_login' ? sessionReplacedError() : sessionRevokedError();
  }
  return payload;
}

const authenticateHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Already authenticated earlier in this same request (e.g. a router-level
    // authenticate + feature gate, then the per-route authenticate): don't repeat
    // the token check and user lookup.
    if (req.user) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.cookies?.accessToken;

    if (!token) {
      throw UnauthorizedError('No token provided');
    }

    const payload = await verifyAccessToken(token);

    // A super_admin's own row lives in exactly one "home" tenant, but their JWT's
    // tenantId may point at whichever tenant they're currently acting in (set by
    // POST /auth/switch-tenant) — so for that role, look the user up by id alone
    // and trust the token's tenantId as the active scope, rather than requiring
    // it to match the stored tenant_id like every other role does.
    const users = await DatabaseService.query<{
      id: number;
      tenant_id: number;
      email: string;
      display_name: string;
      avatar_url: string | null;
      role: string;
      enterprise_id: number;
      subsidiary_id: number | null;
      direction_id: number;
      service_id: number;
      is_active: boolean;
    }>(
      `SELECT id, tenant_id, email, display_name, avatar_url, role, enterprise_id, subsidiary_id, direction_id, service_id, is_active
       FROM users WHERE id = @id AND deleted_at IS NULL AND (tenant_id = @tenantId OR role = 'super_admin')`,
      { id: payload.id, tenantId: payload.tenantId }
    );

    if (users.length === 0 || !users[0].is_active) {
      throw UnauthorizedError('User not found or inactive');
    }

    const user = users[0];
    const isSuperAdmin = user.role === 'super_admin';
    req.user = {
      id: user.id,
      tenantId: isSuperAdmin ? payload.tenantId : user.tenant_id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      role: user.role,
      enterpriseId: isSuperAdmin ? undefined : user.enterprise_id,
      subsidiaryId: isSuperAdmin || !user.subsidiary_id ? undefined : user.subsidiary_id,
      directionId: isSuperAdmin ? undefined : user.direction_id,
      serviceId: isSuperAdmin ? undefined : user.service_id,
    };

    req.sessionId = payload.sid;

    // Override tenant from token if not set
    if (!req.tenantId) {
      req.tenantId = user.tenant_id;
    }

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
};

export const authenticate = (req: any, res: any, next: any) => {
  return authenticateHandler(req as AuthRequest, res, next);
};

// Role hierarchy — exported so routes/services that need to compare two users'
// levels (e.g. "can only view subordinates") share this single source of truth
// instead of re-declaring the ranking.
export const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 6,
  admin: 5,
  director: 4,
  manager: 3,
  supervisor: 2,
  agent: 1,
  // Same permission level as agent — external contractors / interns, tracked
  // as distinct types for reporting/organizational purposes only.
  externe: 1,
  stagiaire: 1,
};

export const authorize = (...allowedRoles: string[]) => {
  return (req: any, res: any, next: any): void => {
    req = req as AuthRequest;
    if (!req.user) {
      return next(UnauthorizedError('Authentication required'));
    }

    const userRole = req.user.role;
    const userRoleLevel = ROLE_HIERARCHY[userRole] || 0;

    // A role listed in ROLE_HIERARCHY grants access to itself and anything ranked
    // below it. A role NOT in ROLE_HIERARCHY (e.g. one not wired up yet) only
    // grants access via an exact match — it must never fall back to a "required
    // level" of 0, which would silently satisfy userRoleLevel >= 0 for every role.
    const isAllowed = allowedRoles.some((role) => {
      if (!(role in ROLE_HIERARCHY)) return userRole === role;
      return userRoleLevel >= ROLE_HIERARCHY[role];
    });

    if (!isAllowed) {
      return next(ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};

// Check if user can access resource in their organizational scope
export const authorizeScope = (scopeField: 'enterpriseId' | 'directionId' | 'serviceId') => {
  return (req: any, res: any, next: any): void => {
    req = req as AuthRequest;
    if (!req.user) {
      return next(UnauthorizedError('Authentication required'));
    }

    // Admins (and super admins) can access everything
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
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
        return next(ForbiddenError('Access denied to this organizational scope'));
      }
    }

    next();
  };
};

const optionalAuthHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.cookies?.accessToken;

    if (token) {
      const payload = jwt.verify(token, config.jwt.secret) as UserPayload;
      req.user = payload;
    }
    next();
  } catch {
    // Continue without user
    next();
  }
};

export const optionalAuth = (req: any, res: any, next: any) => {
  return optionalAuthHandler(req as AuthRequest, res, next);
};
