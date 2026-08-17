import { requireTestDatabase } from "../scripts/lib/require-test-db.mts";

/**
 * Playwright global setup: the test-database guard (audit R-02, CRITICAL).
 *
 * The suite is destructive by design. `e2e/qa.spec.ts` shells out to
 * `test-account.mts reset`, which empties ten domain tables, and every spec
 * creates and deletes real rows through the app. All of it ran against
 * whichever DATABASE_URL happened to be configured, which on a development
 * machine is the owner's live database.
 *
 * Throwing here aborts the entire run before a single test, and before any
 * fixture or browser starts. The script-side guard in scripts/test-account.mts
 * is the second layer, for when those commands are run directly.
 */
export default function globalSetup(): void {
  requireTestDatabase("The Playwright suite");
}
