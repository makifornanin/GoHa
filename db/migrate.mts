import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

import { loadEnv, requireEnv } from "../scripts/lib/env.mts";

/**
 * NOT FOR RELEASES. Use `pnpm db:migrate:production`.
 *
 * This command reads DATABASE_URL and applies migrations to whatever it finds,
 * with no guard and no confirmation. It cannot tell production from a QA branch,
 * so the only thing between a stale environment variable and a live schema
 * change is the operator's attention. It is kept because older notes and
 * scripts reference it, and because it is still the right tool for a scratch
 * database you own outright.
 *
 * The two guarded paths, which is what release and QA work should use:
 *
 *   pnpm db:migrate:test        -> E2E_DATABASE_URL, must be a marked test db
 *   pnpm db:migrate:production  -> DATABASE_URL, must be confirmed by endpoint
 *
 * Applies the generated SQL migrations in `db/migrations` to the database in
 * `DATABASE_URL`. Uses Neon's HTTP driver (the same one the app uses), which
 * connects over plain HTTPS and does not require a WebSocket, so it runs
 * reliably from the CLI. Invoked by `pnpm db:migrate`.
 *
 * Env files come from the one shared CLI reader (audit R-19); no secret value
 * is ever printed.
 */
loadEnv();

const url = requireEnv("DATABASE_URL");

const db = drizzle(neon(url));

await migrate(db, { migrationsFolder: "./db/migrations" });
console.log("✓ Migrations applied to the database.");
