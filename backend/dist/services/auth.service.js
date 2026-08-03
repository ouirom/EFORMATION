"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const database_service_1 = require("./database.service");
const logger_1 = require("../utils/logger");
const error_middleware_1 = require("../middleware/error.middleware");
class AuthService {
    /**
     * Register a new user
     */
    static async register(data) {
        // Check if email already exists
        const existingUsers = await database_service_1.DatabaseService.query('SELECT id FROM users WHERE email = @email AND tenant_id = @tenantId', { email: data.email, tenantId: data.tenantId });
        if (existingUsers.length > 0) {
            throw (0, error_middleware_1.ConflictError)('Email already registered');
        }
        // Check username if provided
        const generatedUsername = data.username || data.email.split('@')[0] + '_' + Date.now().toString(36);
        const existingUsername = await database_service_1.DatabaseService.query('SELECT id FROM users WHERE username = @username AND tenant_id = @tenantId', { username: generatedUsername, tenantId: data.tenantId });
        if (existingUsername.length > 0) {
            throw (0, error_middleware_1.ConflictError)('Username already taken');
        }
        // Hash password
        const passwordHash = await bcryptjs_1.default.hash(data.password, config_1.config.bcryptRounds);
        // Insert user
        const result = await database_service_1.DatabaseService.query(`INSERT INTO users (
        tenant_id, email, username, password_hash, display_name, role,
        enterprise_id, direction_id, service_id, is_active
      )
      OUTPUT INSERTED.id
      VALUES (
        @tenantId, @email, @username, @passwordHash, @displayName, @role,
        @enterpriseId, @directionId, @serviceId, 1
      )`, {
            tenantId: data.tenantId,
            email: data.email,
            username: generatedUsername,
            passwordHash,
            displayName: data.displayName,
            role: data.role || 'agent',
            enterpriseId: data.enterpriseId || null,
            directionId: data.directionId || null,
            serviceId: data.serviceId || null,
        });
        const userId = result[0].id;
        // Create default notification preferences
        await database_service_1.DatabaseService.execute(`INSERT INTO notification_preferences (tenant_id, user_id)
       VALUES (@tenantId, @userId)`, { tenantId: data.tenantId, userId });
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
        await this.logAudit(data.tenantId, userId, 'USER_REGISTERED', 'users', userId);
        return {
            user: {
                id: userId,
                tenantId: data.tenantId,
                email: data.email,
                displayName: data.displayName,
                role: data.role || 'agent',
            },
            tokens,
        };
    }
    /**
     * Login with email and password
     */
    static async login(data) {
        // Find user
        const users = await database_service_1.DatabaseService.query(`SELECT id, tenant_id, email, password_hash, display_name, role,
              enterprise_id, direction_id, service_id, is_active
       FROM users 
       WHERE email = @email 
       ${data.tenantId ? 'AND tenant_id = @tenantId' : ''}
       AND deleted_at IS NULL`, { email: data.email, tenantId: data.tenantId });
        if (users.length === 0) {
            throw (0, error_middleware_1.UnauthorizedError)('Invalid email or password');
        }
        const user = users[0];
        if (!user.is_active) {
            throw (0, error_middleware_1.UnauthorizedError)('Account is disabled');
        }
        // Verify password
        const isValidPassword = await bcryptjs_1.default.compare(data.password, user.password_hash);
        if (!isValidPassword) {
            throw (0, error_middleware_1.UnauthorizedError)('Invalid email or password');
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
        await this.logAudit(user.tenant_id, user.id, 'USER_LOGIN', 'users', user.id);
        return {
            user: {
                id: user.id,
                tenantId: user.tenant_id,
                email: user.email,
                displayName: user.display_name,
                role: user.role,
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
    static async refreshToken(refreshToken) {
        try {
            const payload = jsonwebtoken_1.default.verify(refreshToken, config_1.config.jwt.refreshSecret);
            // Verify user still exists and is active
            const users = await database_service_1.DatabaseService.query(`SELECT id, tenant_id, email, role, enterprise_id, direction_id, service_id, is_active
         FROM users WHERE id = @id AND deleted_at IS NULL`, { id: payload.id });
            if (users.length === 0 || !users[0].is_active) {
                throw (0, error_middleware_1.UnauthorizedError)('User not found or inactive');
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
        }
        catch (error) {
            throw (0, error_middleware_1.UnauthorizedError)('Invalid refresh token');
        }
    }
    /**
     * Handle SSO login/registration
     */
    static async handleSSOLogin(provider, externalId, profile) {
        // Look for existing SSO identity
        const existingIdentities = await database_service_1.DatabaseService.query(`SELECT user_id, tenant_id FROM sso_identities 
       WHERE provider = @provider AND external_id = @externalId`, { provider, externalId });
        let userId;
        let tenantId;
        let isNewUser = false;
        if (existingIdentities.length > 0) {
            // Existing user - login
            userId = existingIdentities[0].user_id;
            tenantId = existingIdentities[0].tenant_id;
        }
        else {
            // Check if email exists
            const existingUsers = await database_service_1.DatabaseService.query(`SELECT id, tenant_id FROM users 
         WHERE email = @email AND deleted_at IS NULL`, { email: profile.email });
            if (existingUsers.length > 0) {
                // Link SSO to existing account
                userId = existingUsers[0].id;
                tenantId = existingUsers[0].tenant_id;
                await database_service_1.DatabaseService.execute(`INSERT INTO sso_identities (tenant_id, user_id, provider, external_id)
           VALUES (@tenantId, @userId, @provider, @externalId)`, { tenantId, userId, provider, externalId });
            }
            else {
                // Create new user
                if (!profile.tenantId) {
                    // Get default tenant
                    const defaultTenant = await database_service_1.DatabaseService.query('SELECT TOP 1 id FROM tenants ORDER BY id');
                    tenantId = defaultTenant[0]?.id || 1;
                }
                else {
                    tenantId = profile.tenantId;
                }
                const result = await database_service_1.DatabaseService.query(`INSERT INTO users (tenant_id, email, password_hash, display_name, role, is_active)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @email, 'SSO_USER', @displayName, 'agent', 1)`, {
                    tenantId,
                    email: profile.email,
                    displayName: profile.displayName,
                });
                userId = result[0].id;
                isNewUser = true;
                // Create SSO identity
                await database_service_1.DatabaseService.execute(`INSERT INTO sso_identities (tenant_id, user_id, provider, external_id)
           VALUES (@tenantId, @userId, @provider, @externalId)`, { tenantId, userId, provider, externalId });
                // Create notification preferences
                await database_service_1.DatabaseService.execute(`INSERT INTO notification_preferences (tenant_id, user_id)
           VALUES (@tenantId, @userId)`, { tenantId, userId });
            }
        }
        // Get full user data
        const users = await database_service_1.DatabaseService.query(`SELECT id, tenant_id, email, display_name, role, 
              enterprise_id, direction_id, service_id
       FROM users WHERE id = @userId`, { userId });
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
        await this.logAudit(user.tenant_id, user.id, `SSO_LOGIN_${provider.toUpperCase()}`, 'users', user.id);
        return {
            user: {
                id: user.id,
                tenantId: user.tenant_id,
                email: user.email,
                displayName: user.display_name,
                role: user.role,
            },
            tokens,
            isNewUser,
        };
    }
    /**
     * Change password
     */
    static async changePassword(userId, currentPassword, newPassword) {
        const users = await database_service_1.DatabaseService.query('SELECT password_hash, tenant_id FROM users WHERE id = @userId', { userId });
        if (users.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('User');
        }
        const user = users[0];
        // Verify current password
        const isValid = await bcryptjs_1.default.compare(currentPassword, user.password_hash);
        if (!isValid) {
            throw (0, error_middleware_1.BadRequestError)('Current password is incorrect');
        }
        // Hash new password
        const newPasswordHash = await bcryptjs_1.default.hash(newPassword, config_1.config.bcryptRounds);
        await database_service_1.DatabaseService.execute('UPDATE users SET password_hash = @passwordHash WHERE id = @userId', { passwordHash: newPasswordHash, userId });
        await this.logAudit(user.tenant_id, userId, 'PASSWORD_CHANGED', 'users', userId);
    }
    /**
     * Request password reset
     */
    static async requestPasswordReset(email, tenantId) {
        const users = await database_service_1.DatabaseService.query(`SELECT id, tenant_id FROM users 
       WHERE email = @email 
       ${tenantId ? 'AND tenant_id = @tenantId' : ''}
       AND deleted_at IS NULL`, { email, tenantId });
        if (users.length === 0) {
            // Don't reveal if user exists
            return 'If the email exists, a reset link will be sent';
        }
        const user = users[0];
        // Generate reset token
        const resetToken = jsonwebtoken_1.default.sign({ userId: user.id, type: 'password_reset' }, config_1.config.jwt.secret, { expiresIn: '1h' });
        // TODO: Send email with reset link
        logger_1.logger.info(`Password reset token generated for user ${user.id}: ${resetToken}`);
        return resetToken; // In production, don't return this - send via email
    }
    /**
     * Reset password with token
     */
    static async resetPassword(token, newPassword) {
        try {
            const payload = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
            if (payload.type !== 'password_reset') {
                throw (0, error_middleware_1.BadRequestError)('Invalid reset token');
            }
            const passwordHash = await bcryptjs_1.default.hash(newPassword, config_1.config.bcryptRounds);
            const result = await database_service_1.DatabaseService.execute('UPDATE users SET password_hash = @passwordHash WHERE id = @userId', { passwordHash, userId: payload.userId });
            if (result.rowsAffected === 0) {
                throw (0, error_middleware_1.NotFoundError)('User');
            }
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw (0, error_middleware_1.BadRequestError)('Invalid or expired reset token');
            }
            throw error;
        }
    }
    /**
     * Logout (invalidate token - requires Redis/blacklist in production)
     */
    static async logout(userId, tenantId) {
        // TODO: Add token to blacklist in Redis
        await this.logAudit(tenantId, userId, 'USER_LOGOUT', 'users', userId);
    }
    /**
     * Generate access and refresh tokens
     */
    static generateTokenPair(payload) {
        // @ts-expect-error - jwt.sign overload resolution with dynamic expiresIn string type
        const accessToken = jsonwebtoken_1.default.sign(payload, config_1.config.jwt.secret, {
            expiresIn: config_1.config.jwt.expiresIn,
        });
        // @ts-expect-error - jwt.sign overload resolution with dynamic expiresIn string type
        const refreshToken = jsonwebtoken_1.default.sign({ id: payload.id, type: 'refresh' }, config_1.config.jwt.refreshSecret, { expiresIn: config_1.config.jwt.refreshExpiresIn });
        // Parse expiresIn to seconds
        const expiresIn = this.parseExpiresIn(config_1.config.jwt.expiresIn);
        return { accessToken, refreshToken, expiresIn: expiresIn };
    }
    static parseExpiresIn(value) {
        const match = value.match(/^(\d+)([smhd])$/);
        if (!match)
            return 3600;
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
    static async logAudit(tenantId, userId, action, entity, entityId) {
        try {
            await database_service_1.DatabaseService.execute(`INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id)
         VALUES (@tenantId, @userId, @action, @entity, @entityId)`, { tenantId, userId, action, entity, entityId });
        }
        catch (error) {
            logger_1.logger.error('Failed to log audit:', error);
        }
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map