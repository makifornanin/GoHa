import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Invitation codes.
 *
 * Same shape and the same reasoning as an automation token: what the database
 * holds is a SHA-256 hash and a short prefix, the code itself is shown once at
 * creation, and comparison is constant-time.
 *
 * Shorter than a token because a person may retype this one from a message
 * rather than paste it, and unambiguous characters only: no O/0, no I/l/1, so
 * "was that an oh or a zero" never happens.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 20;
export const INVITE_PREFIX_LENGTH = 6;

export type NewInviteCode = { code: string; hash: string; prefix: string };

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(normalizeInviteCode(code), "utf8").digest("hex");
}

/**
 * Case and separators do not matter.
 *
 * The code travels through a chat message and may be retyped, so "goha-abcd" and
 * "GOHA ABCD" are the same invitation. Normalising in one place means the
 * comparison, the lookup and the hash all agree on what the code IS.
 */
export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function inviteCodePrefix(code: string): string {
  return normalizeInviteCode(code).slice(0, INVITE_PREFIX_LENGTH);
}

export function createInviteCode(): NewInviteCode {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return { code, hash: hashInviteCode(code), prefix: inviteCodePrefix(code) };
}

/** Grouped for reading aloud: ABCDE-FGHIJ-KLMNO-PQRST. */
export function formatInviteCode(code: string): string {
  return (normalizeInviteCode(code).match(/.{1,5}/g) ?? []).join("-");
}

export function inviteHashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type InviteState = "usable" | "revoked" | "expired" | "used";

/** What state an invitation is in, for both the gate and the owner's list. */
export function inviteState(
  invite: {
    revokedAt: Date | null;
    expiresAt: Date | null;
    acceptedAt: Date | null;
    claimedAt: Date | null;
  },
  now: Date = new Date(),
): InviteState {
  if (invite.revokedAt) return "revoked";
  if (invite.acceptedAt || invite.claimedAt) return "used";
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "usable";
}
