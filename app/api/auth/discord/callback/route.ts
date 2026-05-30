// GET /api/auth/discord/callback?code=...&state=... — handles Discord's redirect
// after the user grants permission. We exchange the code, verify the role,
// issue a viewer session cookie, and redirect back to the originally-requested
// path. On any failure the user is sent to /login with an error code.
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, fetchUser, hasRequiredRole } from '@/lib/auth/discord';
import { VIEWER_COOKIE, COOKIE_MAX_AGE_SECONDS, signSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const stateCookie = req.cookies.get('oauth_state')?.value;
  const next = req.cookies.get('oauth_next')?.value ?? '/';

  if (!code || !stateParam || !stateCookie || stateParam !== stateCookie) {
    return NextResponse.redirect(new URL('/login?err=state', req.url));
  }

  try {
    const redirectUri = `${url.origin}/api/auth/discord/callback`;
    const token = await exchangeCode(code, redirectUri);
    const user = await fetchUser(token);
    const allowed = await hasRequiredRole(user.id, { skipCache: true });
    if (!allowed) {
      const res = NextResponse.redirect(new URL('/login?err=no_role', req.url));
      res.cookies.delete('oauth_next');
      res.cookies.delete('oauth_state');
      return res;
    }
    const cookieValue = signSession({
      uid: user.id,
      name: user.global_name ?? user.username,
      iat: Math.floor(Date.now() / 1000),
    });
    const res = NextResponse.redirect(new URL(next, req.url));
    res.cookies.set(VIEWER_COOKIE, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
    res.cookies.delete('oauth_next');
    res.cookies.delete('oauth_state');
    return res;
  } catch (e) {
    console.error('Discord OAuth callback failed:', e);
    return NextResponse.redirect(new URL('/login?err=auth', req.url));
  }
}
