/**
 * The organization's password rules (Administration > Organisation > Accès &
 * sécurité), as the forms pre-check them. The server enforces the same rules
 * (tenant-settings.service.ts passwordPolicyViolation) whatever the form says.
 */
export interface PasswordPolicy {
  minLength: number
  /** Upper and lower case letter, digit and special character. */
  requireComplexity: boolean
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = { minLength: 8, requireComplexity: true }

export type PasswordRuleKey = 'minLength' | 'uppercase' | 'lowercase' | 'digit' | 'special'

export interface PasswordRule {
  key: PasswordRuleKey
  met: boolean
}

/** The rules that apply under `policy`, and whether `password` meets each one. */
export function passwordRules(password: string, policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): PasswordRule[] {
  const rules: PasswordRule[] = [{ key: 'minLength', met: password.length >= policy.minLength }]
  if (policy.requireComplexity) {
    rules.push(
      { key: 'uppercase', met: /[A-Z]/.test(password) },
      { key: 'lowercase', met: /[a-z]/.test(password) },
      { key: 'digit', met: /\d/.test(password) },
      // Anything but a letter or a digit, like the server.
      { key: 'special', met: /[^A-Za-z0-9]/.test(password) },
    )
  }
  return rules
}

export function isPasswordCompliant(password: string, policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): boolean {
  return passwordRules(password, policy).every((rule) => rule.met)
}

/** Policy from the organization settings returned by /organizations/current. */
export function policyFromSettings(
  settings?: { passwordMinLength?: number; passwordRequireComplexity?: boolean } | null
): PasswordPolicy {
  return {
    minLength: Math.max(DEFAULT_PASSWORD_POLICY.minLength, settings?.passwordMinLength ?? DEFAULT_PASSWORD_POLICY.minLength),
    requireComplexity: settings?.passwordRequireComplexity ?? DEFAULT_PASSWORD_POLICY.requireComplexity,
  }
}
