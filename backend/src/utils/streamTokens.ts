import crypto from 'crypto';

/**
 * Opaque, single-file-scoped tokens for GET /files/:id/stream's `?token=` query param.
 * Deliberately NOT a JWT: a JWT's payload is only signed, not encrypted, so anyone who
 * sees the token in a server/proxy access log or browser history can base64-decode it
 * and read fileId/tenantId straight out of it, even though they can't forge or reuse
 * it elsewhere. A random opaque string looked up server-side reveals nothing on its own.
 */

interface StreamTokenEntry {
  fileId: number;
  tenantId: number;
  expiresAt: number;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;
const tokens = new Map<string, StreamTokenEntry>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (entry.expiresAt <= now) {
      tokens.delete(token);
    }
  }
}

export function issueStreamToken(fileId: number, tenantId: number): string {
  sweepExpired();
  const token = crypto.randomBytes(32).toString('base64url');
  tokens.set(token, { fileId, tenantId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/** Not single-use: a <video>/<iframe> element re-requests the same URL repeatedly
 * (Range requests while seeking/buffering), so the token must stay valid for every
 * request up to its TTL, not just the first. */
export function resolveStreamToken(token: string): { fileId: number; tenantId: number } | null {
  const entry = tokens.get(token);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return { fileId: entry.fileId, tenantId: entry.tenantId };
}
