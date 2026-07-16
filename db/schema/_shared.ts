import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Shared column builders used across every table so the identifier and audit
 * conventions from CLAUDE.md (sections 6 and 8) live in exactly one place.
 *
 * Column names are intentionally left unnamed: the Drizzle client and Drizzle
 * Kit are both configured with `casing: "snake_case"`, so the camelCase
 * TypeScript keys become snake_case Postgres columns automatically.
 */

/** Consistent UUID primary key: `id uuid primary key default gen_random_uuid()`. */
export function primaryId() {
  return uuid().primaryKey().defaultRandom();
}

/**
 * Audit timestamps as real instants (TIMESTAMPTZ). `updatedAt` also bumps on
 * every Drizzle-level update via `$onUpdate`. These are true points in time and
 * must never be truncated to derive a local calendar date (use `lib/date.ts`).
 */
export const auditTimestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
