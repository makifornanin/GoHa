import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

import { loadEnv } from "./lib/env.mts";
import { resolveProductionMigrationTarget } from "./lib/production-migration-target.mts";

/**
 * Apply the generated migrations to PRODUCTION. `pnpm db:migrate:production`.
 *
 * The release command. Its two siblings:
 *
 *   pnpm db:migrate              -> DATABASE_URL, unguarded.   NOT FOR RELEASES.
 *   pnpm db:migrate:test         -> E2E_DATABASE_URL, must be a marked test db.
 *   pnpm db:migrate:production   -> DATABASE_URL, must be confirmed by name.
 *
 * `db:migrate` is kept because older notes and scripts reference it, but it
 * cannot tell production from a QA branch and asks nothing before changing a
 * live schema. Use this instead: it identifies the target out loud and refuses
 * to proceed until the operator names that exact database back to it.
 *
 * Every decision about WHETHER to run lives in `lib/production-migration-target.mts`
 * so it is testable without migrating anything. This file only does the work.
 */
loadEnv();

// Throws, with the target spelled out, on anything unproven. Nothing below runs
// unless DATABASE_URL is a non-QA database the operator has confirmed by name.
const target = resolveProductionMigrationTarget();

console.log("Migrating PRODUCTION");
console.log(`  database : ${target.identity.database}`);
console.log(`  endpoint : ${target.identity.endpoint}`);
console.log(`  role     : ${target.identity.role}`);
console.log("");

const db = drizzle(neon(target.url));

await migrate(db, { migrationsFolder: "./db/migrations" });
console.log("\n✓ Migrations applied to PRODUCTION.");
