import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Use better-auth's official utility to get session cookie
  // This handles the __Secure- prefix automatically in production (HTTPS)
  const sessionCookie = getSessionCookie(req);
  const allCookies = req.cookies.getAll().map(c => c.name);

  const isAuthenticated = !!sessionCookie;

  console.log("[Middleware]", {
    pathname,
    isAuthenticated,
    hasSessionCookie: !!sessionCookie,
    allCookieNames: allCookies,
    url: req.url,
  });

  if (!isAuthenticated) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    console.log("[Middleware] Redirecting unauthenticated user to /", {
      from: pathname,
      to: url.pathname,
    });
    return NextResponse.redirect(url);
  }

  console.log("[Middleware] Allowing authenticated request to proceed", { pathname });
  return NextResponse.next();
}

export const config = {
  matcher: ["/libraries/:path*", "/settings/:path*"],
};
