"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_service_1 = require("../services/auth.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const config_1 = require("../config");
const router = (0, express_1.Router)();
// Validation helper
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user
 */
router.post('/register', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    (0, express_validator_1.body)('displayName').notEmpty().trim(),
    (0, express_validator_1.body)('username').optional().trim(),
], async (req, res, next) => {
    try {
        validate(req);
        if (!req.tenantId) {
            throw (0, error_middleware_1.BadRequestError)('Tenant ID is required');
        }
        const result = await auth_service_1.AuthService.register({
            tenantId: req.tenantId,
            email: req.body.email,
            password: req.body.password,
            displayName: req.body.displayName,
            username: req.body.username,
            role: req.body.role,
            enterpriseId: req.body.enterpriseId,
            directionId: req.body.directionId,
            serviceId: req.body.serviceId,
        });
        // Set refresh token in HTTP-only cookie
        res.cookie('refreshToken', result.tokens.refreshToken, {
            httpOnly: true,
            secure: config_1.config.nodeEnv === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
        res.status(201).json({
            success: true,
            data: {
                user: result.user,
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
                expiresIn: result.tokens.expiresIn,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/auth/login
 * @desc Login with email and password
 */
router.post('/login', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').notEmpty(),
], async (req, res, next) => {
    try {
        validate(req);
        const result = await auth_service_1.AuthService.login({
            email: req.body.email,
            password: req.body.password,
            tenantId: req.tenantId,
        });
        // Set refresh token in HTTP-only cookie
        res.cookie('refreshToken', result.tokens.refreshToken, {
            httpOnly: true,
            secure: config_1.config.nodeEnv === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        res.json({
            success: true,
            data: {
                user: result.user,
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
                expiresIn: result.tokens.expiresIn,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh access token
 */
router.post('/refresh', async (req, res, next) => {
    try {
        const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
        if (!refreshToken) {
            throw (0, error_middleware_1.BadRequestError)('Refresh token is required');
        }
        const tokens = await auth_service_1.AuthService.refreshToken(refreshToken);
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: config_1.config.nodeEnv === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        res.json({
            success: true,
            data: {
                accessToken: tokens.accessToken,
                expiresIn: tokens.expiresIn,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user
 */
router.post('/logout', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        await auth_service_1.AuthService.logout(req.user.id, req.user.tenantId);
        res.clearCookie('refreshToken');
        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/auth/me
 * @desc Get current user
 */
router.get('/me', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: req.user,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/auth/change-password
 * @desc Change password
 */
router.post('/change-password', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('currentPassword').notEmpty(),
    (0, express_validator_1.body)('newPassword').isLength({ min: 8 }),
], async (req, res, next) => {
    try {
        validate(req);
        await auth_service_1.AuthService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
        res.json({
            success: true,
            message: 'Password changed successfully',
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/auth/forgot-password
 * @desc Request password reset
 */
router.post('/forgot-password', [(0, express_validator_1.body)('email').isEmail().normalizeEmail()], async (req, res, next) => {
    try {
        validate(req);
        await auth_service_1.AuthService.requestPasswordReset(req.body.email, req.tenantId);
        res.json({
            success: true,
            message: 'If the email exists, a reset link will be sent',
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/auth/reset-password
 * @desc Reset password with token
 */
router.post('/reset-password', [
    (0, express_validator_1.body)('token').notEmpty(),
    (0, express_validator_1.body)('newPassword').isLength({ min: 8 }),
], async (req, res, next) => {
    try {
        validate(req);
        await auth_service_1.AuthService.resetPassword(req.body.token, req.body.newPassword);
        res.json({
            success: true,
            message: 'Password reset successfully',
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/auth/sso/azure
 * @desc Initiate Azure AD SSO
 */
router.get('/sso/azure', (req, res) => {
    const { tenantId, clientId } = config_1.config.azureAd;
    const redirectUri = `${config_1.config.frontendUrl}/auth/callback/azure`;
    const scope = 'openid profile email';
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
        `client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}&response_mode=query`;
    res.redirect(authUrl);
});
/**
 * @route POST /api/v1/auth/sso/azure/callback
 * @desc Handle Azure AD SSO callback
 */
router.post('/sso/azure/callback', async (req, res, next) => {
    try {
        const { code } = req.body;
        if (!code) {
            throw (0, error_middleware_1.BadRequestError)('Authorization code is required');
        }
        // Exchange code for tokens with Azure AD
        // This is a simplified version - in production, use MSAL library
        const result = await auth_service_1.AuthService.handleSSOLogin('azure_ad', req.body.externalId, {
            email: req.body.email,
            displayName: req.body.displayName,
            tenantId: req.body.tenantId,
        });
        res.cookie('refreshToken', result.tokens.refreshToken, {
            httpOnly: true,
            secure: config_1.config.nodeEnv === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        res.json({
            success: true,
            data: {
                user: result.user,
                accessToken: result.tokens.accessToken,
                expiresIn: result.tokens.expiresIn,
                isNewUser: result.isNewUser,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/auth/sso/google
 * @desc Initiate Google SSO
 */
router.get('/sso/google', (req, res) => {
    const { clientId } = config_1.config.google;
    const redirectUri = `${config_1.config.frontendUrl}/auth/callback/google`;
    const scope = 'openid profile email';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}`;
    res.redirect(authUrl);
});
/**
 * @route POST /api/v1/auth/sso/google/callback
 * @desc Handle Google SSO callback
 */
router.post('/sso/google/callback', async (req, res, next) => {
    try {
        const { code } = req.body;
        if (!code) {
            throw (0, error_middleware_1.BadRequestError)('Authorization code is required');
        }
        const result = await auth_service_1.AuthService.handleSSOLogin('google', req.body.externalId, {
            email: req.body.email,
            displayName: req.body.displayName,
            tenantId: req.body.tenantId,
        });
        res.cookie('refreshToken', result.tokens.refreshToken, {
            httpOnly: true,
            secure: config_1.config.nodeEnv === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        res.json({
            success: true,
            data: {
                user: result.user,
                accessToken: result.tokens.accessToken,
                expiresIn: result.tokens.expiresIn,
                isNewUser: result.isNewUser,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map