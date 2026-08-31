import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveQaMigrationTarget } from "@/scripts/lib/qa-migration-target.mts";
import { TEST_DB_MARKER } from "@/scripts/lib/require-test-db.mts";

/**
 * `pnpm db:migrate:test`: which database it will migrate, and every way it
 * refuses.
 *
 * The failure this prevents is specific. `pnpm db:migrate` reads DATABASE_URL
 * and has NO guard, so migrating a QA branch used to mean overriding that
 * variable by hand, which is the mistake the test-database guard exists to
 * catch, performed against the one command that could not catch it. This path
 * reads a different variable, refuses anything unmarked, and never falls back.
 *
 * Every case sets both variables EXPLICITLY, including the "missing" ones,
 * which use an empty string rather than a delete: leaving them undefined sends
 * the shared guard to read .env.local, and a test must never pull the real
 * connection string into its own process just to prove a branch.
 */

const PROD_LIKE =
  "postgresql://neondb_owner:pw@ep-gentle-thing-12345-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

const TEST_LIKE =
  `postgresql://neondb_owner:pw@ep-polished-hill-98765-pooler.ap-southeast-1.aws.neon.tech/${TEST_DB_MARKER}?sslmode=require`;

/**
 * An env with nothing inherited from the machine running the suite.
 *
 * Typed as the loose record the resolver actually reads rather than a full
 * `ProcessEnv`: this project's `ProcessEnv` requires NODE_ENV, and casting a
 * two-key object through `unknown` to satisfy that would be a lie about what
 * these cases construct. The resolver only ever indexes the two keys below.
 */
function env(over: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { DATABASE_URL: "", E2E_DATABASE_URL: "", ...over } as unknown as NodeJS.ProcessEnv;
}

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    DATABASE_URL: process.env.DATABASE_URL,
    E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
    GOHA_ALLOW_DESTRUCTIVE: process.env.GOHA_ALLOW_DESTRUCTIVE,
  };
  // The shared guard reads process.env, not the object passed in, so the real
  // values must be neutralised for the duration of each case.
  process.env.DATABASE_URL = "";
  process.env.E2E_DATABASE_URL = "";
  delete process.env.GOHA_ALLOW_DESTRUCTIVE;
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Point BOTH the passed env and process.env at the same values. */
function withEnv(over: Record<string, string>): NodeJS.ProcessEnv {
  for (const [k, v] of Object.entries(over)) process.env[k] = v;
  return env(over);
}

describe("missing E2E_DATABASE_URL", () => {
  it("refuses rather than migrating anything", () => {
    expect(() => resolveQaMigrationTarget(env())).toThrow(/needs E2E_DATABASE_URL/);
  });

  it("refuses even when DATABASE_URL is perfectly usable", () => {
    /*
     * The whole point. The shared guard FALLS BACK to DATABASE_URL when
     * E2E_DATABASE_URL is unset, which is right for a CI box that has only a
     * test database and catastrophic here: it would migrate production because
     * a variable was missing.
     */
    const e = withEnv({ DATABASE_URL: TEST_LIKE });
    process.env.E2E_DATABASE_URL = "";
    expect(() => resolveQaMigrationTarget({ ...e, E2E_DATABASE_URL: "" })).toThrow(
      /needs E2E_DATABASE_URL/,
    );
  });

  it("treats whitespace as missing", () => {
    expect(() => resolveQaMigrationTarget(env({ E2E_DATABASE_URL: "   " }))).toThrow(
      /needs E2E_DATABASE_URL/,
    );
  });

  it("names DATABASE_URL only to say it will NOT be used", () => {
    let message = "";
    try {
      resolveQaMigrationTarget(env());
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("does NOT fall back to DATABASE_URL");
  });
});

describe("a production-like URL", () => {
  it("is rejected because nothing marks it as a test database", () => {
    const e = withEnv({ E2E_DATABASE_URL: PROD_LIKE });
    expect(() => resolveQaMigrationTarget(e)).toThrow(/not marked as a test database/);
  });

  it("is rejected even when the override is set", () => {
    /*
     * The shared guard accepts GOHA_ALLOW_DESTRUCTIVE and this path does not.
     * Emptying a scratch account with it is a reasonable escape hatch; applying
     * schema changes to a database nobody has marked as disposable is not.
     */
    const e = withEnv({
      E2E_DATABASE_URL: PROD_LIKE,
      GOHA_ALLOW_DESTRUCTIVE: "yes-i-am-sure",
    });
    expect(() => resolveQaMigrationTarget(e)).toThrow(/does not accept GOHA_ALLOW_DESTRUCTIVE/);
  });

  it("refuses the override before it even consults the marker", () => {
    // Order matters: the override must never produce a permissive verdict that
    // a later check has to undo.
    const e = withEnv({
      E2E_DATABASE_URL: TEST_LIKE,
      GOHA_ALLOW_DESTRUCTIVE: "yes-i-am-sure",
    });
    expect(() => resolveQaMigrationTarget(e)).toThrow(/does not accept GOHA_ALLOW_DESTRUCTIVE/);
  });

  it("is rejected when the marker appears only in the ROLE or password", () => {
    // The guard reads hostname and database name. A marker smuggled elsewhere
    // in the string must not satisfy it.
    const sneaky = `postgresql://${TEST_DB_MARKER}:${TEST_DB_MARKER}@ep-gentle-thing-12345.aws.neon.tech/neondb`;
    const e = withEnv({ E2E_DATABASE_URL: sneaky });
    expect(() => resolveQaMigrationTarget(e)).toThrow(/not marked as a test database/);
  });

  it("never puts the connection string in the error", () => {
    const e = withEnv({ E2E_DATABASE_URL: PROD_LIKE });
    let message = "";
    try {
      resolveQaMigrationTarget(e);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("ep-gentle-thing-12345");
    expect(message).not.toContain("pw@");
  });
});

describe("a goha_test database", () => {
  it("is accepted", () => {
    const e = withEnv({ E2E_DATABASE_URL: TEST_LIKE });
    const target = resolveQaMigrationTarget(e);
    expect(target.url).toBe(TEST_LIKE);
    expect(target.source).toBe("E2E_DATABASE_URL");
  });

  it("is accepted on the marker, never on an override", () => {
    const e = withEnv({ E2E_DATABASE_URL: TEST_LIKE });
    expect(() => resolveQaMigrationTarget(e)).not.toThrow();
    expect(process.env.GOHA_ALLOW_DESTRUCTIVE).toBeUndefined();
  });

  it("is accepted when the marker is in the HOSTNAME rather than the name", () => {
    const marked = `postgresql://u:p@ep-${TEST_DB_MARKER}-1.aws.neon.tech/neondb`;
    const e = withEnv({ E2E_DATABASE_URL: marked });
    expect(resolveQaMigrationTarget(e).url).toBe(marked);
  });
});

describe("the migration target is E2E_DATABASE_URL and never DATABASE_URL", () => {
  it("returns the E2E URL when both are set and both are marked", () => {
    /*
     * Both valid, so nothing forces a choice except the rule itself. If this
     * ever returned DATABASE_URL, `db:migrate:test` would silently migrate a
     * different database than the one the operator configured for QA.
     */
    const other = `postgresql://u:p@ep-somewhere-else.aws.neon.tech/${TEST_DB_MARKER}`;
    const e = withEnv({ E2E_DATABASE_URL: TEST_LIKE, DATABASE_URL: other });
    const target = resolveQaMigrationTarget(e);
    expect(target.url).toBe(TEST_LIKE);
    expect(target.url).not.toBe(other);
  });

  it("returns the exact string the guard validated, not a re-read", () => {
    // Re-reading the environment would leave a window in which the migrated
    // URL could differ from the checked one.
    const e = withEnv({ E2E_DATABASE_URL: TEST_LIKE });
    const target = resolveQaMigrationTarget(e);
    process.env.E2E_DATABASE_URL = PROD_LIKE;
    expect(target.url).toBe(TEST_LIKE);
  });

  it("reports its source, so a caller cannot mislabel what it migrated", () => {
    const e = withEnv({ E2E_DATABASE_URL: TEST_LIKE });
    expect(resolveQaMigrationTarget(e).source).toBe("E2E_DATABASE_URL");
  });
});

describe("the script wiring", () => {
  const ROOT = process.cwd();
  const script = readFileSync(join(ROOT, "scripts/migrate-test.mts"), "utf8");

  /**
   * Source with its comments removed.
   *
   * The script's docstring explains the difference between DATABASE_URL and
   * E2E_DATABASE_URL, which is exactly the prose a naive "does not mention
   * DATABASE_URL" assertion matches. What matters is whether the CODE reads it.
   */
  const code = script.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("migrates the validated target and nothing else", () => {
    expect(code).toContain("resolveQaMigrationTarget()");
    expect(code).toContain("neon(target.url)");
    // The production variable is never READ in this file, only described.
    expect(code).not.toContain("DATABASE_URL");
    expect(code).not.toContain("process.env");
  });

  it("resolves the target BEFORE opening a connection", () => {
    expect(code.indexOf("resolveQaMigrationTarget()")).toBeLessThan(code.indexOf("drizzle("));
  });

  it("prints identity but never the connection string", () => {
    expect(code).toContain("parsed.pathname");
    expect(code).not.toMatch(/console\.log\([^)]*target\.url/);
  });

  it("leaves the legacy migrate script's BEHAVIOUR untouched", () => {
    /*
     * db:migrate still reads DATABASE_URL with no guard, exactly as before.
     *
     * Comments are stripped before asserting: its docstring now names both
     * E2E_DATABASE_URL and db:migrate:production to point readers at the
     * guarded paths, and a raw-text check would read that signpost as the
     * script having grown behaviour it does not have.
     */
    const legacy = readFileSync(join(ROOT, "db/migrate.mts"), "utf8");
    const code = legacy.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).toContain('requireEnv("DATABASE_URL")');
    expect(code).not.toContain("E2E_DATABASE_URL");
    expect(code).not.toContain("requireTestDatabase");
    expect(code).not.toContain("resolveQaMigrationTarget");
  });

  it("is wired to a package script of its own", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["db:migrate:test"]).toBe("node scripts/migrate-test.mts");
    // And the production one is unchanged.
    expect(pkg.scripts["db:migrate"]).toBe("node db/migrate.mts");
  });
});
