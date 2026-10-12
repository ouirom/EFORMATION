import crypto from 'crypto';
import { DatabaseService } from './database.service';
import { db } from '../database/db-helpers';
import { AuditService } from './audit.service';
import { ApiError } from '../middleware/error.middleware';
import { normalizeIp } from '../utils/clientInfo';
import { logger } from '../utils/logger';

/** Expired/revoked sessions are kept this long (device history, new-device rule), then purged. */
export const SESSION_HISTORY_DAYS = 90;

/**
 * Two tabs of the same browser can refresh at the same moment with the same
 * refresh token: the second one arrives after the first rotated it. Within this
 * window the replaced token still gets a new access token (but no new refresh
 * token -- the tab keeps the one the other tab stored); past it, presenting a
 * replaced token can only mean it was copied, and the whole session is revoked.
 */
const ROTATION_GRACE_SECONDS = 30;

// authenticate() checks the session on every request; a valid answer is reused
// this long. A revoke in this process drops the entry at once; with several
// backend instances another instance may accept the session for up to this long.
const ACTIVE_CACHE_TTL_MS = 15_000;
// last_used_at is written at most this often per session.
const TOUCH_INTERVAL_MS = 60_000;

const activeCache = new Map<string, { userId: number; until: number }>();
const lastTouch = new Map<string, number>();

export type AuthMethod = 'password' | 'ldap' | 'sso_azure_ad' | 'sso_google';

export type RevokeReason =
  | 'logout'
  | 'user_revoked'
  | 'others_revoked'
  | 'admin_force_logout'
  | 'password_changed'
  | 'password_reset'
  | 'reuse_detected'
  | 'not_me'
  | 'replaced_by_new_login';

export interface SessionContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface SessionRow {
  id: number;
  sid: string;
  auth_method: string;
  user_agent: string | null;
  ip: string | null;
  created_at: Date;
  last_used_at: Date;
  expires_at: Date;
}

export type RotationResult = { outcome: 'rotated'; jti: string } | { outcome: 'grace' };

export function hashJti(jti: string): string {
  return crypto.createHash('sha256').update(jti).digest('hex');
}

/** 401 SESSION_REVOKED: the web app then signs out cleanly instead of retrying. */
export function sessionRevokedError(): ApiError {
  return new ApiError('Session expired or revoked', 401, 'SESSION_REVOKED');
}

/**
 * 401 SESSION_REPLACED: the session was closed because the account signed in on
 * another device (one session per user). The web app signs out with a banner
 * saying so instead of the generic "session expired".
 */
export function sessionReplacedError(): ApiError {
  return new ApiError('Signed in on another device', 401, 'SESSION_REPLACED');
}

function forgetUser(userId: number, exceptSid?: string): void {
  for (const [sid, entry] of activeCache) {
    if (entry.userId === userId && sid !== exceptSid) activeCache.delete(sid);
  }
}

export class SessionService {
  static newJti(): string {
    return crypto.randomBytes(24).toString('base64url');
  }

  /** Opens a session; the caller signs the tokens with the returned sid/jti. */
  static async create(input: {
    tenantId: number;
    userId: number;
    authMethod: AuthMethod;
    expiresInSeconds: number;
  } & SessionContext): Promise<{ sid: string; jti: string }> {
    const sid = crypto.randomUUID();
    const jti = this.newJti();
    // Inlined: a validated integer, and pg can't type a parameter only multiplied by an interval.
    const seconds = Math.max(1, Math.trunc(input.expiresInSeconds));
    await DatabaseService.execute(
      `INSERT INTO user_sessions (sid, tenant_id, user_id, refresh_jti_hash, auth_method, user_agent, ip, expires_at)
       VALUES (@sid, @tenantId, @userId, @jtiHash, @authMethod, @userAgent, @ip, ${db.dateAdd('second', String(seconds), db.now())})`,
      {
        sid,
        tenantId: input.tenantId,
        userId: input.userId,
        jtiHash: hashJti(jti),
        authMethod: input.authMethod,
        userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
        ip: normalizeIp(input.ip),
      }
    );
    activeCache.set(sid, { userId: input.userId, until: Date.now() + ACTIVE_CACHE_TTL_MS });
    return { sid, jti };
  }

  /**
   * Refresh-token rotation. The presented jti must be the session's current one:
   * it is then replaced by a new one. A replaced jti presented again (outside
   * the short grace window) means the token was stolen and replayed: the whole
   * session is revoked, for the thief and the legitimate user alike.
   */
  static async rotate(sid: string, userId: number, presentedJti: string, context: SessionContext = {}): Promise<RotationResult> {
    const jti = this.newJti();
    const presentedHash = hashJti(presentedJti);
    const result = await DatabaseService.execute(
      `UPDATE user_sessions
       SET previous_jti_hash = refresh_jti_hash, refresh_jti_hash = @newHash,
           rotated_at = ${db.now()}, last_used_at = ${db.now()}, ip = COALESCE(@ip, ip)
       WHERE sid = @sid AND user_id = @userId AND refresh_jti_hash = @presentedHash
         AND revoked_at IS NULL AND expires_at > ${db.now()}`,
      { sid, userId, newHash: hashJti(jti), presentedHash, ip: normalizeIp(context.ip) }
    );
    if (Number(result?.rowsAffected) === 1) {
      return { outcome: 'rotated', jti };
    }

    const rows = await DatabaseService.query<{
      tenant_id: number;
      user_id: number;
      previous_jti_hash: string | null;
      revoked_at: Date | null;
      revoked_reason?: string | null;
      alive: number;
      since_rotation: number | null;
    }>(
      `SELECT tenant_id, user_id, previous_jti_hash, revoked_at, revoked_reason,
              CASE WHEN expires_at > ${db.now()} THEN 1 ELSE 0 END AS alive,
              ${db.diffSeconds('rotated_at', db.now())} AS since_rotation
       FROM user_sessions WHERE sid = @sid`,
      { sid }
    );
    const session = rows[0];
    if (session && Number(session.user_id) === Number(userId) && session.revoked_reason === 'replaced_by_new_login') {
      throw sessionReplacedError();
    }
    if (!session || Number(session.user_id) !== Number(userId) || session.revoked_at || !Number(session.alive)) {
      throw sessionRevokedError();
    }

    if (
      session.previous_jti_hash === presentedHash &&
      session.since_rotation !== null &&
      Number(session.since_rotation) <= ROTATION_GRACE_SECONDS
    ) {
      return { outcome: 'grace' };
    }

    await this.revoke(sid, 'reuse_detected');
    await AuditService.log(Number(session.tenant_id), userId, 'SESSION_REUSE_DETECTED', 'users', userId, {
      sid,
      ip: normalizeIp(context.ip),
      userAgent: context.userAgent,
    });
    logger.warn('Refresh token reuse detected: session revoked', { userId, sid });
    throw sessionRevokedError();
  }

  /**
   * A new refresh jti for a live session, without presenting the current one
   * (the caller authenticated with the session's access token -- e.g. a
   * super_admin switching tenant). The replaced jti gets the usual grace window.
   */
  static async reissue(sid: string, userId: number): Promise<string> {
    const jti = this.newJti();
    const result = await DatabaseService.execute(
      `UPDATE user_sessions
       SET previous_jti_hash = refresh_jti_hash, refresh_jti_hash = @newHash, rotated_at = ${db.now()}
       WHERE sid = @sid AND user_id = @userId AND revoked_at IS NULL AND expires_at > ${db.now()}`,
      { sid, userId, newHash: hashJti(jti) }
    );
    if (Number(result?.rowsAffected) !== 1) {
      throw sessionRevokedError();
    }
    return jti;
  }

  /** Whether `sid` is a live (not revoked, not expired) session of `userId`. Cached briefly. */
  static async isActive(sid: string, userId: number): Promise<boolean> {
    const cached = activeCache.get(sid);
    if (cached && cached.until > Date.now()) {
      return cached.userId === Number(userId);
    }
    activeCache.delete(sid);

    const rows = await DatabaseService.query<{ user_id: number }>(
      `SELECT user_id FROM user_sessions
       WHERE sid = @sid AND revoked_at IS NULL AND expires_at > ${db.now()}`,
      { sid }
    );
    if (!rows[0] || Number(rows[0].user_id) !== Number(userId)) return false;

    activeCache.set(sid, { userId: Number(userId), until: Date.now() + ACTIVE_CACHE_TTL_MS });
    if ((lastTouch.get(sid) ?? 0) + TOUCH_INTERVAL_MS < Date.now()) {
      lastTouch.set(sid, Date.now());
      DatabaseService.execute(`UPDATE user_sessions SET last_used_at = ${db.now()} WHERE sid = @sid`, { sid }).catch(
        (error) => logger.warn('Failed to update session activity', { error })
      );
    }
    return true;
  }

  /** Revokes one session (no-op if already revoked). */
  static async revoke(sid: string, reason: RevokeReason): Promise<boolean> {
    activeCache.delete(sid);
    const result = await DatabaseService.execute(
      `UPDATE user_sessions SET revoked_at = ${db.now()}, revoked_reason = @reason
       WHERE sid = @sid AND revoked_at IS NULL`,
      { sid, reason }
    );
    return Number(result?.rowsAffected) > 0;
  }

  /** Revokes one of `userId`'s sessions by its public id; returns its sid, or null if none matched. */
  static async revokeOwn(userId: number, sessionId: number, reason: RevokeReason): Promise<string | null> {
    const rows = await DatabaseService.query<{ sid: string }>(
      `SELECT sid FROM user_sessions WHERE id = @sessionId AND user_id = @userId AND revoked_at IS NULL`,
      { sessionId, userId }
    );
    if (!rows[0]) return null;
    await this.revoke(rows[0].sid, reason);
    return rows[0].sid;
  }

  /** Revokes every live session of a user, except `exceptSid` (the caller's own). Returns how many. */
  static async revokeAllForUser(userId: number, reason: RevokeReason, exceptSid?: string | null): Promise<number> {
    forgetUser(userId, exceptSid ?? undefined);
    const result = await DatabaseService.execute(
      `UPDATE user_sessions SET revoked_at = ${db.now()}, revoked_reason = @reason
       WHERE user_id = @userId AND revoked_at IS NULL${exceptSid ? ' AND sid <> @exceptSid' : ''}`,
      { userId, reason, exceptSid: exceptSid ?? null }
    );
    return Number(result?.rowsAffected) || 0;
  }

  /**
   * One session per user: closes the user's live sessions opened BEFORE
   * `keepSid` (the one a login just created) and returns them. Only older ones,
   * so two logins racing each other can't close each other's session: the most
   * recent login wins. A token refresh never comes here.
   */
  static async revokeOlderThan(
    userId: number,
    keepSid: string
  ): Promise<Array<{ sid: string; ip: string | null; user_agent: string | null }>> {
    const older = await DatabaseService.query<{ sid: string; ip: string | null; user_agent: string | null }>(
      `SELECT sid, ip, user_agent FROM user_sessions
       WHERE user_id = @userId AND revoked_at IS NULL AND expires_at > ${db.now()} AND sid <> @keepSid
         AND id < (SELECT id FROM user_sessions WHERE sid = @keepSid)`,
      { userId, keepSid }
    );
    const revoked: typeof older = [];
    for (const session of older) {
      if (await this.revoke(session.sid, 'replaced_by_new_login')) revoked.push(session);
    }
    return revoked;
  }

  /** Why a session is no longer live: its revoke reason, or null (expired, unknown, or another user's). */
  static async revokedReason(sid: string, userId: number): Promise<string | null> {
    const rows = await DatabaseService.query<{ user_id: number; revoked_reason: string | null }>(
      `SELECT user_id, revoked_reason FROM user_sessions WHERE sid = @sid AND revoked_at IS NOT NULL`,
      { sid }
    );
    if (!rows[0] || Number(rows[0].user_id) !== Number(userId)) return null;
    return rows[0].revoked_reason ?? null;
  }

  /** A user's live sessions, most recently used first. */
  static async listActive(userId: number): Promise<SessionRow[]> {
    return DatabaseService.query<SessionRow>(
      `SELECT id, sid, auth_method, user_agent, ip, created_at, last_used_at, expires_at
       FROM user_sessions
       WHERE user_id = @userId AND revoked_at IS NULL AND expires_at > ${db.now()}
       ORDER BY last_used_at DESC`,
      { userId }
    );
  }

  /** Daily job: forgets sessions that ended (expired or revoked) more than SESSION_HISTORY_DAYS ago. */
  static async purgeOld(): Promise<number> {
    const cutoff = db.dateAdd('day', String(-SESSION_HISTORY_DAYS), db.now());
    const result = await DatabaseService.execute(
      `DELETE FROM user_sessions WHERE expires_at < ${cutoff} OR revoked_at < ${cutoff}`
    );
    const purged = Number(result?.rowsAffected) || 0;
    if (purged > 0) logger.info(`Purged ${purged} old login session(s)`);
    return purged;
  }

  /** Test helper. */
  static clearCache(): void {
    activeCache.clear();
    lastTouch.clear();
  }
}
