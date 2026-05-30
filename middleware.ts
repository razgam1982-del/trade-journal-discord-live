// Edge-runtime middleware: enforces "you must have a cookie before you see
// anything". Doesn't verify the cookie's signature or hit Discord — those run
// at the page/route layer (Node runtime) via lib/auth/viewer.isAllowedViewer().
//
// What this guard does:
//   - Public paths (/login, /api/auth/*, /unlock, /disclaimer, etc.) → always allowed
//   - Static assets, favicons, Next internals → always allowed (matcher excludes them)
//   - Otherwise: if there's neither EDIT_COOKIE nor VIEWER_COOKIE set → redirect to /login
//
// Anyone who forges a cookie still gets caught at the page layer when
// verifySession() fails or hasRequiredRole() returns false.
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/unlock', '/disclaimer', '/api/auth'];

const EDIT_COOKIE = 'edit_key';
const VIEWER_COOKIE = 'viewer_session';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  // Allow webhooks (Discord bot, ingest from external sources).
  if (pathname.startsWith('/api/discord-webhook') || pathname.startsWith('/api/ingest')) {
    return NextResponse.next();
  }
  const hasEdit = !!req.cookies.get(EDIT_COOKIE)?.value;
  const hasViewer = !!req.cookies.get(VIEWER_COOKIE)?.value;
  if (hasEdit || hasViewer) return NextResponse.next();

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

// Run middleware on everything EXCEPT static assets and Next.js internals.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
