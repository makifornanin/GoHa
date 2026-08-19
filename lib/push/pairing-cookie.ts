import "server-only";

import { PAIRING_TTL_MS } from "@/lib/push/pairing";

/**
 * Short-lived handoff between the public QR landing page and the authenticated
 * setup page. The raw pairing secret exists only in the QR fragment and the
 * staging POST body. This HttpOnly cookie and PostgreSQL carry only SHA-256.
 * The root path is required because iOS completes setup from the installed
 * app's Settings route, not necessarily from the original landing route.
 */
export const PUSH_PAIRING_COOKIE = "goha_push_pairing";

export function pushPairingCookieOptions(expires?: Date) {
  const ttlSeconds = Math.floor(PAIRING_TTL_MS / 1000);
  const remainingSeconds = expires
    ? Math.max(0, Math.min(ttlSeconds, Math.ceil((expires.getTime() - Date.now()) / 1000)))
    : ttlSeconds;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    priority: "high" as const,
    maxAge: remainingSeconds,
    ...(expires ? { expires } : {}),
  };
}
