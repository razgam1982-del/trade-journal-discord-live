import { NextRequest, NextResponse } from 'next/server';
import { EDIT_COOKIE } from '@/lib/edit-auth';

export const dynamic = 'force-dynamic';

// Owner unlock: visiting /unlock?key=<EDIT_SECRET> stores the edit cookie on
// this browser, enabling editing. Any wrong/empty key clears it (re-locks).
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') ?? '';
  const secret = process.env.EDIT_SECRET;
  const res = NextResponse.redirect(new URL('/', req.url));

  if (secret && key === secret) {
    res.cookies.set(EDIT_COOKIE, key, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  } else {
    res.cookies.delete(EDIT_COOKIE);
  }
  return res;
}
