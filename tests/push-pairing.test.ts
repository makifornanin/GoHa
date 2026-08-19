import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPairingSecret,
  hashPairingSecret,
  isPairingUsableForUser,
  pairingDecision,
  pairingHashesMatch,
  PAIRING_SECRET_LABEL,
  PAIRING_SECRET_PREFIX_LENGTH,
  PAIRING_TTL_MS,
} from "@/lib/push/pairing";

describe("push pairing secrets", () => {
  it("mints a high-entropy URL-fragment-safe secret and retains only its hash", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    const pairing = createPairingSecret(now);

    expect(pairing.secret).toMatch(/^goha_pair_[A-Za-z0-9_-]{43}$/);
    expect(pairing.secret.startsWith(`${PAIRING_SECRET_LABEL}_`)).toBe(true);
    expect(pairing.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(pairing.secretHash).toBe(hashPairingSecret(pairing.secret));
    expect(pairing.secretHash).not.toContain(pairing.secret);
    expect(pairing.secretPrefix).toBe(pairing.secret.slice(0, PAIRING_SECRET_PREFIX_LENGTH));
    expect(pairing.issuedAt).not.toBe(now);
    expect(pairing.issuedAt.getTime()).toBe(now.getTime());
    expect(pairing.expiresAt.getTime() - pairing.issuedAt.getTime()).toBe(PAIRING_TTL_MS);
  });

  it("does not repeat a secret", () => {
    const secrets = new Set(Array.from({ length: 100 }, () => createPairingSecret().secret));
    expect(secrets.size).toBe(100);
  });

  it("compares only complete SHA-256 values", () => {
    const hash = hashPairingSecret("goha_pair_one");
    expect(pairingHashesMatch(hash, hashPairingSecret("goha_pair_one"))).toBe(true);
    expect(pairingHashesMatch(hash, hashPairingSecret("goha_pair_two"))).toBe(false);
    expect(pairingHashesMatch(hash, `${hash.slice(0, 63)}0`)).toBe(false);
    expect(pairingHashesMatch("", "")).toBe(false);
  });
});

describe("push pairing eligibility", () => {
  const secret = "goha_pair_abcdefghijklmnopqrstuvwxyz0123456789ABCDE";
  const ownerId = "00000000-0000-4000-8000-000000000001";
  const now = new Date("2026-08-18T12:00:00.000Z");
  const base = {
    userId: ownerId,
    secretHash: hashPairingSecret(secret),
    issuedAt: new Date("2026-08-18T11:55:00.000Z"),
    expiresAt: new Date("2026-08-18T12:05:00.000Z"),
    consumedAt: null,
  };

  it("requires an independently authenticated matching account", () => {
    expect(pairingDecision(base, ownerId, secret, now)).toBe("usable");
    expect(
      pairingDecision(base, "00000000-0000-4000-8000-000000000002", secret, now),
    ).toBe("wrong_user");
    expect(
      isPairingUsableForUser(
        base,
        "00000000-0000-4000-8000-000000000002",
        secret,
        now,
      ),
    ).toBe(false);
  });

  it("rejects the wrong secret without relying on a shared prefix", () => {
    expect(pairingDecision(base, ownerId, `${secret.slice(0, -1)}F`, now)).toBe(
      "secret_mismatch",
    );
  });

  it("expires at the exact expiry instant", () => {
    expect(pairingDecision({ ...base, expiresAt: now }, ownerId, secret, now)).toBe("expired");
    expect(
      pairingDecision(
        { ...base, expiresAt: new Date(now.getTime() - 1) },
        ownerId,
        secret,
        now,
      ),
    ).toBe("expired");
  });

  it("rejects a consumed or not-yet-issued session", () => {
    expect(pairingDecision({ ...base, consumedAt: now }, ownerId, secret, now)).toBe(
      "consumed",
    );
    expect(
      pairingDecision(
        { ...base, issuedAt: new Date(now.getTime() + 1_000) },
        ownerId,
        secret,
        now,
      ),
    ).toBe("not_yet_valid");
  });
});
