import { NextFunction, Response } from 'express';
import { DatabaseService } from './database.service';
import { ApiError } from '../middleware/error.middleware';
import type { AuthRequest } from '../middleware/auth.middleware';

/**
 * Platform settings of a tenant (Administration > Organisation), with the same
 * defaults the organization page shows when no tenant_settings row exists yet.
 * This is the single place the rest of the backend reads them from, so a
 * toggle in the admin page actually changes behaviour.
 */
export interface TenantPlatformSettings {
  allowSelfRegistration: boolean;
  defaultLanguage: string;
  timezone: string;
  enableNotifications: boolean;
  enableChat: boolean;
  enableLiveSessions: boolean;
  maxUsersPerGroup: number;
  /** Default certificate validity, in days. */
  certificateValidity: number;
}

export const DEFAULT_PLATFORM_SETTINGS: TenantPlatformSettings = {
  allowSelfRegistration: true,
  defaultLanguage: 'fr',
  timezone: 'Europe/Paris',
  enableNotifications: true,
  enableChat: true,
  enableLiveSessions: true,
  maxUsersPerGroup: 50,
  certificateValidity: 365,
};

export type TenantFeature = 'chat' | 'liveSessions';

const FEATURE_FLAG: Record<TenantFeature, keyof TenantPlatformSettings> = {
  chat: 'enableChat',
  liveSessions: 'enableLiveSessions',
};

// Settings are read on many requests (every chat/live call); a short cache keeps
// that to one query per tenant per few seconds. Writes invalidate it immediately.
const CACHE_TTL_MS = 10_000;
const cache = new Map<number, { value: TenantPlatformSettings; expires: number }>();

function bool(value: unknown, fallback: boolean): boolean {
  return value === null || value === undefined ? fallback : Boolean(value);
}

export class TenantSettingsService {
  static async get(tenantId: number): Promise<TenantPlatformSettings> {
    const cached = cache.get(tenantId);
    if (cached && cached.expires > Date.now()) return cached.value;

    const rows = await DatabaseService.query<any>(
      `SELECT allow_self_registration, default_language, timezone, enable_notifications,
              enable_chat, enable_live_sessions, max_users_per_group, certificate_validity
       FROM tenant_settings WHERE tenant_id = @tenantId`,
      { tenantId }
    );
    const row = rows[0];
    const d = DEFAULT_PLATFORM_SETTINGS;
    const value: TenantPlatformSettings = row
      ? {
          allowSelfRegistration: bool(row.allow_self_registration, d.allowSelfRegistration),
          defaultLanguage: row.default_language || d.defaultLanguage,
          timezone: row.timezone || d.timezone,
          enableNotifications: bool(row.enable_notifications, d.enableNotifications),
          enableChat: bool(row.enable_chat, d.enableChat),
          enableLiveSessions: bool(row.enable_live_sessions, d.enableLiveSessions),
          maxUsersPerGroup: Number(row.max_users_per_group) || d.maxUsersPerGroup,
          certificateValidity: Number(row.certificate_validity) || d.certificateValidity,
        }
      : { ...d };

    cache.set(tenantId, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  }

  static invalidate(tenantId: number): void {
    cache.delete(tenantId);
  }

  /** Test helper: forget every cached tenant. */
  static clearCache(): void {
    cache.clear();
  }

  static async isFeatureEnabled(tenantId: number, feature: TenantFeature): Promise<boolean> {
    return Boolean((await this.get(tenantId))[FEATURE_FLAG[feature]]);
  }
}

/**
 * Route guard: 403 FEATURE_DISABLED when the tenant turned the module off in
 * Administration > Organisation. Mount after `authenticate`.
 */
export function requireFeature(feature: TenantFeature) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!(await TenantSettingsService.isFeatureEnabled(req.user!.tenantId, feature))) {
        throw new ApiError(`The ${feature} module is disabled for this organization`, 403, 'FEATURE_DISABLED');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
