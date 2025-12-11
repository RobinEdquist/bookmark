import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Check for better-auth session cookie
  // Better-auth stores session in a cookie named "better-auth.session_token"
  const sessionToken = req.cookies.get("better-auth.session_token");
  const allCookies = req.cookies.getAll().map(c => c.name);

  const isAuthenticated = !!sessionToken?.value;

  console.log("[Middleware]", {
    pathname,
    isAuthenticated,
    hasSessionToken: !!sessionToken?.value,
    sessionTokenLength: sessionToken?.value?.length ?? 0,
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
