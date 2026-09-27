import { TenantSettingsService } from '../services/tenant-settings.service';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    try {
      // en-CA formats as YYYY-MM-DD.
      formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      // An invalid zone stored in settings must not break the dashboard.
      formatter = formatterFor('UTC');
    }
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Calendar day ('YYYY-MM-DD') of `date` as seen in `timeZone`. */
export function dayKey(date: Date, timeZone: string): string {
  return formatterFor(timeZone).format(date);
}

/** The 'YYYY-MM-DD' key `days` calendar days after (or before, if negative) `key`. */
export function shiftDayKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The tenant's configured time zone (Organization settings), or the default. */
export async function getTenantTimezone(tenantId: number): Promise<string> {
  return (await TenantSettingsService.get(tenantId)).timezone;
}
