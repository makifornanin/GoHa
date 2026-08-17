import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, TEST_DB_MARKER } from "@/scripts/lib/require-test-db.mts";

/**
 * The destructive-command guard (audit R-02).
 *
 * Every case sets DATABASE_URL explicitly, including the "missing" case, which
 * uses an empty string rather than deleting the key. That is deliberate: the
 * guard falls back to reading .env.local only when the variable is `undefined`,
 * and a test suite must never pull the real connection string into its own
 * process just to prove a branch.
 */

const REAL_LOOKING =
  "postgresql://neondb_owner:sup3r-s3cret-pw@ep-cool-boat-12345.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("requireTestDatabase", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      DATABASE_URL: process.env.DATABASE_URL,
      GOHA_ALLOW_DESTRUCTIVE: process.env.GOHA_ALLOW_DESTRUCTIVE,
    };
    delete process.env.GOHA_ALLOW_DESTRUCTIVE;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it("allows a database whose NAME carries the marker", () => {
    process.env.DATABASE_URL = `postgresql://u:p@ep-x.aws.neon.tech/${TEST_DB_MARKER}`;
    expect(requireTestDatabase()).toEqual({ allowedBy: "marker" });
  });

  it("allows a database whose HOSTNAME carries the marker", () => {
    process.env.DATABASE_URL = `postgresql://u:p@${TEST_DB_MARKER}.internal/neondb`;
    expect(requireTestDatabase()).toEqual({ allowedBy: "marker" });
  });

  it("refuses an unmarked database", () => {
    process.env.DATABASE_URL = REAL_LOOKING;
    expect(() => requireTestDatabase()).toThrow(/not marked as a test database/);
  });

  it("names the caller in the refusal so the operator knows what was blocked", () => {
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
    // The marker itself must still be named, or the message cannot be acted on.
    expect(message).toContain(TEST_DB_MARKER);
  });

  it("allows an unmarked database only with the exact override value", () => {
    process.env.DATABASE_URL = REAL_LOOKING;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    process.env.GOHA_ALLOW_DESTRUCTIVE = "yes-i-am-sure";
    expect(requireTestDatabase()).toEqual({ allowedBy: "override" });
    // The override must be loud; a silent bypass is how it becomes the default.
    expect(warn).toHaveBeenCalled();
  });

  it("ignores a near-miss override value", () => {
    process.env.DATABASE_URL = REAL_LOOKING;
    for (const value of ["yes", "true", "1", "yes-i-am-sure ", "YES-I-AM-SURE"]) {
      process.env.GOHA_ALLOW_DESTRUCTIVE = value;
      expect(() => requireTestDatabase()).toThrow(/not marked as a test database/);
    }
  });

  it("refuses when DATABASE_URL is present but empty", () => {
    process.env.DATABASE_URL = "";
    expect(() => requireTestDatabase()).toThrow(/needs DATABASE_URL/);
  });

  it("refuses a connection string it cannot parse", () => {
    process.env.DATABASE_URL = "not-a-url";
    expect(() => requireTestDatabase()).toThrow(/could not parse DATABASE_URL/);
  });

  it("does not treat a marker in the password or query string as a test database", () => {
    // The marker must identify the TARGET, not appear anywhere in the string.
    process.env.DATABASE_URL = `postgresql://u:${TEST_DB_MARKER}@ep-x.aws.neon.tech/neondb?options=${TEST_DB_MARKER}`;
    expect(() => requireTestDatabase()).toThrow(/not marked as a test database/);
  });
});
