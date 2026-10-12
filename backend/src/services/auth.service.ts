import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { DatabaseService } from './database.service';
import { db, IS_PG } from '../database/db-helpers';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import { PendingNotificationService } from './pending-notification.service';
import { TenantSettingsService, isEmailDomainAllowed, passwordPolicyViolation } from './tenant-settings.service';
import { User, SSOIdentity, SSOProvider } from '../types';
import { logger } from '../utils/logger';
import { SessionService, AuthMethod, SessionContext } from './session.service';
import { TwoFactorService, TwoFactorChallenge, twoFactorApplies } from './two-factor.service';
import { LoginAlertService, alertInBackground } from './login-alert.service';
import { emitSessionsRevoked } from '../socket/sessionEvents';
import { 
  ApiError,
  BadRequestError, 
  UnauthorizedError, 
  NotFoundError, 
  ConflictError 
} from '../middleware/error.middleware';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * What a refresh returns: normally a rotated pair. Within the rotation grace
 * window (another tab of the same browser refreshed a moment earlier) only a new
 * access token -- the caller keeps the refresh token that other tab stored.
 */
interface RefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

/** The claims every access token carries (plus `sid`, the session it belongs to). */
interface TokenSubject {
  id: number;
  tenantId: number;
  email: string;
  role: string;
  tokenVersion?: number;
  enterpriseId?: number;
  directionId?: number;
  serviceId?: number;
}

/**
 * A password login whose password is older than the organization allows: no
 * session is opened, the user must first choose a new password with this
 * short-lived reset token (same flow as "forgot password").
 */
export interface PasswordExpiredResult {
  passwordExpired: true;
  resetToken: string;
}

const EXPIRED_PASSWORD_RESET_TTL = '15m';

/** The account as a password sign-in reads it (also re-read after the 2FA code). */
interface LoginUserRow {
  id: number;
  tenant_id: number;
  email: string;
  password_hash: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  enterprise_id: number;
  direction_id: number;
  service_id: number;
  is_active: boolean;
  status: string;
  token_version: number;
  failed_login_attempts: number;
  locked_until: Date | null;
  password_set_at: Date;
  db_now: Date;
  external_company: string | null;
  two_factor_enabled: boolean;
}

// db_now comes from the same clock as the stored timestamps, so the lock and
// password-age arithmetic never depends on the app server's time zone.
const LOGIN_USER_COLUMNS = `id, tenant_id, email, password_hash, display_name, avatar_url, role,
              enterprise_id, direction_id, service_id, is_active, status, token_version,
              failed_login_attempts, locked_until, external_company, two_factor_enabled,
              COALESCE(password_changed_at, created_at) AS password_set_at, ${db.now()} AS db_now`;

type LoginSuccess = { user: Partial<User>; tokens: TokenPair };

interface RegisterDTO {
  tenantId: number;
  email: string;
  password: string;
  displayName: string;
  username?: string;
  role?: string;
  enterpriseId?: number | null;
  subsidiaryId?: number | null;
  directionId?: number | null;
  serviceId?: number | null;
  /** false: the organization activates self-registered accounts right away. */
  requireApproval?: boolean;
  /** External participants only: the company they come from. */
  externalCompany?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
}

interface LoginDTO {
  email: string;
  password: string;
  tenantId?: number;
  ip?: string;
  userAgent?: string;
  /** 'external': the external participants' portal, which only lets role 'externe' in. */
  portal?: 'external';
}

export class AuthService {
  /**
   * Self-service registration. The account starts in 'pending' status and
   * cannot log in — no tokens are issued here — until an n+1 (the closest
   * supervisor/manager for the chosen service, a director for the chosen
   * direction, or failing that any admin) activates it via
   * PUT /users/:id/status.
   */
  static async register(data: RegisterDTO): Promise<{ user: Partial<User>; pending: boolean }> {
    const pending = data.requireApproval !== false;
    // users.email and users.username both carry a GLOBAL unique constraint (not
    // scoped per tenant — matches how login() looks a user up by email alone),
    // so the duplicate checks below must be global too, or a cross-tenant
    // collision would sail past this check and hit the raw INSERT as an
    // unhandled constraint violation (500) instead of a clean 409. Soft-deleted
    // accounts are excluded so a freed-up email/username can be reused.
    const existingUsers = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM users WHERE email = @email AND deleted_at IS NULL',
      { email: data.email }
    );

    if (existingUsers.length > 0) {
      throw ConflictError('Email already registered');
    }

    // Check username if provided
    const generatedUsername = data.username || data.email.split('@')[0] + '_' + Date.now().toString(36);

    const existingUsername = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM users WHERE username = @username AND deleted_at IS NULL',
      { username: generatedUsername }
    );

    if (existingUsername.length > 0) {
      throw ConflictError('Username already taken');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);

    // Insert user — pending, not active, until an n+1 activates the account (unless
    // the organization turned approval off: then the account is active right away).
    let result: { id: number }[];
    try {
      result = await DatabaseService.query<{ id: number }>(
        // Booleans are bound as params (not `0`/`1`/`TRUE` literals) so the driver's own
        // type binding handles mssql BIT vs pg boolean without a dialect branch here.
        IS_PG
          ? `INSERT INTO users (
              tenant_id, email, username, password_hash, display_name, role,
              enterprise_id, subsidiary_id, direction_id, service_id, is_active, status, password_changed_at,
              external_company, job_title, phone
            )
            VALUES (
              @tenantId, @email, @username, @passwordHash, @displayName, @role,
              @enterpriseId, @subsidiaryId, @directionId, @serviceId, @isActive, @status, ${db.now()},
              @externalCompany, COALESCE(@jobTitle, 'Défaut'), @phone
            )
            RETURNING id`
          : `INSERT INTO users (
              tenant_id, email, username, password_hash, display_name, role,
              enterprise_id, subsidiary_id, direction_id, service_id, is_active, status, password_changed_at,
              external_company, job_title, phone
            )
            OUTPUT INSERTED.id
            VALUES (
              @tenantId, @email, @username, @passwordHash, @displayName, @role,
              @enterpriseId, @subsidiaryId, @directionId, @serviceId, @isActive, @status, ${db.now()},
              @externalCompany, COALESCE(@jobTitle, 'Défaut'), @phone
            )`,
        {
          tenantId: data.tenantId,
          email: data.email,
          username: generatedUsername,
          passwordHash,
          displayName: data.displayName,
          role: data.role || 'agent',
          enterpriseId: data.enterpriseId || null,
          subsidiaryId: data.subsidiaryId || null,
          directionId: data.directionId || null,
          serviceId: data.serviceId || null,
          isActive: !pending,
          status: pending ? 'pending' : 'active',
          externalCompany: data.externalCompany || null,
          jobTitle: data.jobTitle || null,
          phone: data.phone || null,
        }
      );
    } catch (error: any) {
      // Belt-and-suspenders for a race between two concurrent registrations
      // with the same email/username slipping past the checks above.
      if (error?.code === '23505' || error?.number === 2627 || error?.number === 2601) {
        throw ConflictError('Email already registered');
      }
      throw error;
    }

    const userId = result[0].id;

    // Create default notification preferences
    await DatabaseService.execute(
      `INSERT INTO notification_preferences (tenant_id, user_id)
       VALUES (@tenantId, @userId)`,
      { tenantId: data.tenantId, userId }
    );

    // Log audit
    await AuditService.log(data.tenantId, userId, 'USER_REGISTERED', 'users', userId, {
      status: pending ? 'pending' : 'active',
    });

    // Best-effort: a failed notification must never fail the registration itself.
    if (pending) {
      this.notifyApproversOfPendingRegistration(data).catch((error) => {
        logger.error('Failed to notify approvers of a pending registration', { error, userId });
      });
    }

    // Confirm receipt to the applicant themselves -- separate from the
    // approver notification above, which they never see.
    NotificationService.send({
      tenantId: data.tenantId,
      userId,
      channel: 'email',
      subject: 'Votre compte E-Formation a été créé',
      essential: true,
      body: pending
        ? `Bonjour ${data.displayName},\n\nVotre demande de compte E-Formation a bien été reçue. Il est en attente d'activation par votre responsable ; vous recevrez un email dès qu'il sera activé.`
        : `Bonjour ${data.displayName},\n\nVotre compte E-Formation est créé et actif : vous pouvez vous connecter dès maintenant.`,
      actionUrl: `${config.frontendUrl}/login`,
    }).catch((error) => {
      logger.error('Failed to send registration confirmation email', { error, userId });
    });

    return {
      user: {
        id: userId,
        tenantId: data.tenantId,
        email: data.email,
        displayName: data.displayName,
        role: (data.role as any) || 'agent',
      },
      pending,
    };
  }

  /**
   * Alerts the new signup's n+1 so a pending account doesn't sit unnoticed:
   * prefers a supervisor/manager in the chosen service, falls back to a
   * director in the chosen direction, and finally to any admin in the tenant.
   */
  private static async notifyApproversOfPendingRegistration(data: RegisterDTO): Promise<void> {
    let approvers: { id: number }[] = [];

    if (data.serviceId) {
      approvers = await DatabaseService.query<{ id: number }>(
        `SELECT id FROM users WHERE tenant_id = @tenantId AND is_active = ${db.bool(true)} AND deleted_at IS NULL
         AND service_id = @serviceId AND role IN ('supervisor', 'manager')`,
        { tenantId: data.tenantId, serviceId: data.serviceId }
      );
    }
    if (approvers.length === 0 && data.directionId) {
      approvers = await DatabaseService.query<{ id: number }>(
        `SELECT id FROM users WHERE tenant_id = @tenantId AND is_active = ${db.bool(true)} AND deleted_at IS NULL
         AND direction_id = @directionId AND role = 'director'`,
        { tenantId: data.tenantId, directionId: data.directionId }
      );
    }
    if (approvers.length === 0) {
      approvers = await DatabaseService.query<{ id: number }>(
        `SELECT id FROM users WHERE tenant_id = @tenantId AND is_active = ${db.bool(true)} AND deleted_at IS NULL AND role = 'admin'`,
        { tenantId: data.tenantId }
      );
    }

    for (const approver of approvers) {
      for (const channel of ['in_app', 'email'] as const) {
        await NotificationService.send({
          tenantId: data.tenantId,
          userId: approver.id,
          channel,
          subject: 'Nouvelle inscription en attente d\'activation',
          essential: true,
          body: data.role === 'externe'
            ? `${data.displayName} (${data.email}), intervenant externe${data.externalCompany ? ` de ${data.externalCompany}` : ''}, a demandé un accès et attend une activation.`
            : `${data.displayName} (${data.email}) vient de créer un compte et attend une activation.`,
          actionUrl: `${config.frontendUrl}/admin/users?status=pending`,
        }).catch(() => {});
      }
    }
  }

  /**
   * Login with email and password
   */
  static async login(
    data: LoginDTO
  ): Promise<LoginSuccess | PasswordExpiredResult | TwoFactorChallenge> {
    // Find user
    const users = await DatabaseService.query<LoginUserRow>(
      `SELECT ${LOGIN_USER_COLUMNS}
       FROM users
       WHERE email = @email
       ${data.tenantId ? 'AND tenant_id = @tenantId' : ''}
       AND deleted_at IS NULL`,
      { email: data.email, tenantId: data.tenantId }
    );

    if (users.length === 0) {
      // No account to attach it to, but it still counts for Administration >
      // Connexions > IP suspectes (the email itself is not recorded).
      if (data.tenantId) {
        await AuditService.log(data.tenantId, null, 'LOGIN_FAILED', 'users', null, {
          reason: 'unknown_account',
          ip: data.ip,
          userAgent: data.userAgent,
        });
      }
      throw UnauthorizedError('Invalid email or password');
    }

    const user = users[0];

    if (user.status !== 'active') {
      const messages: Record<string, string> = {
        pending: user.role === 'externe'
          ? "Votre demande d'accès est en attente de validation par un administrateur."
          : "Votre compte est en attente d'activation par votre responsable.",
        suspended: 'Votre compte a été suspendu. Contactez votre administrateur.',
        deactivated: 'Votre compte a été désactivé.',
      };
      await AuditService.log(user.tenant_id, user.id, 'LOGIN_FAILED', 'users', user.id, {
        reason: `account_${user.status}`,
        ip: data.ip,
        userAgent: data.userAgent,
      });
      throw UnauthorizedError(messages[user.status] || 'Account is disabled');
    }

    const settings = await TenantSettingsService.get(user.tenant_id);
    const dbNow = new Date(user.db_now).getTime();

    // Locked after too many wrong passwords: refused even with the right password
    // until the lock expires, an admin unlocks it, or the password is reset.
    if (user.locked_until && new Date(user.locked_until).getTime() > dbNow) {
      await AuditService.log(user.tenant_id, user.id, 'LOGIN_FAILED', 'users', user.id, {
        reason: 'account_locked',
        ip: data.ip,
        userAgent: data.userAgent,
      });
      throw this.accountLockedError(new Date(user.locked_until).getTime() - dbNow);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(data.password, user.password_hash);
    if (!isValidPassword) {
      await AuditService.log(user.tenant_id, user.id, 'LOGIN_FAILED', 'users', user.id, {
        reason: 'invalid_password',
        ip: data.ip,
        userAgent: data.userAgent,
      });

      if (settings.maxLoginAttempts > 0) {
        const attempts = (Number(user.failed_login_attempts) || 0) + 1;
        if (attempts >= settings.maxLoginAttempts) {
          // Lockout minutes come from validated settings (an integer), inlined because
          // pg can't type a parameter that is only multiplied by an interval.
          const minutes = Math.max(1, Math.trunc(settings.lockoutMinutes));
          await DatabaseService.execute(
            `UPDATE users SET failed_login_attempts = 0,
                    locked_until = ${db.dateAdd('minute', String(minutes), db.now())}
             WHERE id = @id`,
            { id: user.id }
          );
          await AuditService.log(user.tenant_id, user.id, 'ACCOUNT_LOCKED', 'users', user.id, {
            attempts,
            minutes,
            ip: data.ip,
          });
          // The owner learns it even if it wasn't them typing.
          alertInBackground(LoginAlertService.sendLockedAlert(user, minutes), 'account locked');
          throw this.accountLockedError(minutes * 60_000);
        }
        await DatabaseService.execute(
          'UPDATE users SET failed_login_attempts = @attempts WHERE id = @id',
          { attempts, id: user.id }
        );
      }
      throw UnauthorizedError('Invalid email or password');
    }

    if (Number(user.failed_login_attempts) > 0 || user.locked_until) {
      await DatabaseService.execute(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = @id',
        { id: user.id }
      );
    }

    // The external portal is reserved to external participants. Checked only once
    // the password is right, so it never reveals which emails exist.
    if (data.portal === 'external' && user.role !== 'externe') {
      await AuditService.log(user.tenant_id, user.id, 'LOGIN_FAILED', 'users', user.id, {
        reason: 'wrong_portal',
        ip: data.ip,
        userAgent: data.userAgent,
      });
      throw new ApiError(
        "Cet espace est réservé aux intervenants externes. Connectez-vous depuis l'espace collaborateurs.",
        403,
        'WRONG_PORTAL'
      );
    }

    // Password older than the organization allows: no session until a new one is chosen.
    if (settings.passwordExpiryDays > 0) {
      const ageDays = (dbNow - new Date(user.password_set_at).getTime()) / 86_400_000;
      if (ageDays > settings.passwordExpiryDays) {
        await AuditService.log(user.tenant_id, user.id, 'LOGIN_PASSWORD_EXPIRED', 'users', user.id, {
          ip: data.ip,
          userAgent: data.userAgent,
        });
        return {
          passwordExpired: true,
          resetToken: this.signPasswordResetToken(user.id, user.token_version, EXPIRED_PASSWORD_RESET_TTL),
        };
      }
    }

    // Two-step sign-in (Administration > Organisation > Accès & sécurité): no
    // session yet -- the code emailed now must be entered first (POST /auth/2fa/verify).
    if (twoFactorApplies(settings.twoFactorMode, user.two_factor_enabled)) {
      return TwoFactorService.start({
        tenantId: user.tenant_id,
        userId: user.id,
        email: user.email,
        displayName: user.display_name,
        purpose: 'login',
        authMethod: 'password',
        portal: data.portal ?? null,
        ip: data.ip,
        userAgent: data.userAgent,
      });
    }

    return this.completeLogin(user, 'password', { ip: data.ip, userAgent: data.userAgent });
  }

  /**
   * Second step of a sign-in: the emailed code. Opens the session the first
   * step withheld, after checking again that the account may still sign in
   * (and through that portal).
   */
  static async verifyTwoFactorLogin(challengeToken: string, code: string, context: SessionContext = {}): Promise<LoginSuccess> {
    const challenge = await TwoFactorService.verify(challengeToken, code, 'login', context);

    const users = await DatabaseService.query<LoginUserRow>(
      `SELECT ${LOGIN_USER_COLUMNS} FROM users WHERE id = @userId AND deleted_at IS NULL`,
      { userId: challenge.user_id }
    );
    const user = users[0];
    if (!user || user.status !== 'active' || !user.is_active) {
      throw UnauthorizedError('Account is disabled');
    }
    if (challenge.portal === 'external' && user.role !== 'externe') {
      throw new ApiError(
        "Cet espace est réservé aux intervenants externes. Connectez-vous depuis l'espace collaborateurs.",
        403,
        'WRONG_PORTAL'
      );
    }

    await AuditService.log(user.tenant_id, user.id, '2FA_SUCCESS', 'users', user.id, {
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return this.completeLogin(user, challenge.auth_method === 'ldap' ? 'ldap' : 'password', context, { twoFactor: true });
  }

  /** Last step of a password or LDAP sign-in: the session, last_login_at, the audit trail. */
  private static async completeLogin(
    user: Omit<LoginUserRow, 'password_hash' | 'failed_login_attempts' | 'locked_until' | 'password_set_at' | 'db_now'>,
    method: 'password' | 'ldap',
    context: SessionContext,
    auditExtra: Record<string, unknown> = {}
  ): Promise<LoginSuccess> {
    // Generate tokens -- a new session for this device
    const tokens = await this.startSession(
      {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        role: user.role,
        tokenVersion: user.token_version,
        enterpriseId: user.enterprise_id,
        directionId: user.direction_id,
        serviceId: user.service_id,
      },
      method,
      context
    );

    await DatabaseService.execute(
      `UPDATE users SET last_login_at = ${db.now()} WHERE id = @id`,
      { id: user.id }
    );

    // Log audit
    await AuditService.log(user.tenant_id, user.id, method === 'ldap' ? 'LDAP_LOGIN' : 'USER_LOGIN', 'users', user.id, {
      ip: context.ip,
      userAgent: context.userAgent,
      ...auditExtra,
    });

    return {
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        role: user.role as any,
        enterpriseId: user.enterprise_id,
        directionId: user.direction_id,
        serviceId: user.service_id,
        externalCompany: user.external_company,
      } as Partial<User>,
      tokens,
    };
  }

  /**
   * Refresh access token. The refresh token is single-use: it names its session
   * (`sid`) and its own id (`jti`), and SessionService.rotate() swaps that jti
   * for a new one -- presenting an already-replaced token revokes the session.
   */
  static async refreshToken(refreshToken: string, context: SessionContext = {}): Promise<RefreshResult> {
    let payload: any;
    try {
      payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch {
      throw UnauthorizedError('Invalid refresh token');
    }
    // Tokens minted before sessions existed carry no sid: they can't be checked
    // against a session, so they no longer renew (one new login).
    if (payload?.type !== 'refresh' || !payload.sid || !payload.jti) {
      throw UnauthorizedError('Invalid refresh token');
    }

    // Verify user still exists and is active
    const users = await DatabaseService.query<{
      id: number;
      tenant_id: number;
      email: string;
      role: string;
      enterprise_id: number;
      direction_id: number;
      service_id: number;
      is_active: boolean;
      token_version: number;
    }>(
      `SELECT id, tenant_id, email, role, enterprise_id, direction_id, service_id, is_active, token_version
       FROM users WHERE id = @id AND deleted_at IS NULL`,
      { id: payload.id }
    );

    if (users.length === 0 || !users[0].is_active) {
      throw UnauthorizedError('User not found or inactive');
    }

    const user = users[0];

    // A password reset or an admin force-logout bumps token_version, so a refresh
    // token minted before it can never renew again.
    if ((payload.tokenVersion ?? 0) !== user.token_version) {
      throw UnauthorizedError('Invalid refresh token');
    }

    const rotation = await SessionService.rotate(payload.sid, user.id, payload.jti, context);

    // The original login time travels with every refresh token, so the
    // organization's maximum session length counts from the real login, not
    // from the last refresh.
    return this.signTokens(
      {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        role: user.role,
        tokenVersion: user.token_version,
        enterpriseId: user.enterprise_id,
        directionId: user.direction_id,
        serviceId: user.service_id,
      },
      {
        sid: payload.sid,
        jti: rotation.outcome === 'rotated' ? rotation.jti : null,
        authTime: Number(payload.authTime ?? payload.iat),
      }
    );
  }

  /**
   * super_admin only: mint a fresh token pair scoped to a different tenant, so
   * every existing route (which all trust req.user.tenantId from the JWT) works
   * unmodified once the super_admin is "acting as" that organization. See the
   * authenticateHandler special case in auth.middleware.ts that allows a
   * super_admin's token tenantId to differ from their stored home tenant_id.
   */
  static async switchTenant(
    currentUserId: number,
    currentUserRole: string,
    targetTenantId: number,
    currentSid?: string,
    context: SessionContext = {}
  ): Promise<{ tokens: TokenPair; tenant: { id: number; name: string } }> {
    if (currentUserRole !== 'super_admin') {
      throw UnauthorizedError('Only super_admin can switch tenant context');
    }

    const tenants = await DatabaseService.query<{ id: number; name: string }>(
      'SELECT id, name FROM tenants WHERE id = @targetTenantId',
      { targetTenantId }
    );
    if (tenants.length === 0) {
      throw NotFoundError('Tenant');
    }

    const users = await DatabaseService.query<{ id: number; tenant_id: number; email: string; token_version: number }>(
      `SELECT id, email, token_version, tenant_id FROM users WHERE id = @id AND role = 'super_admin' AND deleted_at IS NULL`,
      { id: currentUserId }
    );
    if (users.length === 0) {
      throw UnauthorizedError('Super admin account not found');
    }

    const subject = {
      id: users[0].id,
      tenantId: targetTenantId,
      email: users[0].email,
      role: 'super_admin',
      tokenVersion: users[0].token_version,
    };
    // Same session (same device), new token pair scoped to the target tenant; a
    // token from before sessions existed gets a session of its own.
    const tokens = currentSid
      ? ((await this.signTokens(subject, {
          sid: currentSid,
          jti: await SessionService.reissue(currentSid, users[0].id),
          authTime: Math.floor(Date.now() / 1000),
        })) as TokenPair)
      : await this.startSession(subject, 'password', context, Number(users[0].tenant_id) || targetTenantId, {
          // Not a login: the device stays the same, so it mustn't sign the others out.
          replaceOthers: false,
        });

    await AuditService.log(targetTenantId, users[0].id, 'SUPER_ADMIN_SWITCHED_TENANT', 'tenants', targetTenantId);

    return { tokens, tenant: tenants[0] };
  }

  /**
   * Handle SSO login/registration
   */
  static async handleSSOLogin(
    provider: SSOProvider,
    externalId: string,
    profile: {
      email: string;
      displayName: string;
      tenantId?: number;
      ip?: string;
      userAgent?: string;
    }
  ): Promise<{ user: Partial<User>; tokens: TokenPair; isNewUser: boolean }> {
    // Look for existing SSO identity
    const existingIdentities = await DatabaseService.query<{
      user_id: number;
      tenant_id: number;
    }>(
      `SELECT user_id, tenant_id FROM sso_identities 
       WHERE provider = @provider AND external_id = @externalId`,
      { provider, externalId }
    );

    let userId: number;
    let tenantId: number;
    let isNewUser = false;

    if (existingIdentities.length > 0) {
      // Existing user - login
      userId = existingIdentities[0].user_id;
      tenantId = existingIdentities[0].tenant_id;
      this.assertSameOrganization(profile.tenantId, tenantId);
    } else {
      // Check if email exists
      const existingUsers = await DatabaseService.query<{
        id: number;
        tenant_id: number;
      }>(
        `SELECT id, tenant_id FROM users 
         WHERE email = @email AND deleted_at IS NULL`,
        { email: profile.email }
      );

      if (existingUsers.length > 0) {
        // Link SSO to existing account -- only within the organization whose identity
        // provider vouched for this email: another organization's provider must never
        // open an account it doesn't own.
        userId = existingUsers[0].id;
        tenantId = existingUsers[0].tenant_id;
        this.assertSameOrganization(profile.tenantId, tenantId);

        await DatabaseService.execute(
          `INSERT INTO sso_identities (tenant_id, user_id, provider, external_id)
           VALUES (@tenantId, @userId, @provider, @externalId)`,
          { tenantId, userId, provider, externalId }
        );
      } else {
        // Create new user
        if (!profile.tenantId) {
          // Callers always pass the organization whose provider was used (signed SSO
          // state); without one, fall back to the operator's explicit DEFAULT_TENANT_ID
          // rather than whichever tenant has the lowest id.
          const configuredTenant = await DatabaseService.query<{ id: number }>(
            `SELECT id FROM tenants WHERE id = @tenantId`,
            { tenantId: config.defaultTenantId }
          );
          if (configuredTenant.length === 0) {
            throw UnauthorizedError('SSO login is not available: no default tenant is configured for auto-provisioning');
          }
          tenantId = configuredTenant[0].id;
        } else {
          tenantId = profile.tenantId;
        }

        await this.assertEmailDomainAllowed(tenantId, profile.email);

        const result = await DatabaseService.query<{ id: number }>(
          IS_PG
            ? `INSERT INTO users (tenant_id, email, password_hash, display_name, role, is_active)
               VALUES (@tenantId, @email, 'SSO_USER', @displayName, 'agent', @isActive)
               RETURNING id`
            : `INSERT INTO users (tenant_id, email, password_hash, display_name, role, is_active)
               OUTPUT INSERTED.id
               VALUES (@tenantId, @email, 'SSO_USER', @displayName, 'agent', @isActive)`,
          {
            tenantId,
            email: profile.email,
            displayName: profile.displayName,
            isActive: true,
          }
        );

        userId = result[0].id;
        isNewUser = true;

        // Create SSO identity
        await DatabaseService.execute(
          `INSERT INTO sso_identities (tenant_id, user_id, provider, external_id)
           VALUES (@tenantId, @userId, @provider, @externalId)`,
          { tenantId, userId, provider, externalId }
        );

        // Create notification preferences
        await DatabaseService.execute(
          `INSERT INTO notification_preferences (tenant_id, user_id)
           VALUES (@tenantId, @userId)`,
          { tenantId, userId }
        );
      }
    }

    // Get full user data
    const users = await DatabaseService.query<{
      id: number;
      tenant_id: number;
      email: string;
      display_name: string;
      role: string;
      enterprise_id: number;
      direction_id: number;
      service_id: number;
      token_version: number;
      status: string;
    }>(
      `SELECT id, tenant_id, email, display_name, role,
              enterprise_id, direction_id, service_id, token_version, status
       FROM users WHERE id = @userId`,
      { userId }
    );

    const user = users[0];

    // A suspended/deactivated/pending account used to get in through SSO anyway:
    // only password logins checked the status.
    if (user.status && user.status !== 'active') {
      await AuditService.log(user.tenant_id, user.id, 'LOGIN_FAILED', 'users', user.id, {
        reason: `account_${user.status}`,
        provider,
        ip: profile.ip,
      });
      throw UnauthorizedError('Account is disabled');
    }

    const tokens = await this.startSession(
      {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        role: user.role,
        tokenVersion: user.token_version,
        enterpriseId: user.enterprise_id,
        directionId: user.direction_id,
        serviceId: user.service_id,
      },
      provider === 'azure_ad' ? 'sso_azure_ad' : 'sso_google',
      { ip: profile.ip, userAgent: profile.userAgent }
    );

    await AuditService.log(user.tenant_id, user.id, `SSO_LOGIN_${provider.toUpperCase()}`, 'users', user.id, {
      ip: profile.ip,
      userAgent: profile.userAgent,
    });

    return {
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        displayName: user.display_name,
        role: user.role as any,
      },
      tokens,
      isNewUser,
    };
  }

  /**
   * Handle LDAP login: auto-provisions a local account on first login (matched by
   * email), matching the SSO auto-provisioning pattern. The LDAP bind itself is
   * performed by LdapService before this is called — by this point the credential
   * has already been verified against the directory.
   */
  static async handleLdapLogin(profile: {
    email: string;
    displayName: string;
    /** Organization whose directory authenticated the user (default tenant if omitted). */
    tenantId?: number;
    ip?: string;
    userAgent?: string;
  }): Promise<{ user: Partial<User>; tokens: TokenPair; isNewUser: boolean } | TwoFactorChallenge> {
    let userId: number;
    let isNewUser = false;

    const existingUsers = await DatabaseService.query<{ id: number; tenant_id: number; is_active: boolean }>(
      `SELECT id, tenant_id, is_active FROM users WHERE email = @email AND deleted_at IS NULL`,
      { email: profile.email }
    );

    if (existingUsers.length > 0) {
      if (!existingUsers[0].is_active) {
        throw UnauthorizedError('Account is disabled');
      }
      this.assertSameOrganization(profile.tenantId, existingUsers[0].tenant_id);
      userId = existingUsers[0].id;
    } else {
      // The account goes to the organization whose directory authenticated it
      // (Administration > SSO & annuaire); without one, to the operator's explicit
      // DEFAULT_TENANT_ID rather than whichever tenant has the lowest id.
      const configuredTenant = await DatabaseService.query<{ id: number }>(
        `SELECT id FROM tenants WHERE id = @tenantId`,
        { tenantId: profile.tenantId ?? config.defaultTenantId }
      );
      if (configuredTenant.length === 0) {
        throw UnauthorizedError('LDAP login is not available: no organization to create the account in');
      }
      const tenantId = configuredTenant[0].id;

      await this.assertEmailDomainAllowed(tenantId, profile.email);

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO users (tenant_id, email, password_hash, display_name, role, is_active)
             VALUES (@tenantId, @email, 'LDAP_USER', @displayName, 'agent', @isActive)
             RETURNING id`
          : `INSERT INTO users (tenant_id, email, password_hash, display_name, role, is_active)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @email, 'LDAP_USER', @displayName, 'agent', @isActive)`,
        { tenantId, email: profile.email, displayName: profile.displayName, isActive: true }
      );

      userId = result[0].id;
      isNewUser = true;

      await DatabaseService.execute(
        `INSERT INTO notification_preferences (tenant_id, user_id) VALUES (@tenantId, @userId)`,
        { tenantId, userId }
      );
    }

    const users = await DatabaseService.query<{
      id: number;
      tenant_id: number;
      email: string;
      display_name: string;
      role: string;
      enterprise_id: number;
      direction_id: number;
      service_id: number;
      token_version: number;
      two_factor_enabled: boolean;
    }>(
      `SELECT id, tenant_id, email, display_name, role, enterprise_id, direction_id, service_id, token_version, two_factor_enabled
       FROM users WHERE id = @userId`,
      { userId }
    );

    const user = users[0];

    // The directory checked the password; two-step sign-in still applies (unlike
    // SSO, where the identity provider runs its own MFA).
    const { twoFactorMode } = await TenantSettingsService.get(user.tenant_id);
    if (twoFactorApplies(twoFactorMode, user.two_factor_enabled)) {
      return TwoFactorService.start({
        tenantId: user.tenant_id,
        userId: user.id,
        email: user.email,
        displayName: user.display_name,
        purpose: 'login',
        authMethod: 'ldap',
        ip: profile.ip,
        userAgent: profile.userAgent,
      });
    }

    const tokens = await this.startSession(
      {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        role: user.role,
        tokenVersion: user.token_version,
        enterpriseId: user.enterprise_id,
        directionId: user.direction_id,
        serviceId: user.service_id,
      },
      'ldap',
      { ip: profile.ip, userAgent: profile.userAgent }
    );

    await AuditService.log(user.tenant_id, user.id, 'LDAP_LOGIN', 'users', user.id, {
      ip: profile.ip,
      userAgent: profile.userAgent,
    });

    return {
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        displayName: user.display_name,
        role: user.role as any,
      },
      tokens,
      isNewUser,
    };
  }

  /**
   * Change password
   */
  static async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    /** The session the change is made from: it stays open, every other one is closed. */
    currentSid?: string
  ): Promise<{ id: number; subject: string; recipientEmail: string } | null> {
    const users = await DatabaseService.query<{
      password_hash: string;
      tenant_id: number;
    }>(
      'SELECT password_hash, tenant_id FROM users WHERE id = @userId',
      { userId }
    );

    if (users.length === 0) {
      throw NotFoundError('User');
    }

    const user = users[0];

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      throw BadRequestError('Current password is incorrect');
    }

    await this.assertPasswordAllowed(user.tenant_id, newPassword, user.password_hash);

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, config.bcryptRounds);

    await DatabaseService.execute(
      `UPDATE users SET password_hash = @passwordHash, password_changed_at = ${db.now()} WHERE id = @userId`,
      { passwordHash: newPasswordHash, userId }
    );

    // Whoever knew the old password is signed out everywhere else.
    const closedSessions = await SessionService.revokeAllForUser(userId, 'password_changed', currentSid);

    await AuditService.log(user.tenant_id, userId, 'PASSWORD_CHANGED', 'users', userId, { closedSessions });

    // Queue a confirmation email -- self-service, so the user confirms it
    // themselves right away (triggeredBy = the same user).
    try {
      return await PendingNotificationService.queue({
        tenantId: user.tenant_id,
        userId,
        eventType: 'password_changed',
        subject: 'Votre mot de passe E-Formation a été modifié',
        body: `Bonjour,\n\nLe mot de passe de votre compte E-Formation vient d'être modifié. Si vous n'êtes pas à l'origine de ce changement, contactez votre administrateur immédiatement.`,
        triggeredBy: userId,
      });
    } catch (error) {
      logger.error('Failed to queue password-changed email', { error, userId });
      return null;
    }
  }

  /**
   * Request password reset
   */
  static async requestPasswordReset(email: string, tenantId?: number): Promise<string> {
    const users = await DatabaseService.query<{ id: number; tenant_id: number; token_version: number }>(
      `SELECT id, tenant_id, token_version FROM users
       WHERE email = @email
       ${tenantId ? 'AND tenant_id = @tenantId' : ''}
       AND deleted_at IS NULL`,
      { email, tenantId }
    );

    if (users.length === 0) {
      // Don't reveal if user exists
      return 'If the email exists, a reset link will be sent';
    }

    const user = users[0];

    // tokenVersion pins this reset link to the account's password state at the moment
    // it was requested -- resetPassword() bumps it on use, so the same link can't be
    // replayed, and a second "forgot password" request invalidates any earlier one.
    const resetToken = this.signPasswordResetToken(user.id, user.token_version, '1h');

    const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;

    // Outside production there's usually no real SMTP configured, so the email
    // below silently fails to send — log the link so the flow stays testable
    // without standing up a mail server. Never do this in production: it would
    // put a live, replayable reset link in plaintext logs.
    if (config.nodeEnv !== 'production') {
      logger.info('Password reset link generated (dev-only log, not shown in production)', {
        userId: user.id,
        resetUrl,
      });
    }

    // Best-effort: a failed email must never reveal whether the account exists
    // (the caller always gets the same generic message either way).
    NotificationService.send({
      tenantId: user.tenant_id,
      userId: user.id,
      channel: 'email',
      subject: 'Réinitialisation de votre mot de passe',
      essential: true,
      body: `Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe (valable 1 heure) :\n\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
      actionUrl: resetUrl,
    }).catch((error) => {
      logger.error('Failed to send password reset email', {
        error,
        userId: user.id,
        resetUrl: config.nodeEnv !== 'production' ? resetUrl : undefined,
      });
    });

    return 'If the email exists, a reset link will be sent';
  }

  /**
   * Reset password with token
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as any;

      if (payload.type !== 'password_reset') {
        throw BadRequestError('Invalid reset token');
      }

      const users = await DatabaseService.query<{
        id: number;
        tenant_id: number;
        token_version: number;
        password_hash: string;
      }>(
        'SELECT id, tenant_id, token_version, password_hash FROM users WHERE id = @userId',
        { userId: payload.userId }
      );
      if (users.length === 0) {
        throw NotFoundError('User');
      }

      // The token carries the token_version that was current when it was issued --
      // if it no longer matches (already used, or superseded by a newer reset
      // request), the token is a replay and must be rejected even though its
      // signature and expiry are still valid.
      if ((payload.tokenVersion ?? -1) !== users[0].token_version) {
        throw BadRequestError('Invalid or expired reset token');
      }

      await this.assertPasswordAllowed(users[0].tenant_id, newPassword, users[0].password_hash);

      const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);

      // Bump token_version in the same update: consumes this reset token and, since
      // outstanding refresh tokens carry the old version too, signs the account out
      // of every other session as well. Choosing a new password also lifts a lockout.
      const result = await DatabaseService.execute(
        `UPDATE users SET password_hash = @passwordHash, token_version = token_version + 1,
                password_changed_at = ${db.now()}, failed_login_attempts = 0, locked_until = NULL
         WHERE id = @userId`,
        { passwordHash, userId: payload.userId }
      );

      if (result.rowsAffected === 0) {
        throw NotFoundError('User');
      }

      // token_version already stops the old refresh tokens; this also ends the
      // sessions themselves (access tokens included) and shows it in the history.
      await SessionService.revokeAllForUser(payload.userId, 'password_reset');
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw BadRequestError('Invalid or expired reset token');
      }
      throw error;
    }
  }

  /**
   * Logout: ends the session the tokens belong to. Accepts either token -- the
   * refresh token names the session even once the access token has expired --
   * and never fails: signing out must always work on the client side.
   */
  static async logout(tokens: { accessToken?: string | null; refreshToken?: string | null }): Promise<void> {
    let claims: { userId: number; tenantId?: number; sid: string } | null = null;
    if (tokens.refreshToken) {
      try {
        const payload = jwt.verify(tokens.refreshToken, config.jwt.refreshSecret) as any;
        if (payload?.type === 'refresh' && payload.sid) claims = { userId: Number(payload.id), sid: payload.sid };
      } catch {
        // expired/invalid: try the access token
      }
    }
    if (!claims && tokens.accessToken) {
      try {
        const payload = jwt.verify(tokens.accessToken, config.jwt.secret) as any;
        if (!payload?.type && payload?.sid) {
          claims = { userId: Number(payload.id), tenantId: Number(payload.tenantId), sid: payload.sid };
        }
      } catch {
        // nothing to revoke
      }
    }
    if (!claims) return;

    if (await SessionService.revoke(claims.sid, 'logout')) {
      const tenantId = claims.tenantId || (await this.getUserTenantId(claims.userId));
      if (tenantId) {
        await AuditService.log(tenantId, claims.userId, 'USER_LOGOUT', 'users', claims.userId, { sid: claims.sid });
      }
    }
  }

  /**
   * « Ce n'était pas moi » (link of the new sign-in alert): closes every session
   * of the account and bumps token_version (which also voids the link itself),
   * then hands out a short-lived reset token so the owner picks a new password
   * right away -- whoever signed in knows the current one.
   */
  static async reportNotMe(token: string, context: SessionContext = {}): Promise<{ resetToken: string }> {
    let payload: any;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      throw BadRequestError('Ce lien a expiré ou n’est plus valide.', 'NOT_ME_INVALID');
    }
    if (payload?.type !== 'not_me' || !payload.userId) {
      throw BadRequestError('Ce lien a expiré ou n’est plus valide.', 'NOT_ME_INVALID');
    }

    const users = await DatabaseService.query<{ id: number; tenant_id: number; token_version: number }>(
      'SELECT id, tenant_id, token_version FROM users WHERE id = @userId AND deleted_at IS NULL',
      { userId: payload.userId }
    );
    const user = users[0];
    if (!user || Number(payload.tokenVersion ?? -1) !== Number(user.token_version)) {
      throw BadRequestError('Ce lien a expiré ou n’est plus valide.', 'NOT_ME_INVALID');
    }

    // Conditional on the version read above: two clicks can't both succeed.
    const bumped = await DatabaseService.execute(
      `UPDATE users SET token_version = token_version + 1, updated_at = ${db.now()}
       WHERE id = @userId AND token_version = @tokenVersion`,
      { userId: user.id, tokenVersion: user.token_version }
    );
    if (Number(bumped?.rowsAffected) !== 1) {
      throw BadRequestError('Ce lien a expiré ou n’est plus valide.', 'NOT_ME_INVALID');
    }
    const closedSessions = await SessionService.revokeAllForUser(user.id, 'not_me');
    await AuditService.log(Number(user.tenant_id), user.id, 'NOT_ME_REPORTED', 'users', user.id, {
      closedSessions,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { resetToken: this.signPasswordResetToken(user.id, Number(user.token_version) + 1, EXPIRED_PASSWORD_RESET_TTL) };
  }

  /**
   * Administration > Utilisateurs > "Forcer la déconnexion": closes every session
   * of the account and bumps token_version, so no token issued before (refresh
   * token, password-reset link) works any more. Permission is checked by the route.
   */
  static async forceLogout(targetUserId: number, tenantId: number, actorId: number): Promise<number> {
    const closedSessions = await SessionService.revokeAllForUser(targetUserId, 'admin_force_logout');
    await DatabaseService.execute(
      `UPDATE users SET token_version = token_version + 1, updated_at = ${db.now()}
       WHERE id = @userId AND tenant_id = @tenantId`,
      { userId: targetUserId, tenantId }
    );
    await AuditService.log(tenantId, actorId, 'USER_FORCE_LOGOUT', 'users', targetUserId, { closedSessions });
    return closedSessions;
  }

  /** The organization an account belongs to (null if it doesn't exist). */
  static async getUserTenantId(userId: number): Promise<number | null> {
    if (!Number.isInteger(userId)) return null;
    const rows = await DatabaseService.query<{ tenant_id: number }>(
      'SELECT tenant_id FROM users WHERE id = @userId AND deleted_at IS NULL',
      { userId }
    );
    return rows[0] ? Number(rows[0].tenant_id) : null;
  }

  /**
   * 400 PASSWORD_POLICY when `password` breaks the organization's password rules,
   * or PASSWORD_REUSED when it is the password being replaced (an expired password
   * must really change).
   */
  static async assertPasswordAllowed(tenantId: number, password: string, currentHash?: string): Promise<void> {
    const violation = passwordPolicyViolation(password, await TenantSettingsService.get(tenantId));
    if (violation) {
      throw BadRequestError(violation, 'PASSWORD_POLICY');
    }
    if (currentHash && (await bcrypt.compare(password, currentHash).catch(() => false))) {
      throw BadRequestError('The new password must be different from the current one', 'PASSWORD_REUSED');
    }
  }

  /**
   * 403 SSO_WRONG_ORGANIZATION when an organization's identity provider (SSO or
   * LDAP) vouches for an account that belongs to another organization.
   */
  private static assertSameOrganization(providerTenantId: number | undefined, accountTenantId: number | string): void {
    if (providerTenantId !== undefined && Number(accountTenantId) !== Number(providerTenantId)) {
      throw new ApiError(
        'This account belongs to another organization and cannot sign in with this identity provider',
        403,
        'SSO_WRONG_ORGANIZATION'
      );
    }
  }

  /** 403 EMAIL_DOMAIN_NOT_ALLOWED when the organization restricts accounts to some email domains. */
  static async assertEmailDomainAllowed(tenantId: number, email: string): Promise<void> {
    const { allowedEmailDomains } = await TenantSettingsService.get(tenantId);
    if (!isEmailDomainAllowed(email, allowedEmailDomains)) {
      throw new ApiError(
        `Only email addresses from ${allowedEmailDomains.map((d) => '@' + d).join(', ')} can create an account in this organization`,
        403,
        'EMAIL_DOMAIN_NOT_ALLOWED'
      );
    }
  }

  /** 423 ACCOUNT_LOCKED, telling the user how long the lock still lasts. */
  private static accountLockedError(remainingMs: number): ApiError {
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    return new ApiError(
      `Compte verrouillé après plusieurs mots de passe erronés. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''} ou réinitialisez votre mot de passe.`,
      423,
      'ACCOUNT_LOCKED'
    );
  }

  /**
   * One-time password reset token. tokenVersion pins it to the account's password
   * state at the moment it was issued -- resetPassword() bumps it on use, so the
   * same token can't be replayed, and a newer one invalidates any earlier one.
   */
  private static signPasswordResetToken(userId: number, tokenVersion: number, expiresIn: string): string {
    // @ts-expect-error - jwt.sign overload resolution with dynamic expiresIn string type
    return jwt.sign({ userId, type: 'password_reset', tokenVersion }, config.jwt.secret, { expiresIn });
  }

  /**
   * Opens a session for a successful login (every login path ends here: password,
   * external portal, LDAP, SSO, 2FA code) and signs its first token pair.
   * `sessionTenantId`: the account's own organization, when the tokens are scoped
   * to another one (super_admin acting in a tenant).
   * When the organization allows one session per user (the default), the
   * account's other sessions are closed: the most recent login wins.
   * `replaceOthers: false` for a session that isn't a login (switch-tenant).
   */
  private static async startSession(
    subject: TokenSubject,
    method: AuthMethod,
    context: SessionContext,
    sessionTenantId: number = subject.tenantId,
    options: { replaceOthers?: boolean } = {}
  ): Promise<TokenPair> {
    const authTime = Math.floor(Date.now() / 1000);
    const { refreshExpiresIn } = await this.tokenLifetimes(subject.tenantId, authTime);
    // Compared with the sessions that exist before this one opens.
    const newDevice = await LoginAlertService.isNewDevice(sessionTenantId, subject.id, context).catch((error) => {
      logger.warn('New-device check failed', { error: (error as Error)?.message });
      return false;
    });
    if (newDevice) {
      alertInBackground(LoginAlertService.sendNewDeviceAlert(subject.id, context), 'new sign-in');
    }
    const { sid, jti } = await SessionService.create({
      tenantId: sessionTenantId,
      userId: subject.id,
      authMethod: method,
      expiresInSeconds: refreshExpiresIn,
      ...context,
    });
    const tokens = (await this.signTokens(subject, { sid, jti, authTime })) as TokenPair;
    if (options.replaceOthers !== false) {
      await this.replaceOtherSessions(sessionTenantId, subject.id, sid, context);
    }
    return tokens;
  }

  /**
   * One session per user (organization setting, on by default): closes the
   * account's sessions opened before `sid`, audits it, and tells their open tabs
   * over the socket so they sign out at once (otherwise their next API call gets
   * 401 SESSION_REPLACED).
   */
  private static async replaceOtherSessions(
    tenantId: number,
    userId: number,
    sid: string,
    context: SessionContext
  ): Promise<void> {
    const { singleSessionPerUser } = await TenantSettingsService.get(tenantId);
    if (!singleSessionPerUser) return;
    const replaced = await SessionService.revokeOlderThan(userId, sid);
    if (replaced.length === 0) return;
    await AuditService.log(tenantId, userId, 'SESSION_REPLACED', 'users', userId, {
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
      closedSessions: replaced.length,
      closed: replaced.map((s) => ({ deviceIp: s.ip, deviceUserAgent: s.user_agent })),
    });
    emitSessionsRevoked(
      replaced.map((s) => s.sid),
      { reason: 'replaced_by_new_login' }
    );
  }

  /**
   * Token lifetimes, capped by the organization's maximum session length
   * (Administration > Organisation): `authTime` is when the user actually logged
   * in, carried over by every refresh, so refreshing never extends a session
   * past that limit.
   */
  private static async tokenLifetimes(tenantId: number, authTime: number): Promise<{ expiresIn: number; refreshExpiresIn: number }> {
    const { sessionMaxDays } = await TenantSettingsService.get(tenantId);
    const remaining = authTime + sessionMaxDays * 86_400 - Math.floor(Date.now() / 1000);
    if (remaining <= 0) {
      throw UnauthorizedError('Session expired, please log in again');
    }
    return {
      expiresIn: Math.min(this.parseExpiresIn(config.jwt.expiresIn), remaining),
      refreshExpiresIn: Math.min(this.parseExpiresIn(config.jwt.refreshExpiresIn), remaining),
    };
  }

  /**
   * Signs a session's access token, and its refresh token when `jti` is given.
   * Both carry the session id: authenticate() rejects an access token whose
   * session was revoked.
   */
  private static async signTokens(
    subject: TokenSubject,
    session: { sid: string; jti: string | null; authTime: number }
  ): Promise<RefreshResult> {
    const { tokenVersion, ...claims } = subject;
    const { expiresIn, refreshExpiresIn } = await this.tokenLifetimes(subject.tenantId, session.authTime);

    const accessToken = jwt.sign({ ...claims, sid: session.sid }, config.jwt.secret, { expiresIn });
    if (!session.jti) {
      return { accessToken, expiresIn };
    }

    const refreshToken = jwt.sign(
      {
        id: subject.id,
        type: 'refresh',
        tokenVersion: tokenVersion ?? 0,
        authTime: session.authTime,
        sid: session.sid,
        jti: session.jti,
      },
      config.jwt.refreshSecret,
      { expiresIn: refreshExpiresIn }
    );

    return { accessToken, refreshToken, expiresIn };
  }

  private static parseExpiresIn(value: string): number {
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) return 3600;

    const num = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return num;
      case 'm': return num * 60;
      case 'h': return num * 3600;
      case 'd': return num * 86400;
      default: return 3600;
    }
  }

}
