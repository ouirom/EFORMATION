import { DatabaseService } from './database.service';

export interface ResolvedRecordingStorageConfig {
  bucket: string;
  region: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
}

// Per-tenant S3-compatible storage credentials for LiveKit Egress recordings.
// Unlike LiveKitService there is no global env fallback: a recording bucket is
// inherently tenant-specific data (nobody wants another tenant's recordings
// landing in a shared bucket by default), so a tenant must explicitly configure
// and enable its own. Cached until invalidateRecordingStorageCache() is called.
const recordingStorageCache = new Map<number, ResolvedRecordingStorageConfig | null>();

export class RecordingService {
  static async getRecordingStorageConfig(tenantId: number): Promise<ResolvedRecordingStorageConfig | null> {
    if (recordingStorageCache.has(tenantId)) {
      return recordingStorageCache.get(tenantId)!;
    }

    const rows = await DatabaseService.query<any>(
      'SELECT * FROM recording_storage_settings WHERE tenant_id = @tenantId',
      { tenantId }
    );
    const settings = rows[0];

    let resolved: ResolvedRecordingStorageConfig | null = null;
    if (settings?.enabled && settings.bucket && settings.access_key && settings.secret_key) {
      resolved = {
        bucket: settings.bucket,
        region: settings.region || '',
        endpoint: settings.endpoint || '',
        accessKey: settings.access_key,
        secretKey: settings.secret_key,
      };
    }

    recordingStorageCache.set(tenantId, resolved);
    return resolved;
  }

  static invalidateRecordingStorageCache(tenantId: number): void {
    recordingStorageCache.delete(tenantId);
  }
}
