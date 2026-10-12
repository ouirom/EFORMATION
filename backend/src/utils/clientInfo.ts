/**
 * What a login's User-Agent and IP say about the device: shown in Profil >
 * Sécurité, in the "new sign-in" email, and compared by the new-device rule.
 * Deliberately coarse (browser family, OS family) -- version numbers change on
 * every browser update and must not make a known device look new.
 */
export interface ClientInfo {
  browser: string;
  os: string;
  device: 'desktop' | 'mobile' | 'tablet';
}

export function parseUserAgent(userAgent?: string | null): ClientInfo {
  const ua = userAgent || '';

  // Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
  let browser = 'Inconnu';
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';
  else if (/curl\//i.test(ua)) browser = 'curl';

  let os = 'Inconnu';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let device: ClientInfo['device'] = 'desktop';
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'tablet';
  else if (/Mobile|iPhone|iPod/.test(ua)) device = 'mobile';

  return { browser, os, device };
}

/** "::ffff:10.0.0.5" -> "10.0.0.5" (Node reports IPv4 clients of a dual-stack socket that way). */
export function normalizeIp(ip?: string | null): string | null {
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * The network an IP belongs to, for "same place" comparisons: the /24 of an
 * IPv4 address (a home or office box often gets a new last octet), the /64
 * of an IPv6 one (the prefix a single site is given).
 */
export function ipNetwork(ip?: string | null): string | null {
  const value = normalizeIp(ip);
  if (!value) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return value.split('.').slice(0, 3).join('.') + '.0/24';
  if (value.includes(':')) {
    // Expand "::" just enough to take the first four groups.
    const [head, tail = ''] = value.split('::');
    const headGroups = head ? head.split(':') : [];
    const tailGroups = tail ? tail.split(':') : [];
    const groups = value.includes('::')
      ? [...headGroups, ...Array(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill('0'), ...tailGroups]
      : headGroups;
    return groups.slice(0, 4).map((g) => (g || '0').toLowerCase()).join(':') + '::/64';
  }
  return value;
}
