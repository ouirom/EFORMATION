import crypto from 'crypto';
import { config } from '../config';
import { DatabaseService } from './database.service';
import { db } from '../database/db-helpers';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import { ApiError } from '../middleware/error.middleware';
import { TwoFactorMode } from './tenant-settings.service';
import { normalizeIp } from '../utils/clientInfo';
import { logger } from '../utils/logger';
import type { AuthMethod, SessionContext } from './session.service';

/** A code is valid this long after it was (re)sent. */
export const CODE_TTL_SECONDS = 10 * 60;
/** Wrong or right, a challenge accepts this many codes, then is dead (sign in again). */
export const MAX_ATTEMPTS = 5;
/** "Renvoyer le code" waits this long between two emails... */
export const RESEND_INTERVAL_SECONDS = 60;
/** ...and stops after this many emails for one challenge (the first one included). */
export const MAX_SENDS = 5;

export type ChallengePurpose = 'login' | 'enable';

/** What a sign-in answers instead of tokens while the code is awaited. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  emailHint: string;
  expiresIn: number;
  resendAfter: number;
}

export interface ChallengeRow {
  id: number;
  tenant_id: number;
  user_id: number;
  purpose: ChallengePurpose;
  auth_method: AuthMethod | null;
  portal: string | null;
}

/** Whether a password/LDAP sign-in of this user must also enter an emailed code. */
export function twoFactorApplies(mode: TwoFactorMode, userEnabled: unknown): boolean {
  return mode === 'required' || (mode === 'optional' && Boolean(userEnabled));
}

/** "jane.doe@acme.com" -> "j***@acme.com": enough to recognize the address, not to learn it. */
export function maskEmail(email: string): string {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

// Keyed with the server secret: a leaked table can't be brute-forced offline
// (a 6-digit code has only a million values).
const hashCode = (tokenHash: string, code: string) =>
  crypto.createHmac('sha256', config.jwt.secret).update(`${tokenHash}:${code}`).digest('hex');

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

const challengeError = (message: string, status: number, code: string, details?: any) =>
  new ApiError(message, status, code, details);

export class TwoFactorService {
  /**
   * Creates a challenge and emails its code. `login`: the second step of a
   * sign-in (no session until the code is entered); `enable`: proves the user
   * receives the codes before turning two-step sign-in on.
   */
  static async start(input: {
    tenantId: number;
    userId: number;
    email: string;
    displayName?: string | null;
    purpose: ChallengePurpose;
    authMethod?: AuthMethod | null;
    portal?: string | null;
  } & SessionContext): Promise<TwoFactorChallenge> {
    const challengeToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(challengeToken);
    const code = newCode();

    await DatabaseService.execute(
      `INSERT INTO two_factor_challenges
         (token_hash, tenant_id, user_id, purpose, auth_method, portal, code_hash, expires_at, ip, user_agent)
       VALUES (@tokenHash, @tenantId, @userId, @purpose, @authMethod, @portal, @codeHash,
               ${db.dateAdd('second', String(CODE_TTL_SECONDS), db.now())}, @ip, @userAgent)`,
      {
        tokenHash,
        tenantId: input.tenantId,
        userId: input.userId,
        purpose: input.purpose,
        authMethod: input.authMethod ?? null,
        portal: input.portal ?? null,
        codeHash: hashCode(tokenHash, code),
        ip: normalizeIp(input.ip),
        userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
      }
    );

    this.deliver(input.tenantId, input.userId, input.email, input.displayName, input.purpose, code);
    await AuditService.log(input.tenantId, input.userId, '2FA_CHALLENGE_SENT', 'users', input.userId, {
      purpose: input.purpose,
      ip: normalizeIp(input.ip),
      userAgent: input.userAgent,
    });

    return {
      twoFactorRequired: true,
      challengeToken,
      emailHint: maskEmail(input.email),
      expiresIn: CODE_TTL_SECONDS,
      resendAfter: RESEND_INTERVAL_SECONDS,
    };
  }

  /**
   * Checks a code. Every call uses up one of the MAX_ATTEMPTS (reserved
   * atomically, so parallel guesses can't exceed it); the right code consumes
   * the challenge, which can never be used again.
   */
  static async verify(challengeToken: string, code: string, purpose: ChallengePurpose, context: SessionContext = {}): Promise<ChallengeRow> {
    const tokenHash = sha256(String(challengeToken || ''));
    const rows = await DatabaseService.query<ChallengeRow & {
      code_hash: string;
      attempts: number;
      consumed_at: Date | null;
      alive: number;
    }>(
      `SELECT id, tenant_id, user_id, purpose, auth_method, portal, code_hash, attempts, consumed_at,
              CASE WHEN expires_at > ${db.now()} THEN 1 ELSE 0 END AS alive
       FROM two_factor_challenges WHERE token_hash = @tokenHash AND purpose = @purpose`,
      { tokenHash, purpose }
    );
    const challenge = rows[0];
    if (!challenge || challenge.consumed_at) {
      throw challengeError("Ce code n'est plus valide. Recommencez la connexion.", 400, 'TWO_FACTOR_INVALID_CHALLENGE');
    }
    if (Number(challenge.attempts) >= MAX_ATTEMPTS) {
      throw challengeError('Trop de codes erronés. Recommencez la connexion.', 429, 'TWO_FACTOR_TOO_MANY_ATTEMPTS');
    }
    if (!Number(challenge.alive)) {
      throw challengeError('Ce code a expiré. Demandez-en un nouveau.', 400, 'TWO_FACTOR_EXPIRED');
    }

    const reserved = await DatabaseService.execute(
      `UPDATE two_factor_challenges SET attempts = attempts + 1
       WHERE id = @id AND attempts < @maxAttempts AND consumed_at IS NULL`,
      { id: challenge.id, maxAttempts: MAX_ATTEMPTS }
    );
    if (Number(reserved?.rowsAffected) !== 1) {
      throw challengeError('Trop de codes erronés. Recommencez la connexion.', 429, 'TWO_FACTOR_TOO_MANY_ATTEMPTS');
    }

    const normalized = String(code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized) || !sameHash(hashCode(tokenHash, normalized), challenge.code_hash)) {
      const remainingAttempts = Math.max(0, MAX_ATTEMPTS - (Number(challenge.attempts) + 1));
      await AuditService.log(Number(challenge.tenant_id), Number(challenge.user_id), '2FA_FAILED', 'users', Number(challenge.user_id), {
        purpose,
        remainingAttempts,
        ip: normalizeIp(context.ip),
        userAgent: context.userAgent,
      });
      if (remainingAttempts === 0) {
        throw challengeError('Trop de codes erronés. Recommencez la connexion.', 429, 'TWO_FACTOR_TOO_MANY_ATTEMPTS');
      }
      throw challengeError(
        `Code incorrect (${remainingAttempts} essai${remainingAttempts > 1 ? 's' : ''} restant${remainingAttempts > 1 ? 's' : ''}).`,
        400,
        'TWO_FACTOR_INVALID_CODE',
        { remainingAttempts }
      );
    }

    const consumed = await DatabaseService.execute(
      `UPDATE two_factor_challenges SET consumed_at = ${db.now()} WHERE id = @id AND consumed_at IS NULL`,
      { id: challenge.id }
    );
    if (Number(consumed?.rowsAffected) !== 1) {
      throw challengeError("Ce code n'est plus valide. Recommencez la connexion.", 400, 'TWO_FACTOR_INVALID_CHALLENGE');
    }
    return {
      id: Number(challenge.id),
      tenant_id: Number(challenge.tenant_id),
      user_id: Number(challenge.user_id),
      purpose: challenge.purpose,
      auth_method: challenge.auth_method,
      portal: challenge.portal,
    };
  }

  /** "Renvoyer le code": a new code (the previous one stops working) and a new 10-minute validity. */
  static async resend(challengeToken: string): Promise<{ emailHint: string; expiresIn: number; resendAfter: number }> {
    const tokenHash = sha256(String(challengeToken || ''));
    const rows = await DatabaseService.query<{
      id: number;
      tenant_id: number;
      user_id: number;
      purpose: ChallengePurpose;
      attempts: number;
      send_count: number;
      consumed_at: Date | null;
      since_sent: number;
      email: string;
      display_name: string | null;
    }>(
      `SELECT c.id, c.tenant_id, c.user_id, c.purpose, c.attempts, c.send_count, c.consumed_at,
              ${db.diffSeconds('c.last_sent_at', db.now())} AS since_sent, u.email, u.display_name
       FROM two_factor_challenges c JOIN users u ON u.id = c.user_id
       WHERE c.token_hash = @tokenHash`,
      { tokenHash }
    );
    const challenge = rows[0];
    if (!challenge || challenge.consumed_at) {
      throw challengeError("Ce code n'est plus valide. Recommencez la connexion.", 400, 'TWO_FACTOR_INVALID_CHALLENGE');
    }
    if (Number(challenge.attempts) >= MAX_ATTEMPTS) {
      throw challengeError('Trop de codes erronés. Recommencez la connexion.', 429, 'TWO_FACTOR_TOO_MANY_ATTEMPTS');
    }
    if (Number(challenge.send_count) >= MAX_SENDS) {
      throw challengeError("Trop d'envois pour cette connexion. Recommencez la connexion.", 429, 'TWO_FACTOR_TOO_MANY_SENDS');
    }
    const wait = RESEND_INTERVAL_SECONDS - Math.floor(Number(challenge.since_sent) || 0);
    if (wait > 0) {
      throw challengeError(`Patientez ${wait} s avant de demander un nouveau code.`, 429, 'TWO_FACTOR_RESEND_TOO_SOON', { retryAfter: wait });
    }

    const code = newCode();
    // Conditions repeated so two simultaneous clicks send one email, not two.
    const updated = await DatabaseService.execute(
      `UPDATE two_factor_challenges
       SET code_hash = @codeHash, send_count = send_count + 1, last_sent_at = ${db.now()},
           expires_at = ${db.dateAdd('second', String(CODE_TTL_SECONDS), db.now())}
       WHERE id = @id AND send_count = @sendCount AND consumed_at IS NULL`,
      { id: challenge.id, codeHash: hashCode(tokenHash, code), sendCount: Number(challenge.send_count) }
    );
    if (Number(updated?.rowsAffected) !== 1) {
      throw challengeError('Un code vient déjà d’être envoyé.', 429, 'TWO_FACTOR_RESEND_TOO_SOON', { retryAfter: RESEND_INTERVAL_SECONDS });
    }

    this.deliver(Number(challenge.tenant_id), Number(challenge.user_id), challenge.email, challenge.display_name, challenge.purpose, code);
    return { emailHint: maskEmail(challenge.email), expiresIn: CODE_TTL_SECONDS, resendAfter: RESEND_INTERVAL_SECONDS };
  }

  /** Daily job: challenges are only useful for minutes; keep a day for troubleshooting. */
  static async purgeOld(): Promise<number> {
    const result = await DatabaseService.execute(
      `DELETE FROM two_factor_challenges WHERE created_at < ${db.dateAdd('day', '-1', db.now())}`
    );
    return Number(result?.rowsAffected) || 0;
  }

  /** Emails the code (best effort: the sign-in answer never waits for SMTP). */
  private static deliver(
    tenantId: number,
    userId: number,
    email: string,
    displayName: string | null | undefined,
    purpose: ChallengePurpose,
    code: string
  ): void {
    // Local development usually has no SMTP: the code goes to the server log so
    // the flow stays testable. Strictly NODE_ENV=development -- never in tests,
    // staging or production, where it would put a live credential in the logs.
    if (config.nodeEnv === 'development') {
      logger.warn(`[DEV ONLY] Code de vérification (${purpose}) pour l'utilisateur ${userId} : ${code}`);
    }

    const greeting = `Bonjour${displayName ? ` ${displayName}` : ''},`;
    const subject =
      purpose === 'login' ? 'Votre code de connexion E-Formation' : 'Code de confirmation de la vérification en deux étapes';
    const body =
      purpose === 'login'
        ? `${greeting}\n\nVoici votre code de connexion : ${code}\n\nIl est valable 10 minutes. Ne le communiquez à personne.\n\nSi vous n'êtes pas à l'origine de cette connexion, quelqu'un connaît votre mot de passe : changez-le dès que possible.`
        : `${greeting}\n\nPour activer la vérification en deux étapes sur votre compte, saisissez ce code : ${code}\n\nIl est valable 10 minutes. Si vous n'avez rien demandé, ignorez cet email.`;

    NotificationService.sendSecurityEmail(tenantId, email, subject, body).catch((error) => {
      logger.error('Failed to send the two-step verification email', { userId, purpose, error: (error as Error)?.message });
    });
  }
}
