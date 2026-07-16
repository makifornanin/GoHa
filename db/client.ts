import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

/**
 * The Drizzle database client, backed by Neon's serverless HTTP driver.
 *
 * - `import "server-only"` guarantees this module can never be bundled into a
 *   client component. `DATABASE_URL` therefore stays server-only (CLAUDE.md
 *   section 4) and is never exposed as NEXT_PUBLIC_*.
 * - Initialization is lazy: constructing the client does not open a connection
 *   (Neon HTTP is stateless), and the env var is only read on first use. This
 *   keeps `tsc`, `next build`, and Drizzle Kit's schema diffing working with no
 *   database configured.
 * - `casing: "snake_case"` MUST match drizzle.config.ts so runtime SQL and
 *   generated migrations reference identical column names.
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (see .env.example) before using the database.",
    );
  }
  return drizzle(neon(url), { schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof createDb>;

let instance: Database | null = null;

/** Returns the lazily-initialized singleton client. */
export function getDb(): Database {
  instance ??= createDb();
  return instance;
}

/**
 * Convenience handle so repositories can `import { db }`. Property access is
 * forwarded to the lazily-created client; methods stay bound to it.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const client = getDb();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
