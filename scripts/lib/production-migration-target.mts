import { TEST_DB_MARKER } from "./require-test-db.mts";

/**
 * Which database `pnpm db:migrate:production` is allowed to migrate.
 *
 * Side-effect-free, like its QA sibling `qa-migration-target.mts`, so the rules
 * that decide whether something irreversible may happen are testable WITHOUT
 * doing the irreversible thing.
 *
 * `pnpm db:migrate` still exists and still migrates whatever DATABASE_URL says,
 * with no guard at all. That is the command this one replaces for releases: it
 * cannot tell production from anything else, so the only thing standing between
 * a mistyped environment and a live schema change was the operator's attention.
 *
 * The asymmetry with the QA path is deliberate. There, the danger is touching
 * production by accident, so the guard demands a marked TEST database. Here the
 * target IS production, so a marker proves nothing; what has to be proven is
 * INTENT. Hence the confirmation below.
 */

/** The variable that carries the operator's intent. */
export const CONFIRM_KEY = "GOHA_PRODUCTION_MIGRATION";

/** The destructive escape hatch used elsewhere. Never honoured on this path. */
const OVERRIDE_KEY = "GOHA_ALLOW_DESTRUCTIVE";

export type ProductionMigrationTarget = {
  /** The connection string that was checked, and the one to migrate. */
  url: string;
  /** Shown to the operator. Never includes credentials. */
  identity: { database: string; endpoint: string; role: string };
};

/** Neon endpoint id: the "ep-..." label, with any pooler suffix removed. */
export function endpointId(hostname: string): string {
  return hostname.split(".")[0].replace(/-pooler$/, "");
}

/**
 * The URL to migrate, or a thrown error explaining why nothing will happen.
 *
 * Every branch out of here is a validated target or an exception. No permissive
 * default, no "best effort", no partial success.
 *
 * Messages never contain the connection string. The operator knows what they
 * set; printing it is how a password ends up in a terminal log or a screenshot.
 */
export function resolveProductionMigrationTarget(
  env: NodeJS.ProcessEnv = process.env,
): ProductionMigrationTarget {
  const configured = env.DATABASE_URL?.trim();

  if (!configured) {
    throw new Error(
      "pnpm db:migrate:production needs DATABASE_URL and it is not set.\n" +
        "\n" +
        "It deliberately does NOT fall back to E2E_DATABASE_URL. That variable is\n" +
        "the QA database, and `pnpm db:migrate:test` is the command for it.",
    );
  }

  if (env[OVERRIDE_KEY]) {
    throw new Error(
      `pnpm db:migrate:production does not accept ${OVERRIDE_KEY}.\n` +
        "\n" +
        "That override exists so destructive TEST tooling can be aimed at an\n" +
        "unmarked database on purpose. It has no meaning here, and honouring it\n" +
        "would turn a deliberate confirmation into a habit.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(
      "pnpm db:migrate:production could not parse DATABASE_URL as a URL, so it\n" +
        "cannot identify the target. Refusing to continue.",
    );
  }

  const database = parsed.pathname.replace(/^\//, "");
  const endpoint = endpointId(parsed.hostname);
  const identity = { database, endpoint, role: parsed.username };

  /*
   * Refuse anything that looks like the QA database, two ways.
   *
   * The marker check catches the database this project actually uses for QA.
   * The identity check catches the subtler mistake: DATABASE_URL having been
   * pointed at the QA branch for a local run and never put back. Migrating QA
   * through the production command would "succeed" and leave production
   * untouched while reporting a release had shipped.
   */
  if (parsed.hostname.includes(TEST_DB_MARKER) || database.includes(TEST_DB_MARKER)) {
    throw new Error(
      `pnpm db:migrate:production refuses: DATABASE_URL is marked "${TEST_DB_MARKER}".\n` +
        "\n" +
        "That is a TEST database. Use `pnpm db:migrate:test` for it.",
    );
  }

  const qa = env.E2E_DATABASE_URL?.trim();
  if (qa) {
    if (qa === configured) {
      throw new Error(
        "pnpm db:migrate:production refuses: DATABASE_URL and E2E_DATABASE_URL are\n" +
          "the same connection string, so the target is the QA database.",
      );
    }
    try {
      const qaUrl = new URL(qa);
      if (endpointId(qaUrl.hostname) === endpoint && qaUrl.pathname === parsed.pathname) {
        throw new Error(
          "pnpm db:migrate:production refuses: DATABASE_URL points at the same\n" +
            "endpoint and database as E2E_DATABASE_URL, so the target is the QA\n" +
            "database rather than production.",
        );
      }
    } catch (error) {
      // A malformed E2E_DATABASE_URL is not a reason to block a release, but a
      // refusal raised just above IS: re-throw ours, swallow only parse noise.
      if (error instanceof Error && error.message.includes("refuses")) throw error;
    }
  }

  /*
   * The confirmation.
   *
   * It must be impossible to satisfy by habit, so it is not a boolean and not a
   * fixed phrase: it is the ENDPOINT ID of the database about to be migrated.
   * A fixed value like "yes" ends up in a shell history and then in a runbook,
   * and stops being a decision. This cannot be pasted from a previous project,
   * cannot be typed from memory, and cannot survive DATABASE_URL being changed
   * underneath it, because it is checked against the target that was actually
   * resolved.
   *
   * An environment variable rather than an interactive prompt, deliberately:
   * releases run from CI and from non-interactive shells, where a prompt reads
   * EOF and either hangs or silently proceeds. This works identically in both,
   * and stays greppable in a deploy log.
   */
  const confirmation = env[CONFIRM_KEY]?.trim();
  if (!confirmation) {
    throw new Error(
      `pnpm db:migrate:production needs an explicit confirmation.\n` +
        "\n" +
        `  Target database : ${database}\n` +
        `  Target endpoint : ${endpoint}\n` +
        `  Target role     : ${identity.role}\n` +
        "\n" +
        "If that is the database you mean to migrate, re-run with:\n" +
        "\n" +
        `  ${CONFIRM_KEY}=${endpoint} pnpm db:migrate:production\n` +
        "\n" +
        "The value is the endpoint id above, so the confirmation names the exact\n" +
        "database it applies to and cannot be reused for a different one.",
    );
  }

  if (confirmation !== endpoint) {
    throw new Error(
      `pnpm db:migrate:production refuses: ${CONFIRM_KEY} does not match the target.\n` +
        "\n" +
        `  Target endpoint : ${endpoint}\n` +
        `  You confirmed   : ${confirmation}\n` +
        "\n" +
        "Either DATABASE_URL is not the database you thought it was, or the\n" +
        "confirmation was carried over from another one. Both are worth stopping\n" +
        "for. Nothing has been migrated.",
    );
  }

  /*
   * The string the checks ran against, never a fresh read. Re-reading would
   * leave a window in which the migrated URL differed from the validated one.
   */
  return { url: configured, identity };
}
