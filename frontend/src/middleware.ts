import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const userAgent = request.headers.get('user-agent') || '';
  const platformQuery = url.searchParams.get('platform');

  let platform = 'web';
  if (platformQuery === 'telegram' || userAgent.includes('Telegram')) {
    platform = 'telegram';
  } else if (platformQuery === 'whatsapp' || userAgent.includes('WhatsApp')) {
    platform = 'whatsapp';
  } else if (platformQuery === 'discord' || userAgent.includes('Discord')) {
    platform = 'discord';
  }

  const response = NextResponse.next();
  response.headers.set('x-veri-platform', platform);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
