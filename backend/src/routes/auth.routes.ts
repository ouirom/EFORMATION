import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { AuthService } from '../services/auth.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { TenantRequest } from '../middleware/tenant.middleware';
import { BadRequestError } from '../middleware/error.middleware';
import { config } from '../config';

const router = Router();

// Validation helper
const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user
 */
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('displayName').notEmpty().trim(),
    body('username').optional().trim(),
  ],
  async (req: TenantRequest, res, next) => {
    try {
      validate(req);

      if (!req.tenantId) {
        throw BadRequestError('Tenant ID is required');
      }

      const result = await AuthService.register({
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
        secure: config.nodeEnv === 'production',
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
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/auth/login
 * @desc Login with email and password
 */
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req: TenantRequest, res, next) => {
    try {
      validate(req);

      const result = await AuthService.login({
        email: req.body.email,
        password: req.body.password,
        tenantId: req.tenantId,
      });

      // Set refresh token in HTTP-only cookie
      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
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
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh access token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      throw BadRequestError('Refresh token is required');
    }

    const tokens = await AuthService.refreshToken(refreshToken);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
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
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user
 */
router.post('/logout', authenticate, async (req: AuthRequest, res, next) => {
  try {
    await AuthService.logout(req.user!.id, req.user!.tenantId);

    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/auth/me
 * @desc Get current user
 */
router.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    res.json({
      success: true,
      data: req.user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/auth/change-password
 * @desc Change password
 */
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      await AuthService.changePassword(
        req.user!.id,
        req.body.currentPassword,
        req.body.newPassword
      );

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/auth/forgot-password
 * @desc Request password reset
 */
router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  async (req: TenantRequest, res, next) => {
    try {
      validate(req);

      await AuthService.requestPasswordReset(req.body.email, req.tenantId);

      res.json({
        success: true,
        message: 'If the email exists, a reset link will be sent',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/auth/reset-password
 * @desc Reset password with token
 */
router.post(
  '/reset-password',
  [
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  async (req, res, next) => {
    try {
      validate(req);

      await AuthService.resetPassword(req.body.token, req.body.newPassword);

      res.json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/auth/sso/azure
 * @desc Initiate Azure AD SSO
 */
router.get('/sso/azure', (req, res) => {
  const { tenantId, clientId } = config.azureAd;
  const redirectUri = `${config.frontendUrl}/auth/callback/azure`;
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
      throw BadRequestError('Authorization code is required');
    }

    // Exchange code for tokens with Azure AD
    // This is a simplified version - in production, use MSAL library
    const result = await AuthService.handleSSOLogin(
      'azure_ad',
      req.body.externalId,
      {
        email: req.body.email,
        displayName: req.body.displayName,
        tenantId: req.body.tenantId,
      }
    );

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
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
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/auth/sso/google
 * @desc Initiate Google SSO
 */
router.get('/sso/google', (req, res) => {
  const { clientId } = config.google;
  const redirectUri = `${config.frontendUrl}/auth/callback/google`;
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
      throw BadRequestError('Authorization code is required');
    }

    const result = await AuthService.handleSSOLogin(
      'google',
      req.body.externalId,
      {
        email: req.body.email,
        displayName: req.body.displayName,
        tenantId: req.body.tenantId,
      }
    );

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
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
  } catch (error) {
    next(error);
  }
});

export default router;
