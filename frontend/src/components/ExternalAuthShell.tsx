import { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, Award, BookOpen, Briefcase, Video } from 'lucide-react'
import { useBranding } from '@/lib/branding'
import { useExternalTheme } from '@/lib/externalTheme'

/**
 * Two-column frame shared by the external participants' sign-in and access
 * request pages (/external/login, /external/register). Deliberately looks unlike
 * the staff login: the partner theme chosen in Administration > Organisation >
 * Personnalisation (a dark surface and an accent, amber / navy by default), the
 * same one external participants see once signed in, so they always know they
 * are in their own area.
 */
export function ExternalAuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth')
  const { data: branding } = useBranding()
  const [logoFailed, setLogoFailed] = useState(false)
  const logoUrl = branding?.logoUrl && !logoFailed ? branding.logoUrl : null
  const orgName = branding?.name || 'E-Formation'
  useExternalTheme({ accent: branding?.externalAccentColor, surface: branding?.externalSurfaceColor })

  const perks = [
    { icon: BookOpen, label: t('external.perks.courses') },
    { icon: Award, label: t('external.perks.certificates') },
    { icon: Video, label: t('external.perks.live') },
  ]
  const steps = [t('external.steps.request'), t('external.steps.review'), t('external.steps.access')]

  const badge = (
    <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ext-surface-accent-text)] bg-[color:var(--ext-surface-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--ext-surface-accent-text)]">
      <Briefcase className="h-3.5 w-3.5" />
      {t('external.badge')}
    </span>
  )

  const logo = (size: 'lg' | 'sm') =>
    logoUrl ? (
      <div className={`rounded-2xl bg-white shadow-sm ring-1 ring-black/5 ${size === 'lg' ? 'px-5 py-3' : 'px-4 py-2'}`}>
        <img
          src={logoUrl}
          alt={orgName}
          className={`${size === 'lg' ? 'h-16 max-w-[13rem]' : 'h-12 max-w-[10rem]'} w-auto object-contain`}
          onError={() => setLogoFailed(true)}
        />
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <div className="h-11 w-11 rounded-xl bg-[color:var(--ext-accent)] flex items-center justify-center">
          <span className="text-xl font-bold text-[color:var(--ext-accent-foreground)]">E</span>
        </div>
        <span className={`text-2xl font-bold ${size === 'lg' ? 'text-[color:var(--ext-surface-foreground)]' : 'text-foreground'}`}>E-Formation</span>
      </div>
    )

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel: who this area is for, and how getting access works */}
      <div className="hidden lg:flex relative overflow-hidden flex-col justify-between gap-8 bg-[color:var(--ext-surface)] p-10 text-[color:var(--ext-surface-foreground)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-40 h-[32rem] w-[32rem] rounded-full bg-[color:var(--ext-accent)] opacity-20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-48 -left-32 h-[28rem] w-[28rem] rounded-full bg-[color:var(--ext-accent)] opacity-10 blur-3xl"
        />

        <div className="relative flex flex-col items-start gap-4">
          <Link to="/external/login">{logo('lg')}</Link>
          {badge}
        </div>

        <div className="relative max-w-lg">
          <div aria-hidden="true" className="mb-5 h-1.5 w-16 rounded-full bg-[color:var(--ext-accent)]" />
          <h1 className="text-3xl xl:text-4xl font-bold leading-tight mb-3">
            {branding?.name ? t('external.heroTitleOrg', { name: branding.name }) : t('external.heroTitle')}
          </h1>
          <p className="text-base xl:text-lg text-[color:var(--ext-surface-muted)] leading-relaxed">{t('external.heroDescription')}</p>

          <ul className="mt-6 space-y-2.5">
            {perks.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-[color:var(--ext-surface-foreground)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ext-surface-accent-soft)] text-[color:var(--ext-surface-accent-text)] ring-1 ring-[color:var(--ext-surface-border)]">
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--ext-surface-muted)]">{t('external.stepsTitle')}</p>
          <ol className="grid grid-cols-3 gap-3">
            {steps.map((label, index) => (
              <li key={label} className="rounded-xl border border-[color:var(--ext-surface-border)] bg-[color:var(--ext-surface-raised)] p-3">
                <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--ext-accent)] text-sm font-bold text-[color:var(--ext-accent-foreground)]">
                  {index + 1}
                </span>
                <span className="text-sm text-[color:var(--ext-surface-foreground)]">{label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-[color:var(--ext-surface-muted)]">{t('brand.copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </div>

      {/* Right panel: the form */}
      <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[color:var(--ext-accent-soft)] to-background dark:from-background p-4 py-10 sm:p-8">
        {/* Compact header when the left panel is hidden (mobile) */}
        <div className="lg:hidden mb-8 flex flex-col items-center gap-4">
          <Link to="/external/login">{logo('sm')}</Link>
          <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--ext-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--ext-surface-accent-text)]">
            <Briefcase className="h-3.5 w-3.5" />
            {t('external.badge')}
          </span>
        </div>

        <div className="w-full max-w-md">{children}</div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('external.staffPrompt')}{' '}
          <Link to="/login" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
            {t('external.staffLink')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </p>
        <p className="lg:hidden mt-6 text-center text-xs text-muted-foreground">
          {t('brand.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  )
}

// Partner-theme classes shared by the external pages (--ext-* variables set by useExternalTheme).
/** Call-to-action in the partner accent instead of the organization's primary color. */
export const EXTERNAL_BUTTON_CLASS =
  'w-full bg-[color:var(--ext-accent)] text-[color:var(--ext-accent-foreground)] hover:bg-[color:var(--ext-accent-hover)] focus-visible:ring-[color:var(--ext-accent)]'
/** Accent-colored text (links, section titles, icons), kept readable on the page. */
export const EXTERNAL_TEXT_CLASS = 'text-[color:var(--ext-accent-text)] dark:text-[color:var(--ext-surface-accent-text)]'
/** Light accent tint for highlighted boxes. */
export const EXTERNAL_TINT_CLASS =
  'border border-[color:var(--ext-accent-border)] bg-[color:var(--ext-accent-soft)] dark:border-[color:var(--ext-surface-border)] dark:bg-[color:var(--ext-surface-accent-soft)]'
/** Accent stripe on top of the form cards. */
export const EXTERNAL_CARD_CLASS = 'shadow-lg border-t-4 border-t-[color:var(--ext-accent)]'
