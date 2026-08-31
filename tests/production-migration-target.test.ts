import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CONFIRM_KEY,
  resolveProductionMigrationTarget,
} from "@/scripts/lib/production-migration-target.mts";
import { TEST_DB_MARKER } from "@/scripts/lib/require-test-db.mts";

/**
 * `pnpm db:migrate:production`: what it will migrate, and every way it refuses.
 *
 * The command it replaces, `pnpm db:migrate`, reads DATABASE_URL and asks
 * nothing. It cannot tell production from a QA branch, so the only thing
 * between a stale environment variable and a live schema change was attention.
 *
 * The guard here is the mirror image of the QA one. There the danger is
 * touching production by accident, so it demands a MARKED test database. Here
 * the target IS production, so a marker proves nothing and INTENT is what has
 * to be proven.
 *
 * NOTHING in this file runs a migration. It exercises the resolver only.
 */

const PROD =
  "postgresql://neondb_owner:pw@ep-gentle-thing-12345-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const PROD_ENDPOINT = "ep-gentle-thing-12345";

const QA = `postgresql://neondb_owner:pw@ep-polished-hill-98765-pooler.ap-southeast-1.aws.neon.tech/${TEST_DB_MARKER}?sslmode=require`;

/** An env with nothing inherited from the machine running the suite. */
function env(over: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { DATABASE_URL: "", E2E_DATABASE_URL: "", ...over } as unknown as NodeJS.ProcessEnv;
}

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    DATABASE_URL: process.env.DATABASE_URL,
    E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
    [CONFIRM_KEY]: process.env[CONFIRM_KEY],
    GOHA_ALLOW_DESTRUCTIVE: process.env.GOHA_ALLOW_DESTRUCTIVE,
  };
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("missing DATABASE_URL", () => {
  it("refuses rather than migrating anything", () => {
    expect(() => resolveProductionMigrationTarget(env())).toThrow(/needs DATABASE_URL/);
  });

  it("treats whitespace as missing", () => {
    expect(() => resolveProductionMigrationTarget(env({ DATABASE_URL: "  " }))).toThrow(
      /needs DATABASE_URL/,
    );
  });

  it("refuses even when E2E_DATABASE_URL is set and usable", () => {
    // The whole point of reading ONE variable: a missing production URL must
    // never silently become "migrate the QA database and report success".
    expect(() =>
      resolveProductionMigrationTarget(env({ E2E_DATABASE_URL: QA })),
    ).toThrow(/needs DATABASE_URL/);
  });

  it("says out loud that it will not fall back", () => {
    let message = "";
    try {
      resolveProductionMigrationTarget(env());
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("does NOT fall back to E2E_DATABASE_URL");
  });
});

describe("a QA / goha_test target", () => {
  it("is rejected on the marker even with a matching confirmation", () => {
    expect(() =>
      resolveProductionMigrationTarget(
        env({ DATABASE_URL: QA, [CONFIRM_KEY]: "ep-polished-hill-98765" }),
      ),
    ).toThrow(new RegExp(`marked "${TEST_DB_MARKER}"`));
  });

  it("is rejected when DATABASE_URL and E2E_DATABASE_URL are the same string", () => {
    /*
     * The realistic mistake: DATABASE_URL pointed at the QA branch for a local
     * run and never put back. Migrating that through the production command
     * would "succeed" while production stayed untouched.
     */
    const both = PROD;
    expect(() =>
      resolveProductionMigrationTarget(
        env({ DATABASE_URL: both, E2E_DATABASE_URL: both, [CONFIRM_KEY]: PROD_ENDPOINT }),
      ),
    ).toThrow(/same connection string/);
  });

  it("is rejected when it resolves to the same endpoint and database as QA", () => {
    // Same target reached by a slightly different string (pooled vs direct).
    const pooled = "postgresql://u:p@ep-shared-1-pooler.aws.neon.tech/appdb";
    const direct = "postgresql://u:p@ep-shared-1.aws.neon.tech/appdb";
    expect(() =>
      resolveProductionMigrationTarget(
        env({ DATABASE_URL: pooled, E2E_DATABASE_URL: direct, [CONFIRM_KEY]: "ep-shared-1" }),
      ),
    ).toThrow(/same\s+endpoint and database as E2E_DATABASE_URL/);
  });

  it("still works when E2E_DATABASE_URL is malformed", () => {
    // A broken QA variable is not a reason to block a release.
    const target = resolveProductionMigrationTarget(
      env({ DATABASE_URL: PROD, E2E_DATABASE_URL: "not a url", [CONFIRM_KEY]: PROD_ENDPOINT }),
    );
    expect(target.url).toBe(PROD);
  });
});

describe("the confirmation", () => {
  it("refuses when it is missing", () => {
    expect(() => resolveProductionMigrationTarget(env({ DATABASE_URL: PROD }))).toThrow(
      /needs an explicit confirmation/,
    );
  });

  it("shows the target so the operator can check before confirming", () => {
    let message = "";
    try {
      resolveProductionMigrationTarget(env({ DATABASE_URL: PROD }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("neondb");
    expect(message).toContain(PROD_ENDPOINT);
    expect(message).toContain("neondb_owner");
  });

  it("never puts the connection string or password in the message", () => {
    let message = "";
    try {
      resolveProductionMigrationTarget(env({ DATABASE_URL: PROD }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("pw@");
    expect(message).not.toContain("postgresql://");
  });

  it("refuses a confirmation that names a DIFFERENT database", () => {
    /*
     * The reason the value is the endpoint id rather than a fixed word: a
     * confirmation carried over from another environment must not pass here.
     */
    expect(() =>
      resolveProductionMigrationTarget(
        env({ DATABASE_URL: PROD, [CONFIRM_KEY]: "ep-some-other-project" }),
      ),
    ).toThrow(/does not match the target/);
  });

  it("cannot be satisfied by a generic value", () => {
    for (const guess of ["yes", "true", "1", "confirm", "yes-i-am-sure", "production"]) {
      expect(() =>
        resolveProductionMigrationTarget(env({ DATABASE_URL: PROD, [CONFIRM_KEY]: guess })),
      ).toThrow(/does not match the target/);
    }
  });

  it("accepts a correct production target with an exact confirmation", () => {
    const target = resolveProductionMigrationTarget(
      env({ DATABASE_URL: PROD, [CONFIRM_KEY]: PROD_ENDPOINT }),
    );
    expect(target.url).toBe(PROD);
    expect(target.identity).toEqual({
      database: "neondb",
      endpoint: PROD_ENDPOINT,
      role: "neondb_owner",
    });
  });

  it("accepts the confirmation with surrounding whitespace", () => {
    const target = resolveProductionMigrationTarget(
      env({ DATABASE_URL: PROD, [CONFIRM_KEY]: `  ${PROD_ENDPOINT}  ` }),
    );
    expect(target.url).toBe(PROD);
  });
});

describe("no destructive shortcut", () => {
  it("refuses GOHA_ALLOW_DESTRUCTIVE outright", () => {
    expect(() =>
      resolveProductionMigrationTarget(
        env({
          DATABASE_URL: PROD,
          [CONFIRM_KEY]: PROD_ENDPOINT,
          GOHA_ALLOW_DESTRUCTIVE: "yes-i-am-sure",
        }),
      ),
    ).toThrow(/does not accept GOHA_ALLOW_DESTRUCTIVE/);
  });

  it("refuses it before anything else can succeed", () => {
    // It must never produce a permissive verdict a later check has to undo.
    expect(() =>
      resolveProductionMigrationTarget(
        env({ DATABASE_URL: PROD, GOHA_ALLOW_DESTRUCTIVE: "yes-i-am-sure" }),
      ),
    ).toThrow(/does not accept GOHA_ALLOW_DESTRUCTIVE/);
  });
});

describe("the migration target is DATABASE_URL and never E2E_DATABASE_URL", () => {
  it("returns the production URL when both are set", () => {
    const target = resolveProductionMigrationTarget(
      env({ DATABASE_URL: PROD, E2E_DATABASE_URL: QA, [CONFIRM_KEY]: PROD_ENDPOINT }),
    );
    expect(target.url).toBe(PROD);
    expect(target.url).not.toBe(QA);
  });

  it("returns the exact string it validated, not a re-read", () => {
    const e = env({ DATABASE_URL: PROD, [CONFIRM_KEY]: PROD_ENDPOINT });
    const target = resolveProductionMigrationTarget(e);
    e.DATABASE_URL = QA;
    expect(target.url).toBe(PROD);
  });
});

describe("the script wiring", () => {
  const ROOT = process.cwd();
  const script = readFileSync(join(ROOT, "scripts/migrate-production.mts"), "utf8");
  /** Comments explain the difference between the variables; code must not read both. */
  const code = script.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("migrates the validated target and nothing else", () => {
    expect(code).toContain("resolveProductionMigrationTarget()");
    expect(code).toContain("neon(target.url)");
    expect(code).not.toContain("E2E_DATABASE_URL");
    expect(code).not.toContain("process.env");
  });

  it("resolves the target BEFORE opening a connection", () => {
    expect(code.indexOf("resolveProductionMigrationTarget()")).toBeLessThan(
      code.indexOf("drizzle("),
    );
  });

  it("prints identity but never the connection string", () => {
    expect(code).toContain("target.identity.database");
    expect(code).not.toMatch(/console\.log\([^)]*target\.url/);
  });

  it("leaves both sibling migrate paths untouched", () => {
    const legacy = readFileSync(join(ROOT, "db/migrate.mts"), "utf8");
    expect(legacy).toContain('requireEnv("DATABASE_URL")');
    expect(legacy).not.toContain("resolveProductionMigrationTarget");

    const qa = readFileSync(join(ROOT, "scripts/migrate-test.mts"), "utf8");
    expect(qa).toContain("resolveQaMigrationTarget()");
    expect(qa).not.toContain("resolveProductionMigrationTarget");
  });

  it("is wired to its own package script, alongside the others", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["db:migrate:production"]).toBe("node scripts/migrate-production.mts");
    expect(pkg.scripts["db:migrate:test"]).toBe("node scripts/migrate-test.mts");
    expect(pkg.scripts["db:migrate"]).toBe("node db/migrate.mts");
  });
});
