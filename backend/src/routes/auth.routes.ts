import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../services/auth.service';
import { OAuthService } from '../services/oauth.service';
import { LdapService } from '../services/ldap.service';
import { SsoConfigService, SsoProvider } from '../services/sso-config.service';
import { OrgStructureService } from '../services/org-structure.service';
import jwt from 'jsonwebtoken';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { TenantRequest } from '../middleware/tenant.middleware';
import { BadRequestError, ApiError } from '../middleware/error.middleware';
import { TenantSettingsService, MIN_PASSWORD_LENGTH } from '../services/tenant-settings.service';
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

// Only the platform-wide floor is checked here; the organization's own password
// policy (length, complexity -- Administration > Organisation) is enforced by
// AuthService.assertPasswordAllowed wherever a password is set.
const passwordFloor = (field: string) =>
  body(field)
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);

/** What the sign-up / reset / change-password forms show and pre-check. */
function publicPasswordPolicy(settings: { passwordMinLength: number; passwordRequireComplexity: boolean }) {
  return {
    minLength: Math.max(MIN_PASSWORD_LENGTH, settings.passwordMinLength),
    requireComplexity: settings.passwordRequireComplexity,
  };
}

/**
 * @route GET /api/v1/auth/registration-settings
 * @desc Public: whether the (header/subdomain-resolved) organization accepts sign-ups,
 * and its default language -- read by the register and login pages before login.
 */
router.get('/registration-settings', async (req: TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      throw BadRequestError('Tenant ID is required');
    }
    const settings = await TenantSettingsService.get(req.tenantId);
    res.json({
      success: true,
      data: {
        allowSelfRegistration: settings.allowSelfRegistration,
        defaultLanguage: settings.defaultLanguage,
        requireApproval: settings.requireRegistrationApproval,
        allowedEmailDomains: settings.allowedEmailDomains,
        passwordPolicy: publicPasswordPolicy(settings),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/auth/legal
 * @desc Public: the organization's legal notice, privacy policy link and data
 * protection contact (Administration > Organisation > Conformité).
 */
router.get('/legal', async (req: TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      throw BadRequestError('Tenant ID is required');
    }
    const settings = await TenantSettingsService.get(req.tenantId);
    res.json({
      success: true,
      data: {
        legalNotice: settings.legalNotice,
        privacyPolicyUrl: settings.privacyPolicyUrl,
        privacyContactEmail: settings.privacyContactEmail,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/auth/password-policy
 * @desc Public: the password rules to show on the reset-password page. With a
 * valid reset `token`, the rules of that account's organization; otherwise the
 * header/subdomain-resolved organization's.
 */
router.get('/password-policy', async (req: TenantRequest, res, next) => {
  try {
    let tenantId = req.tenantId;
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (token) {
      try {
        const payload = jwt.verify(token, config.jwt.secret) as any;
        if (payload?.type === 'password_reset') {
          tenantId = (await AuthService.getUserTenantId(Number(payload.userId))) ?? tenantId;
        }
      } catch {
        // invalid/expired token: the reset itself will say so
      }
    }
    if (!tenantId) {
      throw BadRequestError('Tenant ID is required');
    }
    res.json({ success: true, data: publicPasswordPolicy(await TenantSettingsService.get(tenantId)) });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user
 */
router.post(
  '/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    passwordFloor('password'),
    body('displayName').notEmpty().trim(),
    body('username').optional().trim(),
  ],
  async (req: TenantRequest, res, next) => {
    try {
      validate(req);

      if (!req.tenantId) {
        throw BadRequestError('Tenant ID is required');
      }

      const settings = await TenantSettingsService.get(req.tenantId);
      if (!settings.allowSelfRegistration) {
        throw new ApiError('Self-registration is disabled for this organization', 403, 'REGISTRATION_CLOSED');
      }
      await AuthService.assertEmailDomainAllowed(req.tenantId, req.body.email);
      await AuthService.assertPasswordAllowed(req.tenantId, req.body.password);
      // Chosen org units must exist in this organization and fit together.
      const placement = await OrgStructureService.resolvePlacement(req.tenantId, req.body);

      const result = await AuthService.register({
        tenantId: req.tenantId,
        email: req.body.email,
        password: req.body.password,
        displayName: req.body.displayName,
        username: req.body.username,
        // A public sign-up is always a learner: the role used to come from the request
        // body, so anyone could apply as "admin" and be promoted on activation.
        role: 'agent',
        ...placement,
        requireApproval: settings.requireRegistrationApproval,
      });

      // No tokens either way: a pending account can't log in until an n+1
      // activates it (PUT /users/:id/status); an active one signs in normally.
      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          pending: result.pending,
          message: result.pending
            ? "Votre compte a été créé et est en attente d'activation par votre responsable."
            : 'Votre compte a été créé. Vous pouvez vous connecter.',
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

      // Password older than the organization allows: no session, the web app
      // sends the user to the reset page with this short-lived token.
      if ('passwordExpired' in result) {
        res.json({
          success: true,
          data: {
            passwordExpired: true,
            resetToken: result.resetToken,
            message: 'Votre mot de passe a expiré. Choisissez-en un nouveau pour continuer.',
          },
        });
        return;
      }

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
    passwordFloor('newPassword'),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const pendingNotification = await AuthService.changePassword(
        req.user!.id,
        req.body.currentPassword,
        req.body.newPassword
      );

      res.json({
        success: true,
        message: 'Password changed successfully',
        pendingNotification,
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
    passwordFloor('newPassword'),
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

/** Sets the refresh cookie and answers with the session, for every SSO/LDAP login. */
function sendSsoSession(
  res: any,
  result: { user: any; tokens: { accessToken: string; refreshToken: string; expiresIn: number }; isNewUser: boolean }
) {
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
      isNewUser: result.isNewUser,
    },
  });
}

/**
 * The organization a browser-initiated SSO login belongs to: the usual header /
 * subdomain resolution, or an explicit ?tenant=<id> (a plain redirect can't
 * carry the X-Tenant-ID header).
 */
function ssoTenantId(req: TenantRequest): number {
  const fromQuery = parseInt(String(req.query.tenant ?? ''), 10);
  const tenantId = Number.isInteger(fromQuery) && fromQuery > 0 ? fromQuery : req.tenantId;
  if (!tenantId) {
    throw BadRequestError('Tenant ID is required');
  }
  return tenantId;
}

/**
 * @route GET /api/v1/auth/sso/:provider (azure | google)
 * @desc Redirects to the organization's identity provider, with a signed `state`
 * naming that organization (checked by the callback).
 */
router.get('/sso/:provider(azure|google)', async (req: TenantRequest, res, next) => {
  try {
    const provider = req.params.provider as SsoProvider;
    res.redirect(await SsoConfigService.authorizationUrl(ssoTenantId(req), provider));
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/auth/sso/:provider/callback (azure | google)
 * @desc Exchanges the authorization code with the provider of the organization
 * named by `state` (the provider's own token + profile endpoints, server-side),
 * then logs in / provisions the account in that organization only.
 */
router.post('/sso/:provider(azure|google)/callback', async (req: TenantRequest, res, next) => {
  try {
    const provider = req.params.provider as SsoProvider;
    const { code, state } = req.body;

    if (!code) {
      throw BadRequestError('Authorization code is required');
    }
    // No state we signed = a login we didn't start (login CSRF): refused.
    const tenantId = SsoConfigService.verifyState(state, provider);
    const providers = await SsoConfigService.get(tenantId);

    const profile =
      provider === 'azure'
        ? await OAuthService.exchangeAzureCode(code, providers.azure)
        : await OAuthService.exchangeGoogleCode(code, providers.google);

    const result = await AuthService.handleSSOLogin(provider === 'azure' ? 'azure_ad' : 'google', profile.externalId, {
      email: profile.email,
      displayName: profile.displayName,
      tenantId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSsoSession(res, result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/auth/sso/providers
 * @desc Report which login methods this organization can actually use, so the
 * login page hides options with no configuration instead of failing after a click.
 */
router.get('/sso/providers', async (req: TenantRequest, res, next) => {
  try {
    const providers = req.tenantId ? await SsoConfigService.get(req.tenantId) : null;
    res.json({
      success: true,
      data: {
        azure: !!providers?.azure,
        google: !!providers?.google,
        ldap: !!providers?.ldap,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/auth/ldap/login
 * @desc Authenticate against the organization's LDAP/Active Directory server.
 * Auto-provisions a local account in that organization on first login, matching
 * the SSO provisioning flow.
 */
router.post(
  '/ldap/login',
  authLimiter,
  [body('username').notEmpty().trim(), body('password').notEmpty()],
  async (req: TenantRequest, res, next) => {
    try {
      validate(req);
      if (!req.tenantId) {
        throw BadRequestError('Tenant ID is required');
      }

      const { ldap } = await SsoConfigService.get(req.tenantId);
      const profile = await LdapService.authenticate(req.body.username, req.body.password, ldap);
      const result = await AuthService.handleLdapLogin({
        ...profile,
        tenantId: req.tenantId,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      sendSsoSession(res, result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
