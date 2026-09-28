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
 * A password login whose password is older than the organization allows: no
 * session is opened, the user must first choose a new password with this
 * short-lived reset token (same flow as "forgot password").
 */
export interface PasswordExpiredResult {
  passwordExpired: true;
  resetToken: string;
}

const EXPIRED_PASSWORD_RESET_TTL = '15m';

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
}

interface LoginDTO {
  email: string;
  password: string;
  tenantId?: number;
  ip?: string;
  userAgent?: string;
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
              enterprise_id, subsidiary_id, direction_id, service_id, is_active, status, password_changed_at
            )
            VALUES (
              @tenantId, @email, @username, @passwordHash, @displayName, @role,
              @enterpriseId, @subsidiaryId, @directionId, @serviceId, @isActive, @status, ${db.now()}
            )
            RETURNING id`
          : `INSERT INTO users (
              tenant_id, email, username, password_hash, display_name, role,
              enterprise_id, subsidiary_id, direction_id, service_id, is_active, status, password_changed_at
            )
            OUTPUT INSERTED.id
            VALUES (
              @tenantId, @email, @username, @passwordHash, @displayName, @role,
              @enterpriseId, @subsidiaryId, @directionId, @serviceId, @isActive, @status, ${db.now()}
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
          body: `${data.displayName} (${data.email}) vient de créer un compte et attend une activation.`,
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
  ): Promise<{ user: Partial<User>; tokens: TokenPair } | PasswordExpiredResult> {
    // Find user
    const users = await DatabaseService.query<{
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
    }>(
      // db_now comes from the same clock as the stored timestamps, so the lock and
      // password-age arithmetic below never depends on the app server's time zone.
      `SELECT id, tenant_id, email, password_hash, display_name, avatar_url, role,
              enterprise_id, direction_id, service_id, is_active, status, token_version,
              failed_login_attempts, locked_until,
              COALESCE(password_changed_at, created_at) AS password_set_at, ${db.now()} AS db_now
       FROM users
       WHERE email = @email
       ${data.tenantId ? 'AND tenant_id = @tenantId' : ''}
       AND deleted_at IS NULL`,
      { email: data.email, tenantId: data.tenantId }
    );

    if (users.length === 0) {
      throw UnauthorizedError('Invalid email or password');
    }

    const user = users[0];

    if (user.status !== 'active') {
      const messages: Record<string, string> = {
        pending: "Votre compte est en attente d'activation par votre responsable.",
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

    // Generate tokens
    const tokens = await this.issueTokens({
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
      tokenVersion: user.token_version,
      enterpriseId: user.enterprise_id,
      directionId: user.direction_id,
      serviceId: user.service_id,
    });

    await DatabaseService.execute(
      `UPDATE users SET last_login_at = ${db.now()} WHERE id = @id`,
      { id: user.id }
    );

    // Log audit
    await AuditService.log(user.tenant_id, user.id, 'USER_LOGIN', 'users', user.id, {
      ip: data.ip,
      userAgent: data.userAgent,
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
      },
      tokens,
    };
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;

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

      // A password reset bumps token_version, so a refresh token minted before the
      // reset can never renew again -- closes the window where a leaked refresh
      // token would otherwise keep working after the account owner reset their password.
      if ((payload.tokenVersion ?? 0) !== user.token_version) {
        throw UnauthorizedError('Invalid refresh token');
      }

      // The original login time travels with every refresh token (older tokens
      // without it fall back to their issue time), so the organization's maximum
      // session length counts from the real login, not from the last refresh.
      return await this.issueTokens(
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
        Number(payload.authTime ?? payload.iat)
      );
    } catch (error) {
      throw UnauthorizedError('Invalid refresh token');
    }
  }

  /**
   * super_admin only: mint a fresh token pair scoped to a different tenant, so
   * every existing route (which all trust req.user.tenantId from the JWT) works
   * unmodified once the super_admin is "acting as" that organization. See the
   * authenticateHandler special case in auth.middleware.ts that allows a
   * super_admin's token tenantId to differ from their stored home tenant_id.
   */
  static async switchTenant(currentUserId: number, currentUserRole: string, targetTenantId: number): Promise<{ tokens: TokenPair; tenant: { id: number; name: string } }> {
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

    const users = await DatabaseService.query<{ id: number; email: string; token_version: number }>(
      `SELECT id, email, token_version FROM users WHERE id = @id AND role = 'super_admin' AND deleted_at IS NULL`,
      { id: currentUserId }
    );
    if (users.length === 0) {
      throw UnauthorizedError('Super admin account not found');
    }

    const tokens = await this.issueTokens({
      id: users[0].id,
      tenantId: targetTenantId,
      email: users[0].email,
      role: 'super_admin',
      tokenVersion: users[0].token_version,
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

    const tokens = await this.issueTokens({
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
      tokenVersion: user.token_version,
      enterpriseId: user.enterprise_id,
      directionId: user.direction_id,
      serviceId: user.service_id,
    });

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
  }): Promise<{ user: Partial<User>; tokens: TokenPair; isNewUser: boolean }> {
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
    }>(
      `SELECT id, tenant_id, email, display_name, role, enterprise_id, direction_id, service_id, token_version
       FROM users WHERE id = @userId`,
      { userId }
    );

    const user = users[0];

    const tokens = await this.issueTokens({
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
      tokenVersion: user.token_version,
      enterpriseId: user.enterprise_id,
      directionId: user.direction_id,
      serviceId: user.service_id,
    });

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
    newPassword: string
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

    await AuditService.log(user.tenant_id, userId, 'PASSWORD_CHANGED', 'users', userId);

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
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw BadRequestError('Invalid or expired reset token');
      }
      throw error;
    }
  }

  /**
   * Logout (invalidate token - requires Redis/blacklist in production)
   */
  static async logout(userId: number, tenantId: number): Promise<void> {
    // TODO: Add token to blacklist in Redis
    await AuditService.log(tenantId, userId, 'USER_LOGOUT', 'users', userId);
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
   * Access and refresh tokens, capped by the organization's maximum session
   * length (Administration > Organisation): `authTime` is when the user actually
   * logged in, and it is carried over by every refresh, so refreshing never
   * extends a session past that limit.
   */
  private static async issueTokens(
    payload: {
      id: number;
      tenantId: number;
      email: string;
      role: string;
      tokenVersion?: number;
      enterpriseId?: number;
      directionId?: number;
      serviceId?: number;
    },
    authTime: number = Math.floor(Date.now() / 1000)
  ): Promise<TokenPair> {
    const { tokenVersion, ...accessPayload } = payload;

    const { sessionMaxDays } = await TenantSettingsService.get(payload.tenantId);
    const remaining = authTime + sessionMaxDays * 86_400 - Math.floor(Date.now() / 1000);
    if (remaining <= 0) {
      throw UnauthorizedError('Session expired, please log in again');
    }
    const expiresIn = Math.min(this.parseExpiresIn(config.jwt.expiresIn), remaining);
    const refreshExpiresIn = Math.min(this.parseExpiresIn(config.jwt.refreshExpiresIn), remaining);

    const accessToken = jwt.sign(accessPayload, config.jwt.secret, { expiresIn });

    const refreshToken = jwt.sign(
      { id: payload.id, type: 'refresh', tokenVersion: tokenVersion ?? 0, authTime },
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
