import { NextRequest, NextResponse } from 'next/server';
import { VIEWER_COOKIE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url));
  res.cookies.delete(VIEWER_COOKIE);
  return res;
}
