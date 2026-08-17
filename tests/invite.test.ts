import { describe, expect, it } from "vitest";

import {
  createInviteCode,
  formatInviteCode,
  hashInviteCode,
  INVITE_PREFIX_LENGTH,
  inviteCodePrefix,
  inviteHashesMatch,
  inviteState,
  normalizeInviteCode,
} from "@/lib/invite";

/**
 * Invitations are what stands between a public URL and a public sign-up page,
 * so the rules that decide whether one is usable are tested directly.
 */

describe("createInviteCode", () => {
  it("mints an unambiguous code and stores only its hash", () => {
    const invite = createInviteCode();

    // No O/0 and no I/l/1: this gets read aloud and retyped from a message.
    expect(invite.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{20}$/);
    expect(invite.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(invite.hash).toBe(hashInviteCode(invite.code));
    expect(invite.hash).not.toContain(invite.code);
    expect(invite.prefix).toBe(invite.code.slice(0, INVITE_PREFIX_LENGTH));
  });

  it("never mints the same code twice", () => {
    const codes = new Set(Array.from({ length: 100 }, () => createInviteCode().code));
    expect(codes.size).toBe(100);
  });
});

describe("normalizing a code", () => {
  it("forgives case and separators, because this gets retyped", () => {
    const invite = createInviteCode();
    const messy = `${invite.code.slice(0, 5).toLowerCase()}-${invite.code.slice(5)}`;

    expect(normalizeInviteCode(messy)).toBe(invite.code);
    // And the hash of the messy form still matches what was stored.
    expect(hashInviteCode(messy)).toBe(invite.hash);
    expect(inviteCodePrefix(messy)).toBe(invite.prefix);
  });

  it("strips spaces and stray punctuation", () => {
    expect(normalizeInviteCode("  ab cd-ef  ")).toBe("ABCDEF");
  });

  it("formats in groups for reading aloud", () => {
    expect(formatInviteCode("ABCDEFGHIJKLMNOPQRST")).toBe("ABCDE-FGHIJ-KLMNO-PQRST");
  });
});

describe("inviteHashesMatch", () => {
  it("matches equal hashes and nothing else", () => {
    const hash = hashInviteCode("ABCDEFGHJKMNPQRSTUVW");
    expect(inviteHashesMatch(hash, hashInviteCode("ABCDEFGHJKMNPQRSTUVW"))).toBe(true);
    expect(inviteHashesMatch(hash, hashInviteCode("ABCDEFGHJKMNPQRSTUVX"))).toBe(false);
    // Different lengths must not throw: timingSafeEqual requires equal buffers.
    expect(inviteHashesMatch(hash, "short")).toBe(false);
  });

  it("is not satisfied by a shared prefix, which is what the lookup keys on", () => {
    expect(inviteHashesMatch("a".repeat(64), `${"a".repeat(63)}b`)).toBe(false);
  });
});

describe("inviteState", () => {
  const now = new Date("2026-08-18T10:00:00.000Z");
  const base = { revokedAt: null, expiresAt: null, acceptedAt: null, claimedAt: null };

  it("is usable when nothing has happened to it", () => {
    expect(inviteState(base, now)).toBe("usable");
    expect(inviteState({ ...base, expiresAt: new Date("2026-08-19T00:00:00Z") }, now)).toBe("usable");
  });

  it("is used once claimed, before the account even exists", () => {
    // The claim happens BEFORE sign-up, which is what stops two people who
    // opened the same link at once from both getting an account.
    expect(inviteState({ ...base, claimedAt: now }, now)).toBe("used");
    expect(inviteState({ ...base, acceptedAt: now }, now)).toBe("used");
  });

  it("is expired at its expiry, not a second later", () => {
    expect(inviteState({ ...base, expiresAt: now }, now)).toBe("expired");
    expect(inviteState({ ...base, expiresAt: new Date("2026-08-18T09:59:59Z") }, now)).toBe(
      "expired",
    );
  });

  it("reports revoked ahead of everything else", () => {
    // Withdrawing is the owner's explicit act; it should be what they are told,
    // even if the invitation had also expired.
    expect(
      inviteState(
        { ...base, revokedAt: now, expiresAt: new Date("2020-01-01T00:00:00Z") },
        now,
      ),
    ).toBe("revoked");
  });
});
