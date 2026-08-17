import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Automation token format and comparison.
 *
 * Kept apart from anything that touches the database so the rules here can be
 * unit-tested directly: what a token looks like, what is stored, and how a
 * presented token is checked against what is stored.
 *
 * What is stored is the SHA-256 hash and a short prefix. The secret itself is
 * shown once, at creation, and never again: a database dump, a screenshot of
 * Settings, or a leaked backup must not be enough to call the API.
 */

/** Marks the string as ours in a log or a credential store, at a glance. */
export const TOKEN_PREFIX_LABEL = "goha";
/** Characters of the secret kept in the clear, for display and lookup. */
export const TOKEN_PREFIX_LENGTH = 12;
/** Bytes of entropy behind the secret (256 bits). */
const TOKEN_BYTES = 32;

export type NewToken = {
  /** Shown to the owner once. Never stored. */
  secret: string;
  /** SHA-256 hex of the secret. This is what the database keeps. */
  hash: string;
  /** Leading characters, safe to display and to index on. */
  prefix: string;
};

/** URL-safe base64 with no padding, so a token survives being pasted anywhere. */
function base64url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function hashToken(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function tokenPrefix(secret: string): string {
  return secret.slice(0, TOKEN_PREFIX_LENGTH);
}

/** Mint a token. The secret is returned exactly once, by the caller's design. */
export function createToken(): NewToken {
  const secret = `${TOKEN_PREFIX_LABEL}_${base64url(randomBytes(TOKEN_BYTES))}`;
  return { secret, hash: hashToken(secret), prefix: tokenPrefix(secret) };
}

/**
 * Read a bearer token out of an Authorization header.
 *
 * Header only, never a query string: query strings end up in server logs,
 * proxy logs, and browser history, and a token that has been logged is a token
 * that has to be revoked.
 */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * Constant-time comparison of two hex hashes.
 *
 * `===` on a hash leaks how many leading characters matched through timing.
 * That is a thin channel, but it is a channel, and the fix costs nothing.
 */
export function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Whether a token row is usable right now: not revoked, not expired. */
export function isTokenUsable(
  token: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (token.revokedAt) return false;
  if (token.expiresAt && token.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
