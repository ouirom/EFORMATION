import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db, IS_PG } from '../database/db-helpers';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { normalizeIp, parseUserAgent } from '../utils/clientInfo';

const router = Router();

/**
 * Administration > Connexions: the sign-in side of the activity log, for
 * admins of the organization only. Every query is scoped to the caller's tenant.
 */
router.use(authenticate, authorize('admin'));

/** Sign-in related audit actions, by the "Résultat" filter of the screen. */
export const LOGIN_EVENT_GROUPS: Record<string, string[]> = {
  success: ['USER_LOGIN', 'LDAP_LOGIN', 'SSO_LOGIN_AZURE_AD', 'SSO_LOGIN_GOOGLE'],
  failure: ['LOGIN_FAILED', '2FA_FAILED', 'LOGIN_PASSWORD_EXPIRED'],
  lockout: ['ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED'],
  twoFactor: ['2FA_CHALLENGE_SENT', '2FA_SUCCESS', '2FA_FAILED', '2FA_ENABLED', '2FA_DISABLED'],
  session: [
    'USER_LOGOUT',
    'SESSION_REVOKED',
    'SESSIONS_REVOKED_OTHERS',
    'USER_FORCE_LOGOUT',
    'SESSION_REUSE_DETECTED',
    'SESSION_REPLACED',
    'NEW_DEVICE_LOGIN',
    'NOT_ME_REPORTED',
  ],
};
const ALL_LOGIN_EVENTS = [...new Set(Object.values(LOGIN_EVENT_GROUPS).flat())];
/** What counts towards "IP suspectes". */
const FAILURE_EVENTS = ['LOGIN_FAILED', '2FA_FAILED'];

// Constant identifiers only (never user input), inlined as SQL string literals.
const sqlList = (values: string[]) => values.map((v) => `'${v}'`).join(', ');

// metadata is JSON text; the IP is pulled out without casting the whole column
// (a single malformed legacy row must not break the screen).
const METADATA_IP = IS_PG ? `substring(a.metadata from '"ip":"([^"]+)"')` : `JSON_VALUE(a.metadata, '$.ip')`;

const PERIOD_HOURS: Record<string, number> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, '90d': 24 * 90 };

function parseMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  try {
    return (db.parseJsonColumn<Record<string, any>>(raw) as Record<string, any>) || {};
  } catch {
    return {};
  }
}

/**
 * @route GET /api/v1/security/login-events
 * @query search (name/email), period (24h|7d|30d|90d), result (success|failure|lockout|twoFactor|session), page, limit
 */
router.get('/login-events', async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req, { defaultLimit: 25, maxLimit: 100 });
    const result = String(req.query.result || '');
    const actions = LOGIN_EVENT_GROUPS[result] ?? ALL_LOGIN_EVENTS;
    const hours = PERIOD_HOURS[String(req.query.period || '')] ?? PERIOD_HOURS['7d'];
    const search = String(req.query.search || '').trim().toLowerCase();

    const where = [
      'a.tenant_id = @tenantId',
      `a.action IN (${sqlList(actions)})`,
      `a.created_at > ${db.dateAdd('hour', String(-hours), db.now())}`,
    ];
    if (search) where.push('(LOWER(subj.email) LIKE @search OR LOWER(subj.display_name) LIKE @search)');
    const params = { tenantId: req.user!.tenantId, search: `%${search}%`, offset, limit };
    const from = `FROM audit_logs a
       LEFT JOIN users subj ON subj.id = a.entity_id AND a.entity = 'users'
       LEFT JOIN users actor ON actor.id = a.user_id
       WHERE ${where.join(' AND ')}`;

    const [countRows, rows] = await Promise.all([
      DatabaseService.query<{ total: number }>(`SELECT COUNT(*) AS total ${from}`, params),
      DatabaseService.query<any>(
        `SELECT a.id, a.action, a.created_at, a.metadata, a.user_id AS actor_id, actor.display_name AS actor_name,
                subj.id AS subject_id, subj.display_name AS subject_name, subj.email AS subject_email, subj.role AS subject_role
         ${from}
         ORDER BY a.created_at DESC, a.id DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        params
      ),
    ]);

    res.json({
      success: true,
      data: rows.map((row) => {
        const metadata = parseMetadata(row.metadata);
        const group = Object.keys(LOGIN_EVENT_GROUPS).find((key) => LOGIN_EVENT_GROUPS[key].includes(row.action));
        const device = metadata.userAgent ? parseUserAgent(metadata.userAgent) : null;
        return {
          id: Number(row.id),
          action: row.action,
          group,
          createdAt: row.created_at,
          subject: row.subject_id
            ? { id: Number(row.subject_id), name: row.subject_name, email: row.subject_email, role: row.subject_role }
            : null,
          // Someone else did it (an admin forcing a sign-out, unlocking...).
          actor: row.actor_id && Number(row.actor_id) !== Number(row.subject_id) ? { id: Number(row.actor_id), name: row.actor_name } : null,
          reason: metadata.reason ?? null,
          ip: normalizeIp(metadata.ip) ?? null,
          browser: device ? `${device.browser} / ${device.os}` : metadata.browser ? `${metadata.browser} / ${metadata.os}` : null,
          details: {
            provider: metadata.provider,
            minutes: metadata.minutes,
            remainingAttempts: metadata.remainingAttempts,
            closedSessions: metadata.closedSessions ?? metadata.revoked,
            purpose: metadata.purpose,
            twoFactor: metadata.twoFactor,
          },
        };
      }),
      meta: buildPaginationMeta(Number(countRows[0]?.total) || 0, page, limit),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/security/suspicious-ips
 * @desc IPs with at least `threshold` failed sign-ins (wrong password, unknown
 * account, wrong 2FA code...) in the last `hours` hours (defaults: 5 in 24 h).
 */
router.get('/suspicious-ips', async (req: AuthRequest, res, next) => {
  try {
    const hours = Math.min(Math.max(parseInt(String(req.query.hours), 10) || 24, 1), 24 * 30);
    const threshold = Math.min(Math.max(parseInt(String(req.query.threshold), 10) || 5, 1), 1000);
    const rows = await DatabaseService.query<{ ip: string; failures: number; accounts: number; last_at: Date }>(
      `SELECT ip, COUNT(*) AS failures, COUNT(DISTINCT entity_id) AS accounts, MAX(created_at) AS last_at
       FROM (
         SELECT ${METADATA_IP} AS ip, a.entity_id, a.created_at
         FROM audit_logs a
         WHERE a.tenant_id = @tenantId AND a.action IN (${sqlList(FAILURE_EVENTS)})
           AND a.created_at > ${db.dateAdd('hour', String(-hours), db.now())}
       ) failures
       WHERE ip IS NOT NULL
       GROUP BY ip
       HAVING COUNT(*) >= @threshold
       ORDER BY COUNT(*) DESC`,
      { tenantId: req.user!.tenantId, threshold }
    );
    res.json({
      success: true,
      data: rows.map((row) => ({
        ip: normalizeIp(row.ip),
        failures: Number(row.failures),
        accounts: Number(row.accounts),
        lastAt: row.last_at,
      })),
      meta: { hours, threshold },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
