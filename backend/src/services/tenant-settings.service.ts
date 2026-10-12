import { NextFunction, Response } from 'express';
import { DatabaseService } from './database.service';
import { ApiError } from '../middleware/error.middleware';
import type { AuthRequest } from '../middleware/auth.middleware';

/**
 * Platform settings of a tenant (Administration > Organisation), with the same
 * defaults the organization page shows when no tenant_settings row exists yet.
 * This is the single place the rest of the backend reads them from, so a
 * toggle in the admin page actually changes behaviour.
 */
export interface TenantPlatformSettings {
  allowSelfRegistration: boolean;
  defaultLanguage: string;
  timezone: string;
  enableNotifications: boolean;
  enableChat: boolean;
  enableLiveSessions: boolean;
  maxUsersPerGroup: number;
  /** Default certificate validity, in days. */
  certificateValidity: number;

  // Access & security
  passwordMinLength: number;
  /** Upper and lower case letter, digit and special character. */
  passwordRequireComplexity: boolean;
  /** 0 = passwords never expire. */
  passwordExpiryDays: number;
  /** 0 = no lockout. */
  maxLoginAttempts: number;
  lockoutMinutes: number;
  /** Automatic logout after this many minutes without activity (enforced by the web app). */
  sessionIdleMinutes: number;
  /** A login stays valid at most this many days, token refreshes included. */
  sessionMaxDays: number;
  /** Lowercase domains ("belife.ci"); empty = any. Self-registration and SSO/LDAP auto-provisioning. */
  allowedEmailDomains: string[];
  /** Self-registered accounts wait for an n+1 to activate them. */
  requireRegistrationApproval: boolean;
  /** Code sent by email at sign-in (password and LDAP logins; SSO relies on the identity provider). */
  twoFactorMode: TwoFactorMode;
  /** Email the user when their account signs in from a device not seen in 90 days. */
  newDeviceAlerts: boolean;
  /** A new login revokes the user's other sessions: at most one device signed in at a time. */
  singleSessionPerUser: boolean;

  // Learning & gamification
  /** Pass mark (%) given to new quizzes. */
  quizDefaultPassingScore: number;
  /** Attempts allowed on new quizzes; 0 = unlimited. */
  quizDefaultMaxAttempts: number;
  /** Certificate renewal reminder, days before expiry; 0 = off. */
  certificateReminderDays: number;
  /** First reminder before a mandatory course's due date, in days; 0 = off. */
  assignmentReminderDays: number;
  /** Last reminder before the due date, in days; 0 = off. */
  assignmentUrgentDays: number;
  /** Manager alerted this many days after the due date; 0 = off. */
  escalationDaysOverdue: number;
  enableBadges: boolean;
  /** XP, levels and the leaderboard. */
  enableXp: boolean;
  leaderboardScope: LeaderboardScope;
  xpPerCourse: number;
  xpPerQuiz: number;
  xpPerLesson: number;
  xpPerLevel: number;

  // Compliance
  /** Activity log kept this many days (older rows purged daily); 0 = forever. */
  auditLogRetentionDays: number;
  /** Deleting an account also erases its personal data. */
  anonymizeDeletedUsers: boolean;
  privacyPolicyUrl: string;
  privacyContactEmail: string;
  /** "Mentions légales", shown on the public /legal page. */
  legalNotice: string;
}

export const LEADERBOARD_SCOPES = ['organization', 'direction', 'service', 'hidden'] as const;

/** off: never; optional: each user turns it on in Profil > Sécurité; required: everyone. */
export const TWO_FACTOR_MODES = ['off', 'optional', 'required'] as const;
export type TwoFactorMode = (typeof TWO_FACTOR_MODES)[number];
export type LeaderboardScope = (typeof LEADERBOARD_SCOPES)[number];

export const DEFAULT_PLATFORM_SETTINGS: TenantPlatformSettings = {
  allowSelfRegistration: true,
  defaultLanguage: 'fr',
  timezone: 'Europe/Paris',
  enableNotifications: true,
  enableChat: true,
  enableLiveSessions: true,
  maxUsersPerGroup: 50,
  certificateValidity: 365,
  passwordMinLength: 8,
  passwordRequireComplexity: true,
  passwordExpiryDays: 0,
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
  sessionIdleMinutes: 5,
  sessionMaxDays: 30,
  allowedEmailDomains: [],
  requireRegistrationApproval: true,
  twoFactorMode: 'off',
  newDeviceAlerts: true,
  singleSessionPerUser: true,
  quizDefaultPassingScore: 70,
  quizDefaultMaxAttempts: 3,
  certificateReminderDays: 30,
  assignmentReminderDays: 7,
  assignmentUrgentDays: 1,
  escalationDaysOverdue: 1,
  enableBadges: true,
  enableXp: true,
  leaderboardScope: 'organization',
  xpPerCourse: 100,
  xpPerQuiz: 50,
  xpPerLesson: 10,
  xpPerLevel: 250,
  auditLogRetentionDays: 0,
  anonymizeDeletedUsers: false,
  privacyPolicyUrl: '',
  privacyContactEmail: '',
  legalNotice: '',
};

type SettingKey = keyof TenantPlatformSettings;

/**
 * How each setting is stored in tenant_settings and which values are valid.
 * Drives reading (get), validating and writing (PUT /organizations/current/settings),
 * so adding a setting means one line here plus its column in a migration.
 * Out-of-range stored values fall back to the default.
 */
export type SettingSpec =
  | { key: SettingKey; column: string; kind: 'bool' }
  | { key: SettingKey; column: string; kind: 'int'; min: number; max: number }
  | { key: SettingKey; column: string; kind: 'enum'; values: readonly string[] }
  | { key: SettingKey; column: string; kind: 'language' | 'timezone' | 'domains' | 'url' | 'email' }
  | { key: SettingKey; column: string; kind: 'text'; max: number };

export const SETTING_SPECS: SettingSpec[] = [
  { key: 'allowSelfRegistration', column: 'allow_self_registration', kind: 'bool' },
  { key: 'defaultLanguage', column: 'default_language', kind: 'language' },
  { key: 'timezone', column: 'timezone', kind: 'timezone' },
  { key: 'enableNotifications', column: 'enable_notifications', kind: 'bool' },
  { key: 'enableChat', column: 'enable_chat', kind: 'bool' },
  { key: 'enableLiveSessions', column: 'enable_live_sessions', kind: 'bool' },
  { key: 'maxUsersPerGroup', column: 'max_users_per_group', kind: 'int', min: 1, max: 100_000 },
  { key: 'certificateValidity', column: 'certificate_validity', kind: 'int', min: 1, max: 36_500 },
  { key: 'passwordMinLength', column: 'password_min_length', kind: 'int', min: 8, max: 64 },
  { key: 'passwordRequireComplexity', column: 'password_require_complexity', kind: 'bool' },
  { key: 'passwordExpiryDays', column: 'password_expiry_days', kind: 'int', min: 0, max: 3650 },
  { key: 'maxLoginAttempts', column: 'max_login_attempts', kind: 'int', min: 0, max: 100 },
  { key: 'lockoutMinutes', column: 'lockout_minutes', kind: 'int', min: 1, max: 1440 },
  { key: 'sessionIdleMinutes', column: 'session_idle_minutes', kind: 'int', min: 2, max: 480 },
  { key: 'sessionMaxDays', column: 'session_max_days', kind: 'int', min: 1, max: 365 },
  { key: 'allowedEmailDomains', column: 'allowed_email_domains', kind: 'domains' },
  { key: 'requireRegistrationApproval', column: 'require_registration_approval', kind: 'bool' },
  { key: 'twoFactorMode', column: 'two_factor_mode', kind: 'enum', values: TWO_FACTOR_MODES },
  { key: 'newDeviceAlerts', column: 'new_device_alerts', kind: 'bool' },
  { key: 'singleSessionPerUser', column: 'single_session_per_user', kind: 'bool' },
  { key: 'quizDefaultPassingScore', column: 'quiz_default_passing_score', kind: 'int', min: 0, max: 100 },
  { key: 'quizDefaultMaxAttempts', column: 'quiz_default_max_attempts', kind: 'int', min: 0, max: 100 },
  { key: 'certificateReminderDays', column: 'certificate_reminder_days', kind: 'int', min: 0, max: 365 },
  { key: 'assignmentReminderDays', column: 'assignment_reminder_days', kind: 'int', min: 0, max: 90 },
  { key: 'assignmentUrgentDays', column: 'assignment_urgent_days', kind: 'int', min: 0, max: 30 },
  { key: 'escalationDaysOverdue', column: 'escalation_days_overdue', kind: 'int', min: 0, max: 90 },
  { key: 'enableBadges', column: 'enable_badges', kind: 'bool' },
  { key: 'enableXp', column: 'enable_xp', kind: 'bool' },
  { key: 'leaderboardScope', column: 'leaderboard_scope', kind: 'enum', values: LEADERBOARD_SCOPES },
  { key: 'xpPerCourse', column: 'xp_per_course', kind: 'int', min: 0, max: 10_000 },
  { key: 'xpPerQuiz', column: 'xp_per_quiz', kind: 'int', min: 0, max: 10_000 },
  { key: 'xpPerLesson', column: 'xp_per_lesson', kind: 'int', min: 0, max: 10_000 },
  { key: 'xpPerLevel', column: 'xp_per_level', kind: 'int', min: 1, max: 100_000 },
  { key: 'auditLogRetentionDays', column: 'audit_log_retention_days', kind: 'int', min: 0, max: 3650 },
  { key: 'anonymizeDeletedUsers', column: 'anonymize_deleted_users', kind: 'bool' },
  { key: 'privacyPolicyUrl', column: 'privacy_policy_url', kind: 'url' },
  { key: 'privacyContactEmail', column: 'privacy_contact_email', kind: 'email' },
  { key: 'legalNotice', column: 'legal_notice', kind: 'text', max: 20_000 },
];

export const SUPPORTED_LANGUAGES = ['fr', 'en'];

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Lowest password length an organization can set (the pre-existing rule). */
export const MIN_PASSWORD_LENGTH = 8;

/** "Belife.ci, @other.com ;x.org" -> ['belife.ci', 'other.com', 'x.org'] */
export function parseEmailDomains(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\s]+/) : [];
  const domains = list
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  return [...new Set(domains)];
}

/** Whether `email` belongs to one of the allowed domains (always true when the list is empty). */
export function isEmailDomainAllowed(email: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = email.split('@').pop()?.trim().toLowerCase() || '';
  return allowedDomains.includes(domain);
}

// Any character other than a letter or a digit (the old list rejected "-", "_", "€"...).
const SPECIAL_CHARACTER = /[^A-Za-z0-9]/;

/**
 * The first rule of the organization's password policy that `password` breaks,
 * as an English message, or null when it complies. Enforced on every place a
 * local password is set: registration, reset, change, admin creation.
 */
export function passwordPolicyViolation(
  password: string,
  settings: Pick<TenantPlatformSettings, 'passwordMinLength' | 'passwordRequireComplexity'>
): string | null {
  const minLength = Math.max(MIN_PASSWORD_LENGTH, settings.passwordMinLength);
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters`;
  }
  if (
    settings.passwordRequireComplexity &&
    !(/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && SPECIAL_CHARACTER.test(password))
  ) {
    return 'Password must contain an uppercase letter, a lowercase letter, a digit, and a special character';
  }
  return null;
}

/** Level (1-based) and progress within it, for an XP total under the organization's scale. */
export function levelFromXp(xp: number, xpPerLevel: number) {
  const perLevel = Math.max(1, xpPerLevel);
  const safeXp = Math.max(0, Math.trunc(xp || 0));
  return {
    level: Math.floor(safeXp / perLevel) + 1,
    xpIntoLevel: safeXp % perLevel,
    xpPerLevel: perLevel,
  };
}

export type TenantFeature = 'chat' | 'liveSessions' | 'badges';

const FEATURE_FLAG: Record<TenantFeature, keyof TenantPlatformSettings> = {
  chat: 'enableChat',
  liveSessions: 'enableLiveSessions',
  badges: 'enableBadges',
};

// Settings are read on many requests (every chat/live call); a short cache keeps
// that to one query per tenant per few seconds. Writes invalidate it immediately.
const CACHE_TTL_MS = 10_000;
const cache = new Map<number, { value: TenantPlatformSettings; expires: number }>();

/** One stored value -> the setting value, the default when missing or out of range. */
function readSetting(spec: SettingSpec, raw: unknown): unknown {
  const fallback = DEFAULT_PLATFORM_SETTINGS[spec.key];
  if (spec.kind === 'domains') return parseEmailDomains(raw);
  if (spec.kind === 'text' || spec.kind === 'url' || spec.kind === 'email') return raw === null || raw === undefined ? fallback : String(raw);
  if (raw === null || raw === undefined || raw === '') return fallback;
  switch (spec.kind) {
    case 'bool':
      return Boolean(raw);
    case 'int': {
      const n = Math.trunc(Number(raw));
      return Number.isFinite(n) && n >= spec.min && n <= spec.max ? n : fallback;
    }
    case 'enum':
      return spec.values.includes(String(raw)) ? String(raw) : fallback;
    case 'language':
      return SUPPORTED_LANGUAGES.includes(String(raw)) ? String(raw) : fallback;
    case 'timezone':
      return isValidTimeZone(String(raw)) ? String(raw) : fallback;
  }
}

/** Setting value -> what goes in the column (domains as "a.com,b.org", null when empty). */
export function settingToColumn(spec: SettingSpec, value: unknown): unknown {
  if (spec.kind === 'domains') return parseEmailDomains(value).join(',') || null;
  if (spec.kind === 'text' || spec.kind === 'url' || spec.kind === 'email') return String(value ?? '').trim() || null;
  return value;
}

export class TenantSettingsService {
  static async get(tenantId: number): Promise<TenantPlatformSettings> {
    const cached = cache.get(tenantId);
    if (cached && cached.expires > Date.now()) return cached.value;

    const rows = await DatabaseService.query<any>(
      `SELECT ${SETTING_SPECS.map((s) => s.column).join(', ')} FROM tenant_settings WHERE tenant_id = @tenantId`,
      { tenantId }
    );
    const row = rows[0];
    const value = { ...DEFAULT_PLATFORM_SETTINGS, allowedEmailDomains: [] } as Record<string, unknown>;
    if (row) {
      for (const spec of SETTING_SPECS) {
        value[spec.key] = readSetting(spec, row[spec.column]);
      }
    }

    const settings = value as unknown as TenantPlatformSettings;
    cache.set(tenantId, { value: settings, expires: Date.now() + CACHE_TTL_MS });
    return settings;
  }

  static invalidate(tenantId: number): void {
    cache.delete(tenantId);
  }

  /** Test helper: forget every cached tenant. */
  static clearCache(): void {
    cache.clear();
  }

  static async isFeatureEnabled(tenantId: number, feature: TenantFeature): Promise<boolean> {
    return Boolean((await this.get(tenantId))[FEATURE_FLAG[feature]]);
  }
}

/**
 * Route guard: 403 FEATURE_DISABLED when the tenant turned the module off in
 * Administration > Organisation. Mount after `authenticate`.
 */
export function requireFeature(feature: TenantFeature) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!(await TenantSettingsService.isFeatureEnabled(req.user!.tenantId, feature))) {
        throw new ApiError(`The ${feature} module is disabled for this organization`, 403, 'FEATURE_DISABLED');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
