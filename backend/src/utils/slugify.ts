/** Lowercase, accent-free, dash-separated identifier ("Sécurité IT" -> "securite-it"). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
