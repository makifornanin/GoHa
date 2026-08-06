import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (formerly "middleware" in Next.js <= 15). Optimistic route protection at
 * the edge: it only checks for the PRESENCE of the session cookie (fast, no
 * database). The authoritative check runs server-side via `requireUser` (for the
 * app) and `getCurrentUser` (on the auth pages), which is what actually knows
 * whether a session is still valid.
 *
 * - Unauthenticated request to a protected page -> redirect to /login,
 *   remembering where the user was headed via `redirectTo`.
 *
 * It deliberately does NOT bounce cookie-carrying requests away from /login.
 * A cookie can outlive its session (expired, revoked, or the account deleted),
 * and redirecting on presence alone caused an infinite loop: proxy sent
 * /login -> /today, the real session check sent /today -> /login, forever
 * (ERR_TOO_MANY_REDIRECTS), leaving no way to sign in again. The /login page
 * does the real lookup and redirects an genuinely-authenticated user itself.
 */
const AUTH_PATHS = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthPath = AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (isAuthPath) return NextResponse.next();

  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except the auth API, Next internals, and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
