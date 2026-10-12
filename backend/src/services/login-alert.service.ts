import jwt from 'jsonwebtoken';
import { config } from '../config';
import { DatabaseService } from './database.service';
import { db } from '../database/db-helpers';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import { TenantSettingsService } from './tenant-settings.service';
import { SESSION_HISTORY_DAYS, SessionContext } from './session.service';
import { ipNetwork, normalizeIp, parseUserAgent } from '../utils/clientInfo';
import { logger } from '../utils/logger';

/** The "Ce n'était pas moi" link of a new sign-in alert stays valid this long. */
export const NOT_ME_TOKEN_TTL = '24h';

/**
 * A device is "known" when, in the last SESSION_HISTORY_DAYS days, the account
 * already signed in with the same browser family, the same OS and from the same
 * network (IPv4 /24, IPv6 /64). Anything else is new -- except when the account
 * has no recorded session at all (its very first sign-in, or the first one since
 * sessions exist): that one only sets the baseline.
 */
export function isKnownDevice(
  current: SessionContext,
  previous: { user_agent: string | null; ip: string | null }[]
): boolean {
  const ua = parseUserAgent(current.userAgent);
  const network = ipNetwork(current.ip);
  return previous.some((session) => {
    const seen = parseUserAgent(session.user_agent);
    return seen.browser === ua.browser && seen.os === ua.os && ipNetwork(session.ip) === network;
  });
}

export class LoginAlertService {
  /**
   * Called just before a sign-in opens its session: whether this device is new
   * for the account (and the organization wants the alert).
   */
  static async isNewDevice(tenantId: number, userId: number, context: SessionContext): Promise<boolean> {
    if (!(await TenantSettingsService.get(tenantId)).newDeviceAlerts) return false;

    const history = await DatabaseService.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = @userId',
      { userId }
    );
    if (!Number(history[0]?.n)) return false;

    const recent = await DatabaseService.query<{ user_agent: string | null; ip: string | null }>(
      `SELECT user_agent, ip FROM user_sessions
       WHERE user_id = @userId AND created_at > ${db.dateAdd('day', String(-SESSION_HISTORY_DAYS), db.now())}`,
      { userId }
    );
    return !isKnownDevice(context, recent);
  }

  /**
   * « Nouvelle connexion à votre compte »: when, which browser, from which IP,
   * and a single-use « Ce n'était pas moi » link (24 h) that closes every
   * session and leads to choosing a new password. Best effort, never blocks the sign-in.
   */
  static async sendNewDeviceAlert(userId: number, context: SessionContext): Promise<void> {
    const users = await DatabaseService.query<{
      id: number;
      tenant_id: number;
      email: string;
      display_name: string | null;
      token_version: number;
    }>('SELECT id, tenant_id, email, display_name, token_version FROM users WHERE id = @userId', { userId });
    const user = users[0];
    if (!user) return;

    const tenantId = Number(user.tenant_id);
    const { timezone } = await TenantSettingsService.get(tenantId);
    const device = parseUserAgent(context.userAgent);
    const ip = normalizeIp(context.ip) || 'inconnue';
    const when = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone }).format(new Date());

    // tokenVersion makes the link single-use: reporting bumps it, and any later
    // password reset or forced sign-out voids it too.
    const token = jwt.sign({ type: 'not_me', userId, tokenVersion: user.token_version }, config.jwt.secret, { expiresIn: NOT_ME_TOKEN_TTL });
    const notMeUrl = `${config.frontendUrl}/security/not-me?token=${encodeURIComponent(token)}`;

    // Recorded whether or not the email goes out (Administration > Connexions).
    await AuditService.log(tenantId, userId, 'NEW_DEVICE_LOGIN', 'users', userId, {
      ip,
      browser: device.browser,
      os: device.os,
    });

    // Same as the reset link: local development usually has no SMTP.
    if (config.nodeEnv === 'development') {
      logger.warn(`[DEV ONLY] Lien « Ce n'était pas moi » pour l'utilisateur ${userId} : ${notMeUrl}`);
    }

    await NotificationService.sendSecurityEmail(
      tenantId,
      user.email,
      'Nouvelle connexion à votre compte',
      `Bonjour${user.display_name ? ` ${user.display_name}` : ''},\n\n` +
        `Une connexion à votre compte E-Formation vient d'avoir lieu depuis un appareil que nous ne connaissions pas :\n\n` +
        `- Date : ${when}\n- Navigateur : ${device.browser} sur ${device.os}\n- Adresse IP : ${ip}\n\n` +
        `Si c'était vous, vous n'avez rien à faire.\n\n` +
        `Si ce n'était pas vous, cliquez sur « Ce n'était pas moi » (lien valable 24 heures) : toutes vos sessions seront fermées et vous choisirez un nouveau mot de passe.\n\n${notMeUrl}`,
      notMeUrl
    );
  }

  /** « Compte verrouillé »: too many wrong passwords, with the time the lock ends. */
  static async sendLockedAlert(user: { id: number; tenant_id: number; email: string; display_name?: string | null }, minutes: number): Promise<void> {
    const tenantId = Number(user.tenant_id);
    const { timezone } = await TenantSettingsService.get(tenantId);
    const until = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: timezone }).format(
      new Date(Date.now() + minutes * 60_000)
    );
    await NotificationService.sendSecurityEmail(
      tenantId,
      user.email,
      'Votre compte E-Formation a été verrouillé',
      `Bonjour${user.display_name ? ` ${user.display_name}` : ''},\n\n` +
        `Après plusieurs mots de passe erronés, votre compte a été verrouillé jusqu'au ${until}.\n\n` +
        `Si c'était vous, patientez ou réinitialisez votre mot de passe. Si ce n'était pas vous, quelqu'un essaie peut-être d'accéder à votre compte : choisissez un nouveau mot de passe dès que possible et prévenez votre administrateur.`,
      `${config.frontendUrl}/forgot-password`
    );
  }
}

/** Fire-and-forget wrapper used by sign-in paths: an alert failure must never fail a login. */
export function alertInBackground(task: Promise<unknown>, what: string): void {
  task.catch((error) => logger.error(`Failed to send the ${what} alert`, { error: (error as Error)?.message }));
}
