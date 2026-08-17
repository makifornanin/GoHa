import { describe, expect, it } from "vitest";

import {
  bearerToken,
  createToken,
  hashesMatch,
  hashToken,
  isTokenUsable,
  TOKEN_PREFIX_LABEL,
  TOKEN_PREFIX_LENGTH,
  tokenPrefix,
} from "@/lib/automation/token";
import {
  rateLimitDecision,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS,
  windowStart,
} from "@/lib/automation/rate-limit";

/**
 * The automation surface is the one place this app is reachable from outside,
 * so the rules that decide who gets in are tested directly rather than through
 * a route.
 */

describe("createToken", () => {
  it("mints a labelled, high-entropy secret and stores only its hash", () => {
    const token = createToken();

    expect(token.secret.startsWith(`${TOKEN_PREFIX_LABEL}_`)).toBe(true);
    // 32 random bytes as unpadded base64url, plus the label.
    expect(token.secret.length).toBeGreaterThanOrEqual(40);
    expect(token.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(token.hash).toBe(hashToken(token.secret));
    // The stored hash must not contain the secret in any recoverable form.
    expect(token.hash).not.toContain(token.secret);
  });

  it("keeps a prefix that identifies without reconstructing", () => {
    const token = createToken();
    expect(token.prefix).toBe(token.secret.slice(0, TOKEN_PREFIX_LENGTH));
    expect(token.prefix).toBe(tokenPrefix(token.secret));
    expect(token.prefix.length).toBeLessThan(token.secret.length);
  });

  it("never mints the same secret twice", () => {
    const secrets = new Set(Array.from({ length: 50 }, () => createToken().secret));
    expect(secrets.size).toBe(50);
  });

  it("produces URL-safe secrets, so pasting one anywhere is lossless", () => {
    for (let i = 0; i < 25; i++) {
      expect(createToken().secret).toMatch(/^goha_[A-Za-z0-9_-]+$/);
    }
  });
});

describe("bearerToken", () => {
  it("reads a bearer token, case-insensitively and trimmed", () => {
    expect(bearerToken("Bearer goha_abc")).toBe("goha_abc");
    expect(bearerToken("bearer   goha_abc  ")).toBe("goha_abc");
    expect(bearerToken("BEARER goha_abc")).toBe("goha_abc");
  });

  it("refuses anything that is not a bearer header", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer   ")).toBeNull();
    expect(bearerToken("Basic goha_abc")).toBeNull();
    // A token in a query string is not accepted anywhere; nothing reads one.
    expect(bearerToken("?token=goha_abc")).toBeNull();
  });
});

describe("hashesMatch", () => {
  it("matches identical hashes and rejects everything else", () => {
    const hash = hashToken("goha_one");
    expect(hashesMatch(hash, hashToken("goha_one"))).toBe(true);
    expect(hashesMatch(hash, hashToken("goha_two"))).toBe(false);
    // Length mismatch must not throw: timingSafeEqual requires equal lengths.
    expect(hashesMatch(hash, "short")).toBe(false);
    expect(hashesMatch("", "")).toBe(true);
  });

  it("is not fooled by a shared prefix, which is what the lookup keys on", () => {
    const a = "a".repeat(64);
    const b = `${"a".repeat(63)}b`;
    expect(hashesMatch(a, b)).toBe(false);
  });
});

describe("isTokenUsable", () => {
  const now = new Date("2026-08-17T10:00:00.000Z");

  it("accepts a live token", () => {
    expect(isTokenUsable({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(
      isTokenUsable({ revokedAt: null, expiresAt: new Date("2026-08-18T10:00:00.000Z") }, now),
    ).toBe(true);
  });

  it("refuses a revoked token, whatever its expiry says", () => {
    expect(
      isTokenUsable(
        { revokedAt: new Date("2026-08-01T00:00:00.000Z"), expiresAt: null },
        now,
      ),
    ).toBe(false);
  });

  it("refuses a token at and after its expiry, not a second later", () => {
    expect(isTokenUsable({ revokedAt: null, expiresAt: now }, now)).toBe(false);
    expect(
      isTokenUsable({ revokedAt: null, expiresAt: new Date("2026-08-17T09:59:59.000Z") }, now),
    ).toBe(false);
  });
});

describe("rate limit policy", () => {
  it("allows up to the limit and refuses the one after", () => {
    expect(rateLimitDecision(0).allowed).toBe(true);
    expect(rateLimitDecision(RATE_LIMIT_MAX - 1).allowed).toBe(true);
    expect(rateLimitDecision(RATE_LIMIT_MAX).allowed).toBe(false);
    expect(rateLimitDecision(RATE_LIMIT_MAX + 500).allowed).toBe(false);
  });

  it("counts the request being decided against the allowance", () => {
    expect(rateLimitDecision(0).remaining).toBe(RATE_LIMIT_MAX - 1);
    expect(rateLimitDecision(RATE_LIMIT_MAX - 1).remaining).toBe(0);
    expect(rateLimitDecision(RATE_LIMIT_MAX).remaining).toBe(0);
  });

  it("offers a retry only when it refused", () => {
    expect(rateLimitDecision(1).retryAfterSeconds).toBe(0);
    expect(rateLimitDecision(RATE_LIMIT_MAX).retryAfterSeconds).toBe(RATE_LIMIT_WINDOW_SECONDS);
  });

  it("windows backwards from now by exactly the window length", () => {
    const now = new Date("2026-08-17T10:00:00.000Z");
    expect(windowStart(now).toISOString()).toBe("2026-08-17T09:59:00.000Z");
    expect(windowStart(now, 300).toISOString()).toBe("2026-08-17T09:55:00.000Z");
  });
});
