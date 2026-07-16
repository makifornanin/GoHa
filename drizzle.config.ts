import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "drizzle-kit";

/**
 * Load `.env.local` then `.env` for the Drizzle Kit CLI. Next.js loads these at
 * runtime, but the standalone CLI does not, so `migrate` / `push` / `studio`
 * would otherwise not see `DATABASE_URL`. Lines are read raw (no shell
 * interpretation), so connection strings containing `&` are safe. Existing
 * process env always wins, and no value is ever printed.
 */
function loadEnv(file: string) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");

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
