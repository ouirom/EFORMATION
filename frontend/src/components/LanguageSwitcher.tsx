import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SUPPORTED_LANGUAGES, AppLanguage, LANGUAGE_CHOSEN_KEY } from '@/i18n'

const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  fr: 'Français',
  en: 'English',
}

// Global language switcher shown in the app header -- i18next-browser-languagedetector
// persists the language to localStorage on changeLanguage(); the extra marker records
// that it was the user's own choice, so the organization default no longer applies.
function chooseLanguage(i18n: { changeLanguage: (lng: string) => unknown }, value: string) {
  try {
    localStorage.setItem(LANGUAGE_CHOSEN_KEY, '1')
  } catch {
    // storage unavailable: the choice still applies for this session
  }
  i18n.changeLanguage(value)
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation('common')
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as AppLanguage)
    : 'fr'

  return (
    <Select value={current} onValueChange={(value) => chooseLanguage(i18n, value)}>
      <SelectTrigger className={className ?? 'w-[110px]'} aria-label={t('language')}>
        <Languages className="h-4 w-4 mr-1 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {LANGUAGE_LABELS[lang]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
