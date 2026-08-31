import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

import { loadEnv } from "./lib/env.mts";
import { resolveQaMigrationTarget } from "./lib/qa-migration-target.mts";

/**
 * Apply the generated migrations to the TEST database. `pnpm db:migrate:test`.
 *
 * The sibling of `db/migrate.mts`, which migrates DATABASE_URL and is left
 * exactly as it was. The difference is which variable each one reads and how
 * hard it is to point at the wrong thing:
 *
 *   pnpm db:migrate        -> DATABASE_URL, unguarded, production
 *   pnpm db:migrate:test   -> E2E_DATABASE_URL, guarded, must be marked
 *
 * Before this existed, migrating a QA branch meant `DATABASE_URL=... pnpm
 * db:migrate` or hand-editing .env.local and remembering to put it back. Both
 * are the mistake the test-database guard was written to catch, performed by
 * hand against the one command that had no guard at all.
 *
 * Every decision about WHETHER to run lives in `lib/qa-migration-target.mts`
 * so it can be tested without a database. This file only does the work.
 */
loadEnv();

// Throws, loudly and specifically, on anything unproven. Nothing below runs
// unless the target is a marked test database named by E2E_DATABASE_URL.
const target = resolveQaMigrationTarget();

// Identity only, so the operator can see WHICH database is about to change
// without the credentials that reach it appearing in a terminal.
const parsed = new URL(target.url);
console.log(`Target   : ${parsed.pathname.replace(/^\//, "")}`);
console.log(`Endpoint : ${parsed.hostname.split(".")[0].replace(/-pooler$/, "")}`);
console.log(`Source   : ${target.source} (guard: marked test database)`);

const db = drizzle(neon(target.url));

await migrate(db, { migrationsFolder: "./db/migrations" });
console.log("\n✓ Migrations applied to the TEST database.");
