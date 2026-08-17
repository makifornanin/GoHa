import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { hashPassword } from "better-auth/crypto";

import { requireTestDatabase } from "./lib/require-test-db.mts";

/**
 * Creates (or removes) an ISOLATED end-to-end test account.
 *
 * Why this exists: GoHa is single-owner, so Better Auth's `user.create.before`
 * hook refuses new sign-ups and the Playwright suite cannot bootstrap its own
 * account. Inserting the row directly (with a correctly hashed password, so the
 * normal login flow still does the real work) gives the tests a clean,
 * user-scoped account whose data never mixes with the owner's.
 *
 *   pnpm test:account:create   -> create the account
 *   pnpm test:account:reset    -> empty its content, keep the account
 *   pnpm test:account:destroy  -> delete it and everything it owns (cascade)
 *
 * Every mode writes, and `destroy` cascades, so the whole script is gated by
 * `requireTestDatabase()` below: it refuses to run unless DATABASE_URL is
 * visibly a test database (audit R-02). Credentials default to the local
 * harness constants and can be overridden with E2E_EMAIL / E2E_PASSWORD /
 * E2E_NAME, which is what e2e/auth.setup.ts already reads, so the two stay in
 * step when a different account is used.
 */
function loadEnv(file: string) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(".env.local");

/**
 * Refuse to touch anything unless the target is a test database. Runs before
 * the client is constructed, so a blocked invocation never opens a connection.
 */
requireTestDatabase("pnpm test:account:*");

const sql = neon(process.env.DATABASE_URL!);

/**
 * Harness identity. The defaults are local, non-secret test constants shared
 * with e2e/auth.setup.ts; the env overrides let a different database use a
 * different account without editing either file.
 */
export const TEST_EMAIL = process.env.E2E_EMAIL ?? "e2e.harness@goha.test";
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "goha-e2e-harness-pw";
const TEST_NAME = process.env.E2E_NAME ?? "E2E Harness";

const mode = process.argv[2];

/**
 * Tables to clear on `reset`, parents first so children cascade.
 *
 * `user`, `account` and `session` are deliberately absent: wiping them would
 * invalidate the saved Playwright storage state and force a re-login mid-suite.
 * `user_settings` IS cleared, because the repository recreates it on demand with
 * defaults, and a suite that changes the timezone must not inherit the previous
 * run's value.
 */
const DOMAIN_TABLES = [
  "task_maps",
  "focus_sessions",
  "daily_priorities",
  "brain_dump_items",
  "weekly_reviews",
  "habits",
  "tasks",
  "goals",
  "life_areas",
  "user_settings",
] as const;

if (mode === "destroy") {
  const rows = await sql`delete from "user" where email = ${TEST_EMAIL} returning id`;
  console.log(
    rows.length > 0
      ? `Removed test account (${rows.length} user row, cascade deleted its data).`
      : "No test account present.",
  );
} else if (mode === "reset") {
  // Empty the account's content but keep the account and its session, so a
  // suite that seeds fixed names ("Health & Fitness", "Morning meditation") can
  // run twice in a row without tripping over its own leftovers.
  const [user] = await sql`select id from "user" where email = ${TEST_EMAIL}`;
  if (!user) {
    console.log("No test account present; nothing to reset.");
  } else {
    let total = 0;
    for (const table of DOMAIN_TABLES) {
      // Table names come from the constant above, never from input. Neon's
      // `sql` is tagged-template only, so a dynamic table name needs `sql.query`.
      const rows = await sql.query(`delete from "${table}" where user_id = $1 returning id`, [
        user.id,
      ]);
      total += rows.length;
    }
    // The display name lives on the `user` row, which must survive the wipe, so
    // it is restored rather than deleted. Without this, a suite that saves a
    // fixed name found the field already holding it, left the form clean, and
    // sat waiting on a Save button that correctly stayed disabled.
    await sql`update "user" set name = ${TEST_NAME}, updated_at = now() where id = ${user.id}`;
    console.log(
      `Reset test account content: ${total} row(s) removed across ${DOMAIN_TABLES.length} tables; display name restored to "${TEST_NAME}".`,
    );
  }
} else {
  const existing = await sql`select id from "user" where email = ${TEST_EMAIL}`;
  if (existing.length > 0) {
    console.log("Test account already exists.");
  } else {
    const userId = randomUUID();
    const hash = await hashPassword(TEST_PASSWORD);

    await sql`
      insert into "user" (id, name, email, email_verified, created_at, updated_at)
      values (${userId}, ${TEST_NAME}, ${TEST_EMAIL}, true, now(), now())
    `;
    await sql`
      insert into "account" (id, account_id, provider_id, user_id, password, created_at, updated_at)
      values (${randomUUID()}, ${userId}, 'credential', ${userId}, ${hash}, now(), now())
    `;
    console.log("Created isolated test account.");
  }

  /*
   * Structural confirmation only.
   *
   * This used to print every address in the `user` table, which put the
   * owner's real email into terminal output, CI logs and any screenshot of
   * them (audit R-21). The useful signal was never the addresses; it was
   * "did I just add a second account to something that should have one".
   * A count answers that without disclosing anything.
   */
  const [{ n }] = await sql`select count(*)::int as n from "user"`;
  console.log(`accounts present: ${n}`);
}
