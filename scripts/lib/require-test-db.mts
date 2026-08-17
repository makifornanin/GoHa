import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The guard that stands between destructive tooling and the owner's database
 * (audit R-02, CRITICAL).
 *
 * Both the Playwright suite and `scripts/test-account.mts` used whatever
 * `DATABASE_URL` the normal environment supplied. On this machine that is the
 * live owner database, and `test:account:destroy` deletes a user row with
 * cascade. Nothing but the operator's memory stood between a mistyped command
 * and years of real data.
 *
 * A destructive script may now run only when ONE of these is true:
 *
 *  1. The connection string is visibly a test database: the marker
 *     `goha_test` appears in the hostname or the database name.
 *  2. The operator has explicitly and verbosely opted out for this one
 *     invocation: `GOHA_ALLOW_DESTRUCTIVE=yes-i-am-sure`.
 *
 * Deliberately self-contained: it reads its own env files rather than sharing a
 * loader with the scripts it protects. A guard that can be disabled by a
 * refactor somewhere else is not a guard. It is also careful never to print the
 * connection string, the host, the role, or the database name, because the most
 * likely time to run this is while pasting terminal output to someone else.
 */

/** The substring that marks a connection string as safe to destroy. */
export const TEST_DB_MARKER = "goha_test";

/** Escape hatch, deliberately long enough that it cannot be typed by accident. */
const OVERRIDE_KEY = "GOHA_ALLOW_DESTRUCTIVE";
const OVERRIDE_VALUE = "yes-i-am-sure";

/**
 * Minimal `.env` reader. Raw line parsing, no shell interpretation, so a
 * connection string containing `&` or `#` survives intact. Existing process env
 * always wins, and no value is ever echoed.
 */
function loadEnvFile(file: string): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export type TestDbVerdict = {
  /** Why the run was permitted. */
  allowedBy: "marker" | "override";
  /** The connection string the caller should actually use. */
  url: string;
  /** Which variable it came from, for the caller to report without the value. */
  source: DestructiveUrlSource;
};

export type DestructiveUrlSource = "E2E_DATABASE_URL" | "DATABASE_URL";

/**
 * Which connection string destructive tooling targets.
 *
 * E2E_DATABASE_URL wins when present. That indirection is the whole point:
 * without it, running the suite safely means hand-editing DATABASE_URL before
 * every run and remembering to put it back, which is exactly the mistake the
 * guard exists to catch. With it, `pnpm test:e2e` targets the test database by
 * construction and the owner database is never named in the command.
 *
 * Falls back to DATABASE_URL so a machine that genuinely has only a test
 * database (CI, a disposable container) needs no extra configuration.
 */
export function resolveDestructiveDatabaseUrl(): {
  url: string | undefined;
  source: DestructiveUrlSource;
} {
  if (process.env.E2E_DATABASE_URL === undefined && process.env.DATABASE_URL === undefined) {
    loadEnvFile(".env.local");
    loadEnvFile(".env");
  }
  const e2e = process.env.E2E_DATABASE_URL;
  if (e2e) return { url: e2e, source: "E2E_DATABASE_URL" };
  return { url: process.env.DATABASE_URL, source: "DATABASE_URL" };
}

/**
 * Throws unless the database destructive tooling would target is safe to write
 * to. Returns the connection string to use, so callers cannot accidentally
 * connect to a different one than the one that was checked.
 *
 * @param context Short description of the caller, used in the error message
 *                so the operator knows which command was blocked.
 */
export function requireTestDatabase(context = "This command"): TestDbVerdict {
  const { url: raw, source } = resolveDestructiveDatabaseUrl();

  if (!raw) {
    throw new Error(
      `${context} needs a database URL, and neither E2E_DATABASE_URL nor DATABASE_URL is set.\n` +
        "Set E2E_DATABASE_URL to a TEST database before running anything destructive.",
    );
  }

  if (process.env[OVERRIDE_KEY] === OVERRIDE_VALUE) {
    // Loud, because the whole point of the override is that it should feel
    // like a decision rather than a default.
    console.warn(
      `!! ${OVERRIDE_KEY}=${OVERRIDE_VALUE} is set.\n` +
        `!! ${context} will run against ${source}, whatever it points at.\n` +
        "!! If that is the owner database, this can delete real data.",
    );
    return { allowedBy: "override", url: raw, source };
  }

  // Parse for identity only. Nothing derived from this is ever printed.
  let hostname: string;
  let database: string;
  try {
    const parsed = new URL(raw);
    hostname = parsed.hostname;
    // "/neondb" -> "neondb". Query params (sslmode, channel_binding) are
    // already excluded from pathname.
    database = parsed.pathname.replace(/^\//, "");
  } catch {
    throw new Error(
      `${context} could not parse ${source} as a URL, so it cannot confirm ` +
        "the target is a test database. Refusing to continue.",
    );
  }

  const marked =
    hostname.includes(TEST_DB_MARKER) || database.includes(TEST_DB_MARKER);

  if (!marked) {
    throw new Error(
      `${context} refuses to run: ${source} is not marked as a test database.\n` +
        "\n" +
        `Expected "${TEST_DB_MARKER}" in its hostname or database name.\n` +
        "(The actual value is not shown here on purpose.)\n" +
        "\n" +
        "Set one up once, in the Neon project you already have:\n" +
        "\n" +
        "  1. In the Neon SQL editor, on your existing project:\n" +
        `       CREATE DATABASE ${TEST_DB_MARKER};\n` +
        "  2. Copy that database's connection string into .env.local as:\n" +
        `       E2E_DATABASE_URL=...\n` +
        "  3. Apply the schema to it once:\n" +
        `       DATABASE_URL=$E2E_DATABASE_URL pnpm db:migrate\n` +
        "\n" +
        "No second project, no second bill, and DATABASE_URL never changes.\n" +
        "\n" +
        `If you genuinely mean to target ${source} as it is, re-run with:\n` +
        `  ${OVERRIDE_KEY}=${OVERRIDE_VALUE}\n` +
        "Only do this if you accept that real data may be deleted.",
    );
  }

  return { allowedBy: "marker", url: raw, source };
}
