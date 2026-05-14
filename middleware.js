import { NextResponse } from 'next/server';

export function middleware(request) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  if (!user || !pass) {
    return new NextResponse('Auth not configured', { status: 500 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const [scheme, encoded = ''] = authHeader.split(' ');

  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    const colon = decoded.indexOf(':');
    if (colon !== -1) {
      const reqUser = decoded.slice(0, colon);
      const reqPass = decoded.slice(colon + 1);
      if (reqUser === user && reqPass === pass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="MDA", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
