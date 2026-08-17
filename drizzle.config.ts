import { defineConfig } from "drizzle-kit";

import { loadEnv } from "./scripts/lib/env.mts";

/**
 * Next.js loads `.env*` itself at runtime, but the standalone Drizzle Kit CLI
 * does not, so `migrate` / `push` / `studio` would not see `DATABASE_URL`.
 * One shared reader for every CLI entry point (audit R-19).
 */
loadEnv();

/**
 * Drizzle Kit configuration.
 *
 * - `schema` points at the single schema barrel so every table is picked up.
 * - `out` keeps generated SQL migrations inside the `db/` seam, tracked in git.
 * - `casing: "snake_case"` lets the schema use camelCase TypeScript identifiers
 *   while emitting snake_case columns in Postgres. This MUST match the `casing`
 *   passed to the Drizzle client in `db/client.ts` so runtime and migrations agree.
 * - `DATABASE_URL` is read from the environment. It is only required for the
 *   `migrate`, `push`, and `studio` commands; `generate` diffs the schema offline
 *   and does not connect to a database.
 */
export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    // Non-null assertion is intentional: the DB commands fail loudly with a clear
    // message if DATABASE_URL is missing, which is the desired behavior.
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
