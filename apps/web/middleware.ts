import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(req: NextRequest) {
  // Use better-auth's official utility to get session cookie
  // This handles the __Secure- prefix automatically in production (HTTPS)
  const sessionCookie = getSessionCookie(req);

  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/settings/:path*"],
};
