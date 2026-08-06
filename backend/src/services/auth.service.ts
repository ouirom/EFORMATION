import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { DatabaseService } from './database.service';
import { AuditService } from './audit.service';
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
   * Register a new user
   */
  static async register(data: RegisterDTO): Promise<{ user: Partial<User>; tokens: TokenPair }> {
    // Check if email already exists
    const existingUsers = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM users WHERE email = @email AND tenant_id = @tenantId',
      { email: data.email, tenantId: data.tenantId }
    );

    if (existingUsers.length > 0) {
      throw ConflictError('Email already registered');
    }

    // Check username if provided
    const generatedUsername = data.username || data.email.split('@')[0] + '_' + Date.now().toString(36);
    
    const existingUsername = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM users WHERE username = @username AND tenant_id = @tenantId',
      { username: generatedUsername, tenantId: data.tenantId }
    );

    if (existingUsername.length > 0) {
      throw ConflictError('Username already taken');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);

    // Insert user
    const result = await DatabaseService.query<{ id: number }>(
      `INSERT INTO users (
        tenant_id, email, username, password_hash, display_name, role,
        enterprise_id, direction_id, service_id, is_active
      )
      OUTPUT INSERTED.id
      VALUES (
        @tenantId, @email, @username, @passwordHash, @displayName, @role,
        @enterpriseId, @directionId, @serviceId, 1
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
      }
    );

    const userId = result[0].id;

    // Create default notification preferences
    await DatabaseService.execute(
      `INSERT INTO notification_preferences (tenant_id, user_id)
       VALUES (@tenantId, @userId)`,
      { tenantId: data.tenantId, userId }
    );

    // Generate tokens
    const tokens = this.generateTokenPair({
      id: userId,
      tenantId: data.tenantId,
      email: data.email,
      role: data.role || 'agent',
      enterpriseId: data.enterpriseId,
      directionId: data.directionId,
      serviceId: data.serviceId,
    });

    // Log audit
    await AuditService.log(data.tenantId, userId, 'USER_REGISTERED', 'users', userId);

    return {
      user: {
        id: userId,
        tenantId: data.tenantId,
        email: data.email,
        displayName: data.displayName,
        role: data.role as any || 'agent',
      },
      tokens,
    };
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
    }>(
      `SELECT id, tenant_id, email, password_hash, display_name, avatar_url, role,
              enterprise_id, direction_id, service_id, is_active
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

    if (!user.is_active) {
      await AuditService.log(user.tenant_id, user.id, 'LOGIN_FAILED', 'users', user.id, {
        reason: 'account_disabled',
        ip: data.ip,
        userAgent: data.userAgent,
      });
      throw UnauthorizedError('Account is disabled');
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
            'SELECT TOP 1 id FROM tenants ORDER BY id'
          );
          tenantId = defaultTenant[0]?.id || 1;
        } else {
          tenantId = profile.tenantId;
        }

        const result = await DatabaseService.query<{ id: number }>(
          `INSERT INTO users (tenant_id, email, password_hash, display_name, role, is_active)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @email, 'SSO_USER', @displayName, 'agent', 1)`,
          {
            tenantId,
            email: profile.email,
            displayName: profile.displayName,
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
        'SELECT TOP 1 id FROM tenants ORDER BY id'
      );
      const tenantId = defaultTenant[0]?.id || config.defaultTenantId;

      const result = await DatabaseService.query<{ id: number }>(
        `INSERT INTO users (tenant_id, email, password_hash, display_name, role, is_active)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @email, 'LDAP_USER', @displayName, 'agent', 1)`,
        { tenantId, email: profile.email, displayName: profile.displayName }
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

    // TODO: Send email with reset link
    logger.info(`Password reset token generated for user ${user.id}: ${resetToken}`);

    return resetToken; // In production, don't return this - send via email
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
