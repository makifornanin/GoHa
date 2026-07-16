import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (formerly "middleware" in Next.js <= 15). Optimistic route protection at
 * the edge: it only checks for the presence of the session cookie (fast, no
 * database). The authoritative check runs in the (app) layout via `requireUser`,
 * which also handles expired/invalid sessions.
 *
 * - Unauthenticated request to a protected page -> redirect to /login,
 *   remembering where the user was headed via `redirectTo`.
 * - Authenticated request to /login or /register -> redirect to /today.
 */
const AUTH_PATHS = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthPath = AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const hasSession = Boolean(getSessionCookie(request));

  if (!hasSession && !isAuthPath) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && isAuthPath) {
    return NextResponse.redirect(new URL("/today", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except the auth API, Next internals, and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
