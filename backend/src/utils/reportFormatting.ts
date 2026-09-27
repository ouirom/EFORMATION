/**
 * Presentation layer for report exports (PDF / Excel / CSV) and the on-screen
 * preview: localized titles and column labels, value translations and number
 * clean-up. The SQL in report.routes.ts only produces raw rows; everything a
 * human reads goes through here, in the language the requester picked.
 */

export type ReportLanguage = 'fr' | 'en';
export type ColumnKind = 'text' | 'number' | 'percent' | 'date' | 'datetime';

export interface ReportColumn {
  key: string;
  label: string;
  kind: ColumnKind;
}

type Bilingual = { fr: string; en: string };

// Same wording as the report cards (frontend admin.json > reports.types.*.label).
const TITLES: Record<string, Bilingual> = {
  user_progress: { fr: 'Progression des utilisateurs', en: 'User progress' },
  course_completion: { fr: 'Complétion des cours', en: 'Course completion' },
  quiz_performance: { fr: 'Performance aux quiz', en: 'Quiz performance' },
  enrollment_summary: { fr: 'Résumé des inscriptions', en: 'Enrollment summary' },
  badge_awards: { fr: 'Badges décernés', en: 'Badge awards' },
  certificate_issuance: { fr: 'Certifications', en: 'Certifications' },
  activity_log: { fr: "Journal d'activité", en: 'Activity log' },
  organization_overview: { fr: "Vue d'ensemble de l'organisation", en: 'Organization overview' },
};

const COLUMNS: Record<string, Bilingual & { kind?: ColumnKind }> = {
  id: { fr: 'ID', en: 'ID', kind: 'number' },
  display_name: { fr: 'Nom', en: 'Name' },
  email: { fr: 'E-mail', en: 'Email' },
  role: { fr: 'Rôle', en: 'Role' },
  enterprise: { fr: 'Entreprise', en: 'Company' },
  direction: { fr: 'Direction', en: 'Department' },
  service: { fr: 'Service', en: 'Team' },
  enrolled_courses: { fr: 'Cours suivis', en: 'Enrolled courses', kind: 'number' },
  completed_courses: { fr: 'Cours terminés', en: 'Completed courses', kind: 'number' },
  avg_progress: { fr: 'Progression moyenne', en: 'Average progress', kind: 'percent' },
  title: { fr: 'Titre', en: 'Title' },
  category: { fr: 'Catégorie', en: 'Category' },
  total_enrollments: { fr: 'Inscriptions', en: 'Enrollments', kind: 'number' },
  completions: { fr: 'Terminés', en: 'Completions', kind: 'number' },
  avg_days_to_complete: { fr: 'Durée moyenne (jours)', en: 'Avg. days to complete', kind: 'number' },
  course_title: { fr: 'Cours', en: 'Course' },
  total_attempts: { fr: 'Tentatives', en: 'Attempts', kind: 'number' },
  avg_score: { fr: 'Score moyen', en: 'Average score', kind: 'percent' },
  min_score: { fr: 'Score min.', en: 'Min. score', kind: 'percent' },
  max_score: { fr: 'Score max.', en: 'Max. score', kind: 'percent' },
  pass_rate: { fr: 'Taux de réussite', en: 'Pass rate', kind: 'percent' },
  date: { fr: 'Date', en: 'Date', kind: 'date' },
  enrollments: { fr: 'Inscriptions', en: 'Enrollments', kind: 'number' },
  unique_users: { fr: 'Utilisateurs', en: 'Users', kind: 'number' },
  users: { fr: 'Utilisateurs', en: 'Users', kind: 'number' },
  courses: { fr: 'Cours', en: 'Courses', kind: 'number' },
  badge_name: { fr: 'Badge', en: 'Badge' },
  badge_type: { fr: 'Type', en: 'Type' },
  times_awarded: { fr: 'Attributions', en: 'Times awarded', kind: 'number' },
  unique_recipients: { fr: 'Bénéficiaires', en: 'Recipients', kind: 'number' },
  serial: { fr: 'N° de certificat', en: 'Certificate no.' },
  user_name: { fr: 'Utilisateur', en: 'User' },
  issued_at: { fr: 'Délivré le', en: 'Issued on', kind: 'datetime' },
  action: { fr: 'Action', en: 'Action' },
  entity: { fr: 'Élément', en: 'Entity' },
  entity_id: { fr: 'ID élément', en: 'Entity ID', kind: 'number' },
  created_at: { fr: 'Date', en: 'Date', kind: 'datetime' },
};

// Coded values shown to humans (role and badge type columns).
const VALUES: Record<string, Record<string, Bilingual>> = {
  role: {
    super_admin: { fr: 'Super administrateur', en: 'Super admin' },
    admin: { fr: 'Administrateur', en: 'Administrator' },
    director: { fr: 'Directeur', en: 'Director' },
    manager: { fr: 'Manager', en: 'Manager' },
    supervisor: { fr: 'Superviseur', en: 'Supervisor' },
    agent: { fr: 'Agent', en: 'Agent' },
    externe: { fr: 'Externe', en: 'External' },
    stagiaire: { fr: 'Stagiaire', en: 'Intern' },
  },
  badge_type: {
    trophy: { fr: 'Trophée', en: 'Trophy' },
    quiz_completion: { fr: 'Quiz réussi', en: 'Quiz passed' },
    perfect_score: { fr: 'Score parfait', en: 'Perfect score' },
    first_quiz: { fr: 'Premier quiz', en: 'First quiz' },
    course_start: { fr: 'Début de cours', en: 'Course started' },
    course_completion: { fr: 'Cours terminé', en: 'Course completed' },
  },
};

const TEXTS = {
  generatedOn: { fr: 'Généré le', en: 'Generated on' },
  period: { fr: 'Période', en: 'Period' },
  noData: { fr: 'Aucune donnée pour ce rapport.', en: 'No data available for this report.' },
  rows: { fr: 'lignes', en: 'rows' },
  truncated: { fr: 'lignes supplémentaires non affichées — exportez en Excel ou CSV pour tout voir.', en: 'more rows not shown — export to Excel or CSV to see everything.' },
  from: { fr: 'du', en: 'from' },
  to: { fr: 'au', en: 'to' },
  since: { fr: 'depuis le', en: 'since' },
  allTime: { fr: 'toute la période', en: 'all time' },
};

export function text(key: keyof typeof TEXTS, language: ReportLanguage): string {
  return TEXTS[key][language];
}

export function reportTitle(reportType: string, language: ReportLanguage): string {
  return TITLES[reportType]?.[language] ?? reportType;
}

function humanize(key: string): string {
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Columns of a result set, in row order, with a localized label and a display kind. */
export function reportColumns(rows: any[], language: ReportLanguage): ReportColumn[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).map((key) => ({
    key,
    label: COLUMNS[key]?.[language] ?? humanize(key),
    kind: COLUMNS[key]?.kind ?? 'text',
  }));
}

/**
 * Cleans raw rows for display: numeric strings (Postgres NUMERIC/AVG come back as
 * "33.3333333333") become numbers rounded to one decimal, and coded values (role,
 * badge type) are translated. Dates are left as Date/ISO values for each exporter
 * to format natively.
 */
export function presentRows(rows: any[], language: ReportLanguage): any[] {
  return rows.map((row) => {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      const kind = COLUMNS[key]?.kind;
      if ((kind === 'number' || kind === 'percent') && typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
        out[key] = Math.round(Number(value) * 10) / 10;
      } else if (typeof value === 'number' && !Number.isInteger(value)) {
        out[key] = Math.round(value * 10) / 10;
      } else if (typeof value === 'string' && VALUES[key]?.[value]) {
        out[key] = VALUES[key][value][language];
      } else {
        out[key] = value;
      }
    }
    return out;
  });
}

const LOCALES: Record<ReportLanguage, string> = { fr: 'fr-FR', en: 'en-GB' };

/**
 * Cell text for PDF / CSV (Excel keeps native dates and numbers). Timestamps are
 * shown in `timeZone` (the tenant's); date-only values stay as stored.
 */
export function formatCell(value: any, kind: ColumnKind, language: ReportLanguage, timeZone = 'UTC'): string {
  if (value === null || value === undefined || value === '') return '';
  const locale = LOCALES[language];
  if (kind === 'date' || kind === 'datetime') {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return kind === 'date'
      ? date.toLocaleDateString(locale, { timeZone: 'UTC' })
      : date.toLocaleString(locale, { timeZone, dateStyle: 'short', timeStyle: 'short' });
  }
  if (typeof value === 'number') {
    const formatted = value.toLocaleString(locale, { maximumFractionDigits: 1 });
    if (kind !== 'percent') return formatted;
    // French typography puts a space before %, English doesn't.
    return language === 'fr' ? `${formatted} %` : `${formatted}%`;
  }
  return String(value);
}

/** Human-readable period line for the report header. */
export function periodLabel(language: ReportLanguage, startDate?: string, endDate?: string): string {
  const fmt = (d: string) => formatCell(d, 'date', language);
  if (startDate && endDate) return `${text('from', language)} ${fmt(startDate)} ${text('to', language)} ${fmt(endDate)}`;
  if (startDate) return `${text('since', language)} ${fmt(startDate)}`;
  return text('allTime', language);
}
