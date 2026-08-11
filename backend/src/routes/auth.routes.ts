import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../services/auth.service';
import { OAuthService } from '../services/oauth.service';
import { LdapService } from '../services/ldap.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { TenantRequest } from '../middleware/tenant.middleware';
import { BadRequestError } from '../middleware/error.middleware';
import { config } from '../config';

const router = Router();

// Sensitive, abuse-prone endpoints (credential guessing, account enumeration, mail-bombing)
// get a much tighter limit than the general API — keyed by IP + email so one attacker can't
// exhaust the budget for every email they try, and one legitimate typo-prone user isn't
// blocked out by someone else's traffic.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: { message: 'Too many attempts, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${(req.body?.email || '').toLowerCase()}`,
});

// Validation helper
const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// Mirrors the complexity rules the frontend already displays/enforces
// (RegisterPage.tsx's passwordRequirements) -- without this, those rules were
// purely cosmetic and any client hitting the API directly could set a
// password as weak as "aaaaaaaa".
const isComplexPassword = (value: string) =>
  /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[!@#$%^&*(),.?":{}|<>]/.test(value);
const passwordComplexityMessage =
  'Password must contain an uppercase letter, a lowercase letter, a digit, and a special character';

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user
 */
router.post(
  '/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .bail()
      .custom(isComplexPassword)
      .withMessage(passwordComplexityMessage),
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

      // Pending accounts get no tokens — they can't log in until an n+1
      // activates them (PUT /users/:id/status).
      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          pending: true,
          message: "Votre compte a été créé et est en attente d'activation par votre responsable.",
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
  authLimiter,
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
        ip: req.ip,
        userAgent: req.get('user-agent'),
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
 * @route POST /api/v1/auth/switch-tenant
 * @desc super_admin only: issue a fresh token pair scoped to a different tenant
 */
router.post(
  '/switch-tenant',
  authenticate,
  [body('tenantId').isInt()],
  async (req: AuthRequest, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
      }

      const result = await AuthService.switchTenant(
        req.user!.id,
        req.user!.role,
        parseInt(req.body.tenantId, 10)
      );

      res.json({
        success: true,
        data: {
          tenant: result.tenant,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

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
  authLimiter,
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
  authLimiter,
  [
    body('token').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .bail()
      .custom(isComplexPassword)
      .withMessage(passwordComplexityMessage),
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
 * @desc Handle Azure AD SSO callback — exchanges the authorization code for a
 * verified profile via Microsoft's own token + Graph endpoints before logging in.
 */
router.post('/sso/azure/callback', async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      throw BadRequestError('Authorization code is required');
    }

    const profile = await OAuthService.exchangeAzureCode(code);

    const result = await AuthService.handleSSOLogin('azure_ad', profile.externalId, {
      email: profile.email,
      displayName: profile.displayName,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

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
 * @desc Handle Google SSO callback — exchanges the authorization code for a
 * verified profile via Google's own token + userinfo endpoints before logging in.
 */
router.post('/sso/google/callback', async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      throw BadRequestError('Authorization code is required');
    }

    const profile = await OAuthService.exchangeGoogleCode(code);

    const result = await AuthService.handleSSOLogin('google', profile.externalId, {
      email: profile.email,
      displayName: profile.displayName,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

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
 * @route GET /api/v1/auth/sso/providers
 * @desc Report which login methods are actually usable, so the frontend can hide
 * options that have no credentials configured instead of failing after a click.
 */
router.get('/sso/providers', (req, res) => {
  res.json({
    success: true,
    data: {
      azure: !!(config.azureAd.clientId && config.azureAd.clientSecret),
      google: !!(config.google.clientId && config.google.clientSecret),
      ldap: LdapService.isConfigured(),
    },
  });
});

/**
 * @route POST /api/v1/auth/ldap/login
 * @desc Authenticate against the configured LDAP/Active Directory server. Auto-
 * provisions a local account on first login, matching the SSO provisioning flow.
 */
router.post(
  '/ldap/login',
  authLimiter,
  [body('username').notEmpty().trim(), body('password').notEmpty()],
  async (req, res, next) => {
    try {
      validate(req);

      const profile = await LdapService.authenticate(req.body.username, req.body.password);
      const result = await AuthService.handleLdapLogin({
        ...profile,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

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
  }
);

export default router;
