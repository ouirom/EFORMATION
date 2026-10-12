/**
 * The organization settings shown in each tab of Administration > Organisation,
 * rendered by SettingsTab. Bounds mirror the server's SETTING_SPECS
 * (backend/src/services/tenant-settings.service.ts), which re-validates them.
 * Labels/hints are keys of the `admin` namespace.
 */
export type FieldType = 'bool' | 'int' | 'select' | 'timezone' | 'domains' | 'url' | 'email' | 'textarea'

export interface FieldSpec {
  key: string
  type: FieldType
  labelKey: string
  hintKey?: string
  min?: number
  max?: number
  /** For 'select': value + label key. */
  options?: { value: string; labelKey?: string; label?: string }[]
  /** Greyed out while another setting makes it irrelevant. */
  disabledWhen?: (values: Record<string, any>) => boolean
  /** Numbers where 0 means off/unlimited/forever: label key used for the default display. */
  zeroLabelKey?: string
}

export interface FieldGroup {
  titleKey?: string
  fields: FieldSpec[]
}

const D = 'organization.settingsDialog'

export const PLATFORM_GROUPS: FieldGroup[] = [
  {
    titleKey: 'organization.tabs.groups.modules',
    fields: [
      { key: 'allowSelfRegistration', type: 'bool', labelKey: `${D}.selfRegistration`, hintKey: `${D}.hints.allowSelfRegistration` },
      { key: 'enableNotifications', type: 'bool', labelKey: `${D}.notifications`, hintKey: `${D}.hints.enableNotifications` },
      { key: 'enableChat', type: 'bool', labelKey: `${D}.chat`, hintKey: `${D}.hints.enableChat` },
      { key: 'enableLiveSessions', type: 'bool', labelKey: `${D}.liveSessions`, hintKey: `${D}.hints.enableLiveSessions` },
      { key: 'maxUsersPerGroup', type: 'int', min: 1, max: 100000, labelKey: `${D}.maxUsersPerGroup`, hintKey: `${D}.hints.maxUsersPerGroup` },
      { key: 'certificateValidity', type: 'int', min: 1, max: 36500, labelKey: `${D}.certificateValidity`, hintKey: `${D}.hints.certificateValidity` },
    ],
  },
  {
    titleKey: 'organization.tabs.groups.localization',
    fields: [
      {
        key: 'defaultLanguage',
        type: 'select',
        labelKey: `${D}.defaultLanguage`,
        options: [
          { value: 'fr', label: 'Français' },
          { value: 'en', label: 'English' },
        ],
      },
      { key: 'timezone', type: 'timezone', labelKey: `${D}.timezone`, hintKey: `${D}.hints.languageTimezone` },
    ],
  },
]

const S = `${D}.security`
export const SECURITY_GROUPS: FieldGroup[] = [
  {
    titleKey: 'organization.tabs.groups.passwords',
    fields: [
      { key: 'passwordMinLength', type: 'int', min: 8, max: 64, labelKey: `${S}.passwordMinLength`, hintKey: `${S}.hints.passwordMinLength` },
      { key: 'passwordRequireComplexity', type: 'bool', labelKey: `${S}.passwordRequireComplexity`, hintKey: `${S}.hints.passwordRequireComplexity` },
      { key: 'passwordExpiryDays', type: 'int', min: 0, max: 3650, labelKey: `${S}.passwordExpiryDays`, hintKey: `${S}.hints.passwordExpiryDays`, zeroLabelKey: 'organization.security.never' },
    ],
  },
  {
    titleKey: 'organization.tabs.groups.sessions',
    fields: [
      { key: 'maxLoginAttempts', type: 'int', min: 0, max: 100, labelKey: `${S}.maxLoginAttempts`, hintKey: `${S}.hints.maxLoginAttempts`, zeroLabelKey: 'organization.security.none' },
      { key: 'lockoutMinutes', type: 'int', min: 1, max: 1440, labelKey: `${S}.lockoutMinutes`, hintKey: `${S}.hints.lockoutMinutes`, disabledWhen: (v) => Number(v.maxLoginAttempts) === 0 },
      { key: 'sessionIdleMinutes', type: 'int', min: 2, max: 480, labelKey: `${S}.sessionIdleMinutes`, hintKey: `${S}.hints.sessionIdleMinutes` },
      { key: 'sessionMaxDays', type: 'int', min: 1, max: 365, labelKey: `${S}.sessionMaxDays`, hintKey: `${S}.hints.sessionMaxDays` },
      { key: 'singleSessionPerUser', type: 'bool', labelKey: `${S}.singleSessionPerUser`, hintKey: `${S}.hints.singleSessionPerUser` },
    ],
  },
  {
    titleKey: 'organization.tabs.groups.signInProtection',
    fields: [
      {
        key: 'twoFactorMode',
        type: 'select',
        labelKey: `${S}.twoFactorMode`,
        hintKey: `${S}.hints.twoFactorMode`,
        options: ['off', 'optional', 'required'].map((value) => ({ value, labelKey: `organization.security.twoFactorMode.${value}` })),
      },
      { key: 'newDeviceAlerts', type: 'bool', labelKey: `${S}.newDeviceAlerts`, hintKey: `${S}.hints.newDeviceAlerts` },
    ],
  },
  {
    titleKey: 'organization.tabs.groups.registration',
    fields: [
      { key: 'requireRegistrationApproval', type: 'bool', labelKey: `${S}.requireRegistrationApproval`, hintKey: `${S}.hints.requireRegistrationApproval` },
      { key: 'allowedEmailDomains', type: 'domains', labelKey: `${S}.allowedEmailDomains`, hintKey: `${S}.hints.allowedEmailDomains` },
    ],
  },
]

const L = `${D}.learning`
export const LEARNING_GROUPS: FieldGroup[] = [
  {
    titleKey: 'organization.tabs.groups.quizzes',
    fields: [
      { key: 'quizDefaultPassingScore', type: 'int', min: 0, max: 100, labelKey: `${L}.quizDefaultPassingScore`, hintKey: `${L}.hints.quizDefaultPassingScore` },
      { key: 'quizDefaultMaxAttempts', type: 'int', min: 0, max: 100, labelKey: `${L}.quizDefaultMaxAttempts`, hintKey: `${L}.hints.quizDefaultMaxAttempts`, zeroLabelKey: 'organization.learning.unlimited' },
    ],
  },
  {
    titleKey: 'organization.tabs.groups.reminders',
    fields: [
      { key: 'assignmentReminderDays', type: 'int', min: 0, max: 90, labelKey: `${L}.assignmentReminderDays`, hintKey: `${L}.hints.assignmentReminderDays`, zeroLabelKey: 'organization.learning.off' },
      { key: 'assignmentUrgentDays', type: 'int', min: 0, max: 30, labelKey: `${L}.assignmentUrgentDays`, hintKey: `${L}.hints.assignmentUrgentDays`, zeroLabelKey: 'organization.learning.off' },
      { key: 'escalationDaysOverdue', type: 'int', min: 0, max: 90, labelKey: `${L}.escalationDaysOverdue`, hintKey: `${L}.hints.escalationDaysOverdue`, zeroLabelKey: 'organization.learning.off' },
      { key: 'certificateReminderDays', type: 'int', min: 0, max: 365, labelKey: `${L}.certificateReminderDays`, hintKey: `${L}.hints.certificateReminderDays`, zeroLabelKey: 'organization.learning.off' },
    ],
  },
  {
    titleKey: 'organization.tabs.groups.gamification',
    fields: [
      { key: 'enableBadges', type: 'bool', labelKey: `${L}.enableBadges`, hintKey: `${L}.hints.enableBadges` },
      { key: 'enableXp', type: 'bool', labelKey: `${L}.enableXp`, hintKey: `${L}.hints.enableXp` },
      {
        key: 'leaderboardScope',
        type: 'select',
        labelKey: `${L}.leaderboardScope`,
        hintKey: `${L}.hints.leaderboardScope`,
        options: ['organization', 'direction', 'service', 'hidden'].map((value) => ({ value, labelKey: `organization.learning.leaderboardScope.${value}` })),
        disabledWhen: (v) => !v.enableXp,
      },
      { key: 'xpPerCourse', type: 'int', min: 0, max: 10000, labelKey: `${L}.xpPerCourse`, disabledWhen: (v) => !v.enableXp },
      { key: 'xpPerQuiz', type: 'int', min: 0, max: 10000, labelKey: `${L}.xpPerQuiz`, disabledWhen: (v) => !v.enableXp },
      { key: 'xpPerLesson', type: 'int', min: 0, max: 10000, labelKey: `${L}.xpPerLesson`, disabledWhen: (v) => !v.enableXp },
      { key: 'xpPerLevel', type: 'int', min: 1, max: 100000, labelKey: `${L}.xpPerLevel`, disabledWhen: (v) => !v.enableXp },
    ],
  },
]

const C = `${D}.compliance`
export const COMPLIANCE_GROUPS: FieldGroup[] = [
  {
    titleKey: 'organization.tabs.groups.personalData',
    fields: [
      { key: 'auditLogRetentionDays', type: 'int', min: 0, max: 3650, labelKey: `${C}.auditLogRetentionDays`, hintKey: `${C}.hints.auditLogRetentionDays`, zeroLabelKey: 'organization.tabs.forever' },
      { key: 'anonymizeDeletedUsers', type: 'bool', labelKey: `${C}.anonymizeDeletedUsers`, hintKey: `${C}.hints.anonymizeDeletedUsers` },
    ],
  },
  {
    titleKey: 'organization.tabs.groups.legal',
    fields: [
      { key: 'privacyPolicyUrl', type: 'url', labelKey: `${C}.privacyPolicyUrl`, hintKey: `${C}.hints.privacyPolicyUrl` },
      { key: 'privacyContactEmail', type: 'email', labelKey: `${C}.privacyContactEmail`, hintKey: `${C}.hints.privacyContactEmail` },
      { key: 'legalNotice', type: 'textarea', max: 20000, labelKey: `${C}.legalNotice`, hintKey: `${C}.hints.legalNotice` },
    ],
  },
]
