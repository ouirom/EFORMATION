import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../services/auth.service';
import { DatabaseService } from '../services/database.service';
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
import { effectiveExternalTheme } from '../utils/externalTheme';
import { SessionService } from '../services/session.service';
import { AuditService } from '../services/audit.service';
import { parseUserAgent } from '../utils/clientInfo';
import { TwoFactorService } from '../services/two-factor.service';
import bcrypt from 'bcryptjs';

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

// The 2FA endpoints carry no email to key on: per IP, looser than authLimiter
// (each challenge already allows only 5 codes and 5 emails).
const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, error: { message: 'Too many attempts, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

/** The refresh token also travels in an HTTP-only cookie (same lifetime as the token's maximum). */
function setRefreshCookie(res: any, refreshToken: string) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

/** IP and browser of the request, recorded on the session it opens or uses. */
function clientContext(req: any) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

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
 * @route GET /api/v1/auth/branding
 * @desc Public: the organization's name, logo and colors (Administration >
 * Organisation > Personnalisation), so the login page carries its identity
 * before anyone is signed in. Nothing here is confidential.
 */
router.get('/branding', async (req: TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      throw BadRequestError('Tenant ID is required');
    }
    const rows = await DatabaseService.query<any>(
      `SELECT t.name, s.logo_url, s.primary_color, s.secondary_color,
              s.external_accent_color, s.external_surface_color
       FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id = t.id
       WHERE t.id = @tenantId`,
      { tenantId: req.tenantId }
    );
    const row = rows[0];
    res.json({
      success: true,
      data: {
        name: row?.name ?? null,
        logoUrl: row?.logo_url ?? null,
        primaryColor: row?.primary_color ?? null,
        secondaryColor: row?.secondary_color ?? null,
        // Partner theme of the external portal (/external/login), defaults when unset.
        ...effectiveExternalTheme(row),
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
 * @route POST /api/v1/auth/register/external
 * @desc Sign-up from the external participants' portal: always role 'externe',
 * never attached to the org structure, and always reviewed by an admin before
 * the first login, whatever the organization's approval setting -- these are
 * people from outside the company.
 */
router.post(
  '/register/external',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    passwordFloor('password'),
    body('displayName').trim().notEmpty().isLength({ max: 200 }),
    body('company').trim().notEmpty().isLength({ max: 200 }),
    body('jobTitle').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
    body('phone').optional({ checkFalsy: true }).trim().matches(/^[+0-9 ().-]{6,30}$/),
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
      // No allowed-domain check: external participants by definition use
      // their own company's address, not the organization's.
      await AuthService.assertPasswordAllowed(req.tenantId, req.body.password);

      const result = await AuthService.register({
        tenantId: req.tenantId,
        email: req.body.email,
        password: req.body.password,
        displayName: req.body.displayName,
        role: 'externe',
        externalCompany: req.body.company,
        jobTitle: req.body.jobTitle || null,
        phone: req.body.phone || null,
        requireApproval: true,
      });

      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          pending: true,
          message: "Votre demande d'accès a été envoyée. Un administrateur doit la valider avant votre première connexion.",
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
    body('portal').optional().isIn(['external']),
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
        portal: req.body.portal,
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

      // Two-step sign-in: no tokens until the emailed code is entered.
      if ('twoFactorRequired' in result) {
        res.json({ success: true, data: result });
        return;
      }

      // Set refresh token in HTTP-only cookie
      setRefreshCookie(res, result.tokens.refreshToken);

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
 * @route POST /api/v1/auth/2fa/verify
 * @desc Second step of a password/LDAP sign-in: the 6-digit code emailed by the
 * first step. Answers like POST /login (session + tokens).
 */
router.post(
  '/2fa/verify',
  twoFactorLimiter,
  [body('challengeToken').isString().notEmpty(), body('code').isString().notEmpty()],
  async (req: TenantRequest, res, next) => {
    try {
      validate(req);
      const result = await AuthService.verifyTwoFactorLogin(req.body.challengeToken, req.body.code, clientContext(req));

      setRefreshCookie(res, result.tokens.refreshToken);
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
 * @route POST /api/v1/auth/2fa/resend
 * @desc "Renvoyer le code" (sign-in or activation): at most every 60 s, 5 emails per challenge.
 */
router.post(
  '/2fa/resend',
  twoFactorLimiter,
  [body('challengeToken').isString().notEmpty()],
  async (req, res, next) => {
    try {
      validate(req);
      res.json({ success: true, data: await TwoFactorService.resend(req.body.challengeToken) });
    } catch (error) {
      next(error);
    }
  }
);

/** The signed-in user's two-step sign-in state, as Profil > Sécurité shows it. */
async function twoFactorStatus(req: AuthRequest) {
  const { twoFactorMode } = await TenantSettingsService.get(req.user!.tenantId);
  const [row] = await DatabaseService.query<{ two_factor_enabled: boolean; password_hash: string }>(
    'SELECT two_factor_enabled, password_hash FROM users WHERE id = @id',
    { id: req.user!.id }
  );
  return {
    mode: twoFactorMode,
    enabled: twoFactorMode === 'required' || (twoFactorMode === 'optional' && !!row?.two_factor_enabled),
    enforced: twoFactorMode === 'required',
    canToggle: twoFactorMode === 'optional',
    // SSO/LDAP-provisioned accounts have no local password to confirm a change with.
    hasPassword: !!row?.password_hash && !['SSO_USER', 'LDAP_USER'].includes(row.password_hash),
  };
}

/**
 * @route GET /api/v1/auth/2fa
 * @desc Two-step sign-in state of my account and of my organization's policy.
 */
router.get('/2fa', authenticate, async (req: AuthRequest, res, next) => {
  try {
    res.json({ success: true, data: await twoFactorStatus(req) });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/auth/2fa/enable/start
 * @desc Turning two-step sign-in on ('optional' mode) first proves the user
 * receives the codes: one is emailed, to confirm with /2fa/enable/confirm.
 */
router.post('/2fa/enable/start', authenticate, twoFactorLimiter, async (req: AuthRequest, res, next) => {
  try {
    const status = await twoFactorStatus(req);
    if (!status.canToggle) {
      throw BadRequestError('Two-step sign-in is not a personal choice in this organization', 'TWO_FACTOR_NOT_OPTIONAL');
    }
    const challenge = await TwoFactorService.start({
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
      email: req.user!.email,
      displayName: req.user!.displayName,
      purpose: 'enable',
      ...clientContext(req),
    });
    res.json({ success: true, data: challenge });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/auth/2fa/enable/confirm
 * @desc The code received: two-step sign-in is now on for my account.
 */
router.post(
  '/2fa/enable/confirm',
  authenticate,
  twoFactorLimiter,
  [body('challengeToken').isString().notEmpty(), body('code').isString().notEmpty()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const challenge = await TwoFactorService.verify(req.body.challengeToken, req.body.code, 'enable', clientContext(req));
      if (challenge.user_id !== req.user!.id) {
        throw BadRequestError("Ce code n'est plus valide.", 'TWO_FACTOR_INVALID_CHALLENGE');
      }
      await DatabaseService.execute('UPDATE users SET two_factor_enabled = @enabled WHERE id = @id', {
        enabled: true,
        id: req.user!.id,
      });
      await AuditService.log(req.user!.tenantId, req.user!.id, '2FA_ENABLED', 'users', req.user!.id);
      res.json({ success: true, data: await twoFactorStatus(req) });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/auth/2fa/disable
 * @desc Turn two-step sign-in off ('optional' mode only), confirmed with the current password.
 */
router.post(
  '/2fa/disable',
  authenticate,
  twoFactorLimiter,
  [body('password').isString().notEmpty()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const status = await twoFactorStatus(req);
      if (!status.canToggle) {
        throw BadRequestError('Two-step sign-in is not a personal choice in this organization', 'TWO_FACTOR_NOT_OPTIONAL');
      }
      const [row] = await DatabaseService.query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id = @id',
        { id: req.user!.id }
      );
      if (!row || !(await bcrypt.compare(req.body.password, row.password_hash).catch(() => false))) {
        throw BadRequestError('Mot de passe incorrect.', 'INVALID_PASSWORD');
      }
      await DatabaseService.execute('UPDATE users SET two_factor_enabled = @enabled WHERE id = @id', {
        enabled: false,
        id: req.user!.id,
      });
      await AuditService.log(req.user!.tenantId, req.user!.id, '2FA_DISABLED', 'users', req.user!.id);
      res.json({ success: true, data: await twoFactorStatus(req) });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Exchange a refresh token for a new pair (the refresh token is rotated:
 * the one presented stops working). The body wins over the cookie: the web app
 * always sends the token it holds, and a stale cookie must not be replayed.
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;

    if (!refreshToken) {
      throw BadRequestError('Refresh token is required');
    }

    const tokens = await AuthService.refreshToken(refreshToken, clientContext(req));

    // No new refresh token: another tab rotated it a moment ago (grace window).
    if (tokens.refreshToken) {
      setRefreshCookie(res, tokens.refreshToken);
    }

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/auth/logout
 * @desc End the current session. Works with the access token (header) or the
 * refresh token (body/cookie), so it still signs out once the access token expired.
 */
router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    await AuthService.logout({
      accessToken: authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null,
      refreshToken: req.body?.refreshToken || req.cookies?.refreshToken || null,
    });

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
 * @route GET /api/v1/auth/sessions
 * @desc The signed-in user's open sessions (Profil > Sécurité), the current one flagged.
 */
router.get('/sessions', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const sessions = await SessionService.listActive(req.user!.id);
    // The rule follows the account's own organization (a super_admin may be
    // acting in another one).
    const homeTenantId =
      req.user!.role === 'super_admin' ? (await AuthService.getUserTenantId(req.user!.id)) ?? req.user!.tenantId : req.user!.tenantId;
    const { singleSessionPerUser } = await TenantSettingsService.get(homeTenantId);
    res.json({
      success: true,
      // One active session per user: a new login signs the other devices out.
      meta: { singleSessionPerUser },
      data: sessions.map((s) => ({
        id: Number(s.id),
        current: !!req.sessionId && s.sid === req.sessionId,
        ...parseUserAgent(s.user_agent),
        ip: s.ip,
        authMethod: s.auth_method,
        createdAt: s.created_at,
        lastUsedAt: s.last_used_at,
        expiresAt: s.expires_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/v1/auth/sessions/:id
 * @desc Sign one of my devices out ("Déconnecter"). Only the user's own sessions.
 */
router.delete('/sessions/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (!Number.isInteger(sessionId)) {
      throw BadRequestError('Invalid session id');
    }
    const sid = await SessionService.revokeOwn(req.user!.id, sessionId, 'user_revoked');
    if (!sid) {
      throw new ApiError('Session not found', 404, 'NOT_FOUND');
    }
    await AuditService.log(req.user!.tenantId, req.user!.id, 'SESSION_REVOKED', 'users', req.user!.id, {
      sessionId,
      current: sid === req.sessionId,
    });
    res.json({ success: true, data: { current: sid === req.sessionId } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/auth/sessions/revoke-others
 * @desc "Déconnecter tous les autres appareils": every session but this one.
 */
router.post('/sessions/revoke-others', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!req.sessionId) {
      // A token from before sessions existed: no "this device" to keep.
      throw BadRequestError('Please sign in again to manage your sessions', 'SESSION_REQUIRED');
    }
    const revoked = await SessionService.revokeAllForUser(req.user!.id, 'others_revoked', req.sessionId);
    await AuditService.log(req.user!.tenantId, req.user!.id, 'SESSIONS_REVOKED_OTHERS', 'users', req.user!.id, { revoked });
    res.json({ success: true, data: { revoked } });
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
    // Profile details the auth middleware doesn't load on every request.
    const [profile] = await DatabaseService.query<{ external_company: string | null; job_title: string | null }>(
      'SELECT external_company, job_title FROM users WHERE id = @id',
      { id: req.user!.id }
    );
    res.json({
      success: true,
      data: {
        ...req.user,
        externalCompany: profile?.external_company ?? null,
        jobTitle: profile?.job_title && profile.job_title !== 'Défaut' ? profile.job_title : null,
      },
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
        parseInt(req.body.tenantId, 10),
        req.sessionId,
        clientContext(req)
      );

      setRefreshCookie(res, result.tokens.refreshToken);

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
        req.body.newPassword,
        req.sessionId
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

/**
 * @route POST /api/v1/auth/not-me
 * @desc « Ce n'était pas moi » (new sign-in alert email): closes every session of
 * the account and returns a short-lived reset token -- the web app goes straight
 * to choosing a new password. The link is single-use.
 */
router.post('/not-me', authLimiter, [body('token').isString().notEmpty()], async (req, res, next) => {
  try {
    validate(req);
    const { resetToken } = await AuthService.reportNotMe(req.body.token, clientContext(req));
    res.json({ success: true, data: { resetToken } });
  } catch (error) {
    next(error);
  }
});

/** Sets the refresh cookie and answers with the session, for every SSO/LDAP login. */
function sendSsoSession(
  res: any,
  result: { user: any; tokens: { accessToken: string; refreshToken: string; expiresIn: number }; isNewUser: boolean }
) {
  setRefreshCookie(res, result.tokens.refreshToken);

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

      // Two-step sign-in applies to directory accounts too: the code comes next.
      if ('twoFactorRequired' in result) {
        res.json({ success: true, data: result });
        return;
      }

      sendSsoSession(res, result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
