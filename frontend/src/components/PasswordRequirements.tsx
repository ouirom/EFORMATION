import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { PasswordPolicy, passwordRules } from '@/lib/passwordPolicy'

/** Live checklist of the organization's password rules under a password field. */
export function PasswordRequirements({ password, policy }: { password: string; policy: PasswordPolicy }) {
  const { t } = useTranslation('auth')

  return (
    <div className="grid grid-cols-2 gap-1 mt-2">
      {passwordRules(password, policy).map((rule) => (
        <div key={rule.key} className="flex items-center gap-1 text-xs">
          {rule.met ? <Check className="h-3 w-3 text-green-500" /> : <X className="h-3 w-3 text-red-500" />}
          <span className={rule.met ? 'text-green-600' : 'text-muted-foreground'}>
            {t(`register.passwordRequirements.${rule.key}`, { count: policy.minLength })}
          </span>
        </div>
      ))}
    </div>
  )
}
