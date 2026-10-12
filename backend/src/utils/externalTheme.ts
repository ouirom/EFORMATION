/**
 * Partner theme for external participants (role 'externe'): an accent color and
 * a surface color (sidebar, auth panel), chosen in Administration > Organisation
 * > Personnalisation. Stored as #RRGGBB in tenant_settings, NULL = default.
 */
export const DEFAULT_EXTERNAL_ACCENT_COLOR = '#D97706';
export const DEFAULT_EXTERNAL_SURFACE_COLOR = '#0F172A';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

/** The colors to apply: the stored ones, or the defaults when unset (or somehow invalid). */
export function effectiveExternalTheme(row: { external_accent_color?: string | null; external_surface_color?: string | null } | undefined) {
  return {
    externalAccentColor: isHexColor(row?.external_accent_color) ? row!.external_accent_color!.toUpperCase() : DEFAULT_EXTERNAL_ACCENT_COLOR,
    externalSurfaceColor: isHexColor(row?.external_surface_color) ? row!.external_surface_color!.toUpperCase() : DEFAULT_EXTERNAL_SURFACE_COLOR,
  };
}

/** Request value -> column value: '' / null reset to the default (NULL). Assumes it was validated. */
export function externalColorParam(value: unknown): string | null {
  return isHexColor(value) ? value.toUpperCase() : null;
}
