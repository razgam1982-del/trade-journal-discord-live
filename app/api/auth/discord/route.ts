// GET /api/auth/discord?next=/path — redirects the user to Discord's authorize URL.
// We stash `next` (the path to return to) in a signed cookie, NOT in the OAuth
// `state` query param, so a malicious URL can't trick the user into landing on
// an off-site page after auth.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthorizeUrl } from '@/lib/auth/discord';

export const dynamic = 'force-dynamic';

const NEXT_COOKIE = 'oauth_next';
const STATE_COOKIE = 'oauth_state';

export async function GET(req: NextRequest) {
  const next = sanitizeNext(req.nextUrl.searchParams.get('next'));
  const state = crypto.randomBytes(16).toString('base64url');

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/discord/callback`;

  const res = NextResponse.redirect(getAuthorizeUrl(redirectUri, state));
  res.cookies.set(NEXT_COOKIE, next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes
  });
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}

function sanitizeNext(next: string | null): string {
  if (!next) return '/';
  // Only allow same-origin relative paths.
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
