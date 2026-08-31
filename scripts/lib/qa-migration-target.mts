import { requireTestDatabase, type TestDbVerdict } from "./require-test-db.mts";

/**
 * Which database `pnpm db:migrate:test` is allowed to migrate.
 *
 * In its own side-effect-free module, for the reason backup-tables.mts spells
 * out: the script that uses this RUNS on import, so a test that needed the
 * logic would have to run a migration to reach it. Rules that decide whether
 * something dangerous may happen must be callable without doing the dangerous
 * thing.
 *
 * This is STRICTER than `requireTestDatabase` on its own, deliberately. That
 * guard is shared with the Playwright suite and `test-account.mts`, and it
 * makes two concessions this path must not inherit:
 *
 *   1. It FALLS BACK to DATABASE_URL when E2E_DATABASE_URL is unset, so a
 *      machine with only a test database needs no extra configuration. Here
 *      that fallback is the exact accident to prevent: `pnpm db:migrate` for
 *      production already exists, and a QA command that quietly migrates
 *      production when a variable is missing is worse than one that does not
 *      exist.
 *
 *   2. It honours GOHA_ALLOW_DESTRUCTIVE=yes-i-am-sure. That override is a
 *      reasonable escape hatch for emptying a scratch account; it is not a
 *      reasonable way to apply schema changes to an unknown database. This
 *      path refuses it outright.
 *
 * Fails closed: every path out of this function is either a validated URL or a
 * thrown error. There is no permissive default and no "best effort" branch.
 */

/** Set to this exact value, the shared guard would wave anything through. */
const OVERRIDE_KEY = "GOHA_ALLOW_DESTRUCTIVE";

export type QaMigrationTarget = {
  /** The connection string that was checked, and the one to migrate. */
  url: string;
  /** Always "E2E_DATABASE_URL" here; kept so callers can report it. */
  source: TestDbVerdict["source"];
};

/**
 * The URL to migrate, or a thrown error explaining why nothing will happen.
 *
 * No value from the environment is ever included in a message. The operator
 * knows which variable they set; printing what is in it is how a connection
 * string ends up in a terminal log or a pasted screenshot.
 */
export function resolveQaMigrationTarget(
  env: NodeJS.ProcessEnv = process.env,
): QaMigrationTarget {
  const configured = env.E2E_DATABASE_URL?.trim();

  if (!configured) {
    throw new Error(
      "pnpm db:migrate:test needs E2E_DATABASE_URL and it is not set.\n" +
        "\n" +
        "It deliberately does NOT fall back to DATABASE_URL. That variable is\n" +
        "production, and `pnpm db:migrate` is the command for it.\n" +
        "\n" +
        'Point E2E_DATABASE_URL at a database whose name contains "goha_test".',
    );
  }

  if (env[OVERRIDE_KEY]) {
    throw new Error(
      `pnpm db:migrate:test does not accept ${OVERRIDE_KEY}.\n` +
        "\n" +
        "That override exists so destructive test tooling can be aimed at an\n" +
        "unmarked database on purpose. Applying migrations to a database nobody\n" +
        "has marked as disposable is not a case it was meant to cover.\n" +
        "\n" +
        `Unset ${OVERRIDE_KEY}, or use \`pnpm db:migrate\` if you really mean\n` +
        "to migrate the database DATABASE_URL points at.",
    );
  }

  /*
   * The shared marker check. Called with the override already refused above, so
   * it can only ever return `allowedBy: "marker"` from here; both assertions
   * below are belt and braces against the guard changing under us.
   */
  const verdict = requireTestDatabase("pnpm db:migrate:test");

  if (verdict.source !== "E2E_DATABASE_URL") {
    throw new Error(
      "pnpm db:migrate:test resolved a database from " +
        `${verdict.source} rather than E2E_DATABASE_URL, so it is refusing.\n` +
        "This command migrates the test database and nothing else.",
    );
  }

  if (verdict.allowedBy !== "marker") {
    throw new Error(
      "pnpm db:migrate:test requires a database marked as a test database.\n" +
        `It was permitted by "${verdict.allowedBy}", which this path does not accept.`,
    );
  }

  /*
   * Return the string the GUARD checked, never a fresh read of the environment.
   * Re-reading would leave a window in which the value could differ from the
   * one that was validated, which is the whole reason `requireTestDatabase`
   * hands its caller a URL instead of just a yes.
   */
  return { url: verdict.url, source: verdict.source };
}
