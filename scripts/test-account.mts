import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { hashPassword } from "better-auth/crypto";

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
 *   pnpm test:account:destroy  -> delete it and everything it owns (cascade)
 *
 * The password is a local, non-secret test constant and never touches the
 * owner's credentials.
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

const sql = neon(process.env.DATABASE_URL!);

export const TEST_EMAIL = "e2e.harness@goha.test";
export const TEST_PASSWORD = "goha-e2e-harness-pw";
const TEST_NAME = "E2E Harness";

const mode = process.argv[2];

if (mode === "destroy") {
  const rows = await sql`delete from "user" where email = ${TEST_EMAIL} returning id`;
  console.log(
    rows.length > 0
      ? `Removed test account (${rows.length} user row, cascade deleted its data).`
      : "No test account present.",
  );
} else {
  const existing = await sql`select id from "user" where email = ${TEST_EMAIL}`;
  if (existing.length > 0) {
    console.log("Test account already exists:", TEST_EMAIL);
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
    console.log("Created isolated test account:", TEST_EMAIL);
  }

  // Confirm the owner account is untouched.
  const users = await sql`select email from "user" order by created_at`;
  console.log("accounts now present:", users.map((u) => u.email).join(", "));
}
