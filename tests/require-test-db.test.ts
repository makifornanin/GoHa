import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  requireTestDatabase,
  resolveDestructiveDatabaseUrl,
  TEST_DB_MARKER,
} from "@/scripts/lib/require-test-db.mts";

/**
 * The destructive-command guard (audit R-02).
 *
 * Every case sets both env vars explicitly, including the "missing" case, which
 * uses an empty string rather than deleting the key. That is deliberate: the
 * guard falls back to reading .env.local only when BOTH are `undefined`, and a
 * test suite must never pull the real connection string into its own process
 * just to prove a branch.
 */

const REAL_LOOKING =
  "postgresql://neondb_owner:sup3r-s3cret-pw@ep-cool-boat-12345.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

const TEST_LOOKING = `postgresql://neondb_owner:pw@ep-cool-boat-12345.ap-southeast-1.aws.neon.tech/${TEST_DB_MARKER}?sslmode=require`;

describe("requireTestDatabase", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      DATABASE_URL: process.env.DATABASE_URL,
      E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
      GOHA_ALLOW_DESTRUCTIVE: process.env.GOHA_ALLOW_DESTRUCTIVE,
    };
    // Empty, not deleted: an undefined pair sends the guard to .env.local.
    process.env.DATABASE_URL = "";
    process.env.E2E_DATABASE_URL = "";
    delete process.env.GOHA_ALLOW_DESTRUCTIVE;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  describe("which URL it targets", () => {
    it("prefers E2E_DATABASE_URL when set", () => {
      process.env.DATABASE_URL = REAL_LOOKING;
      process.env.E2E_DATABASE_URL = TEST_LOOKING;
      expect(resolveDestructiveDatabaseUrl()).toEqual({
        url: TEST_LOOKING,
        source: "E2E_DATABASE_URL",
      });
    });

    it("falls back to DATABASE_URL when E2E_DATABASE_URL is absent", () => {
      process.env.DATABASE_URL = TEST_LOOKING;
      expect(resolveDestructiveDatabaseUrl()).toEqual({
        url: TEST_LOOKING,
        source: "DATABASE_URL",
      });
    });

    it("protects the owner database even when DATABASE_URL points at it", () => {
      // The realistic .env.local shape: real DB for the app, test DB for tests.
      process.env.DATABASE_URL = REAL_LOOKING;
      process.env.E2E_DATABASE_URL = TEST_LOOKING;
      const verdict = requireTestDatabase();
      expect(verdict.allowedBy).toBe("marker");
      // Crucially: the URL handed back is the TEST one, so a caller cannot
      // validate one database and then connect to another.
      expect(verdict.url).toBe(TEST_LOOKING);
      expect(verdict.source).toBe("E2E_DATABASE_URL");
    });

    it("refuses when only the owner database is configured", () => {
      process.env.DATABASE_URL = REAL_LOOKING;
      expect(() => requireTestDatabase()).toThrow(/not marked as a test database/);
    });
  });

  describe("the marker rule", () => {
    it("allows a database whose NAME carries the marker", () => {
      process.env.E2E_DATABASE_URL = `postgresql://u:p@ep-x.aws.neon.tech/${TEST_DB_MARKER}`;
      expect(requireTestDatabase().allowedBy).toBe("marker");
    });

    it("allows a database whose HOSTNAME carries the marker", () => {
      process.env.E2E_DATABASE_URL = `postgresql://u:p@${TEST_DB_MARKER}.internal/neondb`;
      expect(requireTestDatabase().allowedBy).toBe("marker");
    });

    it("does not accept a marker hiding in the password or query string", () => {
      // The marker must identify the TARGET, not appear anywhere in the string.
      process.env.E2E_DATABASE_URL = `postgresql://u:${TEST_DB_MARKER}@ep-x.aws.neon.tech/neondb?options=${TEST_DB_MARKER}`;
      expect(() => requireTestDatabase()).toThrow(/not marked as a test database/);
    });
  });

  describe("refusal messages", () => {
    it("names the caller so the operator knows what was blocked", () => {
      process.env.DATABASE_URL = REAL_LOOKING;
      expect(() => requireTestDatabase("pnpm test:account:destroy")).toThrow(
        /^pnpm test:account:destroy refuses to run/,
      );
    });

    it("never leaks the connection string, password, host or database name", () => {
      process.env.DATABASE_URL = REAL_LOOKING;
      let message = "";
      try {
        requireTestDatabase();
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).not.toContain(REAL_LOOKING);
      expect(message).not.toContain("sup3r-s3cret-pw");
      expect(message).not.toContain("ep-cool-boat-12345");
      expect(message).not.toContain("neondb_owner");
      // It must still be actionable: name the marker and the way to get one.
      expect(message).toContain(TEST_DB_MARKER);
      expect(message).toContain("CREATE DATABASE");
      expect(message).toContain("E2E_DATABASE_URL");
    });

    it("refuses when no database URL is configured at all", () => {
      expect(() => requireTestDatabase()).toThrow(/neither E2E_DATABASE_URL nor DATABASE_URL/);
    });

    it("refuses a connection string it cannot parse", () => {
      process.env.E2E_DATABASE_URL = "not-a-url";
      expect(() => requireTestDatabase()).toThrow(/could not parse E2E_DATABASE_URL/);
    });
  });

  describe("the override", () => {
    it("allows an unmarked database with the exact value, loudly", () => {
      process.env.DATABASE_URL = REAL_LOOKING;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      process.env.GOHA_ALLOW_DESTRUCTIVE = "yes-i-am-sure";
      expect(requireTestDatabase().allowedBy).toBe("override");
      // A silent bypass is how an escape hatch becomes the default.
      expect(warn).toHaveBeenCalled();
    });

    it("ignores near-miss values", () => {
      process.env.DATABASE_URL = REAL_LOOKING;
      for (const value of ["yes", "true", "1", "yes-i-am-sure ", "YES-I-AM-SURE", ""]) {
        process.env.GOHA_ALLOW_DESTRUCTIVE = value;
        expect(() => requireTestDatabase()).toThrow(/not marked as a test database/);
      }
    });
  });
});
