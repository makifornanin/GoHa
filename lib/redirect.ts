/**
 * Post-login redirect safety (audit R-09).
 *
 * Both the login page and the auth form accepted any `?redirectTo=` that
 * started with `/`. That is not the same as "a path on this site":
 * `//attacker.example` starts with a slash and is a PROTOCOL-RELATIVE URL, so
 * the browser resolves it to `https://attacker.example`. The user signs in on
 * the real site, gets bounced to an attacker's copy, and every visible signal
 * (they typed the right domain, they saw the real login form, the credentials
 * worked) says nothing went wrong.
 *
 * Pure and dependency-free so the server component and the client form share
 * one rule instead of each carrying a copy that can drift.
 */

/** Where to land when no usable destination was supplied. */
export const DEFAULT_REDIRECT = "/today";

/**
 * A safe same-site path: one leading slash, and the next character must not be
 * another slash or a backslash.
 *
 * The backslash matters as much as the slash. Browsers normalise `\` to `/` in
 * the authority position, so `/\attacker.example` is protocol-relative in
 * exactly the same way while sailing past a naive `//` check.
 */
const SAFE_PATH = /^\/(?![/\\])/;

/**
 * Whitespace and C0 control characters, tested by code point.
 *
 * Written as a loop rather than a character class on purpose: expressing this
 * as a regex puts literal control bytes (including NUL) into the source file,
 * which is both unpleasant to edit and exactly what ESLint's no-control-regex
 * exists to stop.
 *
 * These characters are used to smuggle past checks like this one, because
 * parsers disagree about trimming: a leading tab can fail a naive prefix test
 * here and still resolve off-site in the browser. Nothing legitimate in a GoHa
 * path contains one.
 */
function hasUnsafeCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    // <= 0x20 covers every C0 control and the space itself; 0x7f is DEL.
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Narrow an untrusted redirect target to a same-site path.
 *
 * Returns `DEFAULT_REDIRECT` for anything that is not obviously local, which is
 * the right failure mode: landing a signed-in owner on Today is a small
 * annoyance, and following the value is a credential-phishing hop.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (hasUnsafeCharacters(value)) return fallback;
  if (!SAFE_PATH.test(value)) return fallback;
  return value;
}
