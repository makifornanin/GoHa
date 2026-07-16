import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

/**
 * Applies the generated SQL migrations in `db/migrations` to the database in
 * `DATABASE_URL`. Uses Neon's HTTP driver (the same one the app uses), which
 * connects over plain HTTPS and does not require a WebSocket, so it runs
 * reliably from the CLI. Invoked by `pnpm db:migrate`.
 *
 * Reads `.env.local` then `.env` (Next.js loads these at runtime; the CLI does
 * not). Lines are parsed raw, so connection strings containing `&` are safe, and
 * no secret value is ever printed.
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

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
}

const db = drizzle(neon(url));

await migrate(db, { migrationsFolder: "./db/migrations" });
console.log("✓ Migrations applied to the database.");
