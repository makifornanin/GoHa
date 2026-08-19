import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Ten minutes: long enough to scan and sign in, short enough to limit replay. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;
export const PAIRING_SECRET_LABEL = "goha_pair";
export const PAIRING_SECRET_PREFIX_LENGTH = 16;
const PAIRING_SECRET_BYTES = 32;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export type NewPairingSecret = {
  /** Returned once for the QR/setup fragment. Never persisted. */
  secret: string;
  /** The only verifier persisted by GoHa. */
  secretHash: string;
  /** Harmless identifier for diagnostics; it cannot reconstruct the secret. */
  secretPrefix: string;
  issuedAt: Date;
  expiresAt: Date;
};

export function hashPairingSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function pairingSecretPrefix(secret: string): string {
  return secret.slice(0, PAIRING_SECRET_PREFIX_LENGTH);
}

/** Mint a 256-bit, URL-fragment-safe, one-time setup secret. */
export function createPairingSecret(now: Date = new Date()): NewPairingSecret {
  const secret = `${PAIRING_SECRET_LABEL}_${randomBytes(PAIRING_SECRET_BYTES).toString("base64url")}`;
  return {
    secret,
    secretHash: hashPairingSecret(secret),
    secretPrefix: pairingSecretPrefix(secret),
    issuedAt: new Date(now),
    expiresAt: new Date(now.getTime() + PAIRING_TTL_MS),
  };
}

/** Constant-time comparison after enforcing the stored SHA-256 representation. */
export function pairingHashesMatch(leftHash: string, rightHash: string): boolean {
  if (!SHA256_HEX.test(leftHash) || !SHA256_HEX.test(rightHash)) return false;
  return timingSafeEqual(Buffer.from(leftHash, "hex"), Buffer.from(rightHash, "hex"));
}

export type PairingDecision =
  | "usable"
  | "wrong_user"
  | "secret_mismatch"
  | "not_yet_valid"
  | "expired"
  | "consumed";

export type PairingSessionForVerification = {
  userId: string;
  secretHash: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

/**
 * Verify the short-lived hash produced by the public fragment exchange.
 *
 * The browser no longer needs the raw QR secret after staging. The HttpOnly
 * handoff cookie carries this hash, which is still only setup intent: a normal
 * authenticated session for the owning user is required before consumption.
 */
export function pairingHashDecision(
  session: PairingSessionForVerification,
  authenticatedUserId: string,
  presentedHash: string,
  now: Date = new Date(),
): PairingDecision {
  if (!pairingHashesMatch(session.secretHash, presentedHash)) return "secret_mismatch";
  if (session.userId !== authenticatedUserId) return "wrong_user";
  if (session.consumedAt) return "consumed";
  if (session.issuedAt.getTime() > now.getTime()) return "not_yet_valid";
  if (session.expiresAt.getTime() <= now.getTime()) return "expired";
  return "usable";
}

/**
 * Pure explanation of the same conditions used by the atomic repository write.
 *
 * A pairing secret is setup intent, never identity. The caller must supply an
 * independently authenticated user id, and that id must own the session. Public
 * routes should collapse non-usable reasons into a uniform response rather than
 * reveal which account (if any) minted a secret.
 */
export function pairingDecision(
  session: PairingSessionForVerification,
  authenticatedUserId: string,
  presentedSecret: string,
  now: Date = new Date(),
): PairingDecision {
  return pairingHashDecision(
    session,
    authenticatedUserId,
    hashPairingSecret(presentedSecret),
    now,
  );
}

export function isPairingUsableForUser(
  session: PairingSessionForVerification,
  authenticatedUserId: string,
  presentedSecret: string,
  now: Date = new Date(),
): boolean {
  return pairingDecision(session, authenticatedUserId, presentedSecret, now) === "usable";
}
