/**
 * The single data-access seam. Server code imports from `@/db`:
 *
 *   import { tasksRepo, type Task } from "@/db";
 *
 * This module pulls in the server-only client, so it must only be imported from
 * server components, Server Actions, and route handlers. Client components that
 * need row shapes should `import type { Task } from "@/db/types"` instead.
 *
 * The raw Drizzle `db` handle and `schema` are exported for the auth layer and
 * migrations; feature code should prefer the repositories.
 */
export * from "./repositories";
export * from "./types";
export { db, getDb, type Database } from "./client";
export * as schema from "./schema";
