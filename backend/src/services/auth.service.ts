import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { DatabaseService } from './database.service';
import { db, IS_PG } from '../database/db-helpers';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import { User, SSOIdentity, SSOProvider } from '../types';
import { logger } from '../utils/logger';
import { 
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

interface RegisterDTO {
  tenantId: number;
  email: string;
  password: string;
  displayName: string;
  username?: string;
  role?: string;
  enterpriseId?: number;
  directionId?: number;
  serviceId?: number;
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
  static async register(data: RegisterDTO): Promise<{ user: Partial<User> }> {
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

    // Insert user — pending, not active, until an n+1 activates the account.
    let result: { id: number }[];
    try {
      result = await DatabaseService.query<{ id: number }>(
        // Booleans are bound as params (not `0`/`1`/`TRUE` literals) so the driver's own
        // type binding handles mssql BIT vs pg boolean without a dialect branch here.
        IS_PG
          ? `INSERT INTO users (
              tenant_id, email, username, password_hash, display_name, role,
              enterprise_id, direction_id, service_id, is_active, status
            )
            VALUES (
              @tenantId, @email, @username, @passwordHash, @displayName, @role,
              @enterpriseId, @directionId, @serviceId, @isActive, 'pending'
            )
            RETURNING id`
          : `INSERT INTO users (
              tenant_id, email, username, password_hash, display_name, role,
              enterprise_id, direction_id, service_id, is_active, status
            )
            OUTPUT INSERTED.id
            VALUES (
              @tenantId, @email, @username, @passwordHash, @displayName, @role,
              @enterpriseId, @directionId, @serviceId, @isActive, 'pending'
            )`,
        {
          tenantId: data.tenantId,
          email: data.email,
          username: generatedUsername,
          passwordHash,
          displayName: data.displayName,
          role: data.role || 'agent',
          enterpriseId: data.enterpriseId || null,
          directionId: data.directionId || null,
          serviceId: data.serviceId || null,
          isActive: false,
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
    await AuditService.log(data.tenantId, userId, 'USER_REGISTERED', 'users', userId, { status: 'pending' });

    // Best-effort: a failed notification must never fail the registration itself.
    this.notifyApproversOfPendingRegistration(data).catch((error) => {
      logger.error('Failed to notify approvers of a pending registration', { error, userId });
    });

    return {
      user: {
        id: userId,
        tenantId: data.tenantId,
        email: data.email,
        displayName: data.displayName,
        role: (data.role as any) || 'agent',
      },
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
          body: `${data.displayName} (${data.email}) vient de créer un compte et attend une activation.`,
          actionUrl: `${config.frontendUrl}/admin/users?status=pending`,
        }).catch(() => {});
      }
    }
  }

  /**
   * Login with email and password
   */
  static async login(data: LoginDTO): Promise<{ user: Partial<User>; tokens: TokenPair }> {
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
    }>(
      `SELECT id, tenant_id, email, password_hash, display_name, avatar_url, role,
              enterprise_id, direction_id, service_id, is_active, status
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

    // Verify password
    const isValidPassword = await bcrypt.compare(data.password, user.password_hash);
    if (!isValidPassword) {
      await AuditService.log(user.tenant_id, user.id, 'LOGIN_FAILED', 'users', user.id, {
        reason: 'invalid_password',
        ip: data.ip,
        userAgent: data.userAgent,
      });
      throw UnauthorizedError('Invalid email or password');
    }

    // Generate tokens
    const tokens = this.generateTokenPair({
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
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
      }>(
        `SELECT id, tenant_id, email, role, enterprise_id, direction_id, service_id, is_active
         FROM users WHERE id = @id AND deleted_at IS NULL`,
        { id: payload.id }
      );

      if (users.length === 0 || !users[0].is_active) {
        throw UnauthorizedError('User not found or inactive');
      }

      const user = users[0];

      return this.generateTokenPair({
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        role: user.role,
        enterpriseId: user.enterprise_id,
        directionId: user.direction_id,
        serviceId: user.service_id,
      });
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

    const users = await DatabaseService.query<{ id: number; email: string }>(
      `SELECT id, email FROM users WHERE id = @id AND role = 'super_admin' AND deleted_at IS NULL`,
      { id: currentUserId }
    );
    if (users.length === 0) {
      throw UnauthorizedError('Super admin account not found');
    }

    const tokens = this.generateTokenPair({
      id: users[0].id,
      tenantId: targetTenantId,
      email: users[0].email,
      role: 'super_admin',
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
        // Link SSO to existing account
        userId = existingUsers[0].id;
        tenantId = existingUsers[0].tenant_id;

        await DatabaseService.execute(
          `INSERT INTO sso_identities (tenant_id, user_id, provider, external_id)
           VALUES (@tenantId, @userId, @provider, @externalId)`,
          { tenantId, userId, provider, externalId }
        );
      } else {
        // Create new user
        if (!profile.tenantId) {
          // Get default tenant
          const defaultTenant = await DatabaseService.query<{ id: number }>(
            IS_PG
              ? 'SELECT id FROM tenants ORDER BY id LIMIT 1'
              : 'SELECT TOP 1 id FROM tenants ORDER BY id'
          );
          tenantId = defaultTenant[0]?.id || 1;
        } else {
          tenantId = profile.tenantId;
        }

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
    }>(
      `SELECT id, tenant_id, email, display_name, role, 
              enterprise_id, direction_id, service_id
       FROM users WHERE id = @userId`,
      { userId }
    );

    const user = users[0];

    const tokens = this.generateTokenPair({
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
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
      userId = existingUsers[0].id;
    } else {
      const defaultTenant = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? 'SELECT id FROM tenants ORDER BY id LIMIT 1'
          : 'SELECT TOP 1 id FROM tenants ORDER BY id'
      );
      const tenantId = defaultTenant[0]?.id || config.defaultTenantId;

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
    }>(
      `SELECT id, tenant_id, email, display_name, role, enterprise_id, direction_id, service_id
       FROM users WHERE id = @userId`,
      { userId }
    );

    const user = users[0];

    const tokens = this.generateTokenPair({
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
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
  ): Promise<void> {
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

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, config.bcryptRounds);

    await DatabaseService.execute(
      'UPDATE users SET password_hash = @passwordHash WHERE id = @userId',
      { passwordHash: newPasswordHash, userId }
    );

    await AuditService.log(user.tenant_id, userId, 'PASSWORD_CHANGED', 'users', userId);
  }

  /**
   * Request password reset
   */
  static async requestPasswordReset(email: string, tenantId?: number): Promise<string> {
    const users = await DatabaseService.query<{ id: number; tenant_id: number }>(
      `SELECT id, tenant_id FROM users 
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

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password_reset' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

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

      const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);

      const result = await DatabaseService.execute(
        'UPDATE users SET password_hash = @passwordHash WHERE id = @userId',
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

  /**
   * Generate access and refresh tokens
   */
  private static generateTokenPair(payload: {
    id: number;
    tenantId: number;
    email: string;
    role: string;
    enterpriseId?: number;
    directionId?: number;
    serviceId?: number;
  }): TokenPair {
    // @ts-expect-error - jwt.sign overload resolution with dynamic expiresIn string type
    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    // @ts-expect-error - jwt.sign overload resolution with dynamic expiresIn string type
    const refreshToken = jwt.sign(
      { id: payload.id, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    // Parse expiresIn to seconds
    const expiresIn = this.parseExpiresIn(config.jwt.expiresIn);

    return { accessToken, refreshToken, expiresIn: expiresIn };
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
