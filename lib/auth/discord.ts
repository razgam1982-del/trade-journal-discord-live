// Discord OAuth + server-side role check.
//
// Flow:
//   1. /api/auth/discord redirects user to Discord's authorize URL
//   2. Discord redirects back to /api/auth/discord/callback?code=...
//   3. We exchange code → user access token → user's id + username
//   4. We use the BOT TOKEN to look up the user's roles in our guild
//   5. If they hold DISCORD_REQUIRED_ROLE_ID → grant a viewer session cookie
//
// Required env: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN,
// DISCORD_GUILD_ID, DISCORD_REQUIRED_ROLE_ID (or comma-separated list).

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
}

export function getAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = required('DISCORD_CLIENT_ID');
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${p.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const clientId = required('DISCORD_CLIENT_ID');
  const clientSecret = required('DISCORD_CLIENT_SECRET');
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const r = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Discord token exchange failed: ${r.status} ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.access_token as string;
}

export async function fetchUser(userToken: string): Promise<DiscordUser> {
  const r = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  if (!r.ok) throw new Error(`Failed to fetch Discord user: ${r.status}`);
  return r.json() as Promise<DiscordUser>;
}

// In-memory cache: userId → { allowed: boolean; expiresAt: ms }
// Lives for the lifetime of the server process (Vercel functions cold-start
// resets it, which is fine — worst case is one extra Discord API call).
const roleCache = new Map<string, { allowed: boolean; expiresAt: number }>();
const CACHE_MS = 5 * 60 * 1000; // 5 minutes

export async function hasRequiredRole(userId: string, opts?: { skipCache?: boolean }): Promise<boolean> {
  const now = Date.now();
  if (!opts?.skipCache) {
    const cached = roleCache.get(userId);
    if (cached && cached.expiresAt > now) return cached.allowed;
  }

  const botToken = required('DISCORD_BOT_TOKEN');
  const guildId = required('DISCORD_GUILD_ID');
  const required_roles = (process.env.DISCORD_REQUIRED_ROLE_ID ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (required_roles.length === 0) {
    // No role configured: lock everyone out by default (safer than open).
    return false;
  }

  const r = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  let allowed = false;
  if (r.ok) {
    const member = await r.json();
    const roles: string[] = member.roles ?? [];
    allowed = required_roles.some((rid) => roles.includes(rid));
  } // r.status === 404 → not a guild member at all → allowed stays false

  roleCache.set(userId, { allowed, expiresAt: now + CACHE_MS });
  return allowed;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}
