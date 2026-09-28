import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optional HTTP Basic protection for internal deployments (set BASIC_AUTH_USER + BASIC_AUTH_PASSWORD).
 * For production prefer SSO in front of the app (e.g. Vercel / Cloudflare Access, Google IAP).
 */
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !pass) return NextResponse.next();
  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const [u, p] = atob(header.slice(6)).split(':');
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse('Authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Retail Opening Control Center"' } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
