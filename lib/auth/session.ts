// Viewer session: signed HMAC cookie. Holds the Discord user id + display name
// for UX, plus an issuedAt timestamp. Verified on every request.
//
// Rotation strategy: SESSION_SECRET in env. Change it → every existing session
// stops verifying → all viewers are forced to re-auth.
import crypto from 'crypto';

export interface ViewerSession {
  uid: string;          // Discord user id
  name: string;         // Discord display name (for the UI)
  iat: number;          // issued-at, unix seconds
}

export const VIEWER_COOKIE = 'viewer_session';
export const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not configured');
  return s;
}

export function signSession(payload: ViewerSession): string {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(raw: string | undefined | null): ViewerSession | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  // Constant-time compare to avoid timing leaks.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed: ViewerSession = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed.uid || !parsed.iat) return null;
    const ageSeconds = Math.floor(Date.now() / 1000) - parsed.iat;
    if (ageSeconds > COOKIE_MAX_AGE_SECONDS) return null;
    return parsed;
  } catch {
    return null;
  }
}
