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
};

/**
 * Throws unless the configured database is safe to write destructively.
 *
 * @param context Short description of the caller, used in the error message
 *                so the operator knows which command was blocked.
 */
export function requireTestDatabase(context = "This command"): TestDbVerdict {
  if (process.env.DATABASE_URL === undefined) {
    loadEnvFile(".env.local");
    loadEnvFile(".env");
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      `${context} needs DATABASE_URL, and it is not set.\n` +
        "Set it to a TEST database before running anything destructive.",
    );
  }

  if (process.env[OVERRIDE_KEY] === OVERRIDE_VALUE) {
    // Loud, because the whole point of the override is that it should feel
    // like a decision rather than a default.
    console.warn(
      `!! ${OVERRIDE_KEY}=${OVERRIDE_VALUE} is set.\n` +
        `!! ${context} will run against the CONFIGURED database, whatever it is.\n` +
        "!! If that is the owner database, this can delete real data.",
    );
    return { allowedBy: "override" };
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
      `${context} could not parse DATABASE_URL as a URL, so it cannot confirm ` +
        "the target is a test database. Refusing to continue.",
    );
  }

  const marked =
    hostname.includes(TEST_DB_MARKER) || database.includes(TEST_DB_MARKER);

  if (!marked) {
    throw new Error(
      `${context} refuses to run: the configured database is not marked as a test database.\n` +
        "\n" +
        `Expected "${TEST_DB_MARKER}" in the DATABASE_URL hostname or database name.\n` +
        "(The actual value is not shown here on purpose.)\n" +
        "\n" +
        "Fix it one of these ways:\n" +
        `  1. Point DATABASE_URL at a database whose name contains ${TEST_DB_MARKER}\n` +
        "     (a Neon branch named goha_test is the cheapest way to get one).\n" +
        `  2. If you genuinely mean to target the current database, re-run with:\n` +
        `       ${OVERRIDE_KEY}=${OVERRIDE_VALUE}\n` +
        "     Only do this if you accept that real data may be deleted.",
    );
  }

  return { allowedBy: "marker" };
}
