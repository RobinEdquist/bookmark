import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // Check for better-auth session cookie
  // Better-auth stores session in a cookie named "better-auth.session_token"
  const sessionToken = req.cookies.get("better-auth.session_token");

  const isAuthenticated = !!sessionToken?.value;

  if (!isAuthenticated) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/libraries/:path*"],
};
