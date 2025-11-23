import { NextRequest, NextResponse } from "next/server";
import { authClient } from "./lib/auth-client";

export async function middleware(req: NextRequest) {
  const session = authClient.getSession();
  const sessionData = (await session).data;

  const isAuthenticated = !!sessionData?.user;

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
