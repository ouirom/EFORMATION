import { config } from '../config';
import { DatabaseService } from './database.service';

export interface ResolvedLiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

// Per-tenant LiveKit credentials, built from DB settings (or env fallback) and cached
// until invalidated -- mirrors NotificationService's emailTransporterCache/getEmailConfig.
const liveKitConfigCache = new Map<number, ResolvedLiveKitConfig | null>();

export class LiveKitService {
  /**
   * Resolve LiveKit credentials for a tenant: its own configured settings if
   * present and enabled, otherwise the env-configured defaults. Cached per
   * tenant until invalidateLiveKitSettingsCache() is called.
   */
  static async getLiveKitConfig(tenantId: number): Promise<ResolvedLiveKitConfig | null> {
    if (liveKitConfigCache.has(tenantId)) {
      return liveKitConfigCache.get(tenantId)!;
    }

    const rows = await DatabaseService.query<any>(
      'SELECT * FROM livekit_settings WHERE tenant_id = @tenantId',
      { tenantId }
    );
    const settings = rows[0];

    let resolved: ResolvedLiveKitConfig | null = null;

    if (settings?.enabled && settings.url && settings.api_key && settings.api_secret) {
      resolved = { url: settings.url, apiKey: settings.api_key, apiSecret: settings.api_secret };
    } else if (config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret) {
      resolved = { url: config.livekit.url, apiKey: config.livekit.apiKey, apiSecret: config.livekit.apiSecret };
    }

    liveKitConfigCache.set(tenantId, resolved);
    return resolved;
  }

  /**
   * Drop the cached config for a tenant so the next token request re-reads its settings from the DB.
   */
  static invalidateLiveKitSettingsCache(tenantId: number): void {
    liveKitConfigCache.delete(tenantId);
  }
}
