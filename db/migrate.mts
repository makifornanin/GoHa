import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

import { loadEnv, requireEnv } from "../scripts/lib/env.mts";

/**
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
