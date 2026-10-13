import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
export function proxy(request: NextRequest) {
  return getSessionCookie(request)
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/sign-in", request.url));
}
export const config = { matcher: ["/m/:path*"] };
