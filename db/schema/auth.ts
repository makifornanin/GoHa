import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";

/**
 * Better Auth core tables (email/password). Column keys use the exact field
 * names Better Auth's Drizzle adapter expects; the adapter maps by TypeScript
 * key, so `casing: "snake_case"` safely renames the underlying columns.
 *
 * IDs are UUIDs to stay consistent with the rest of the schema (CLAUDE.md
 * section 8). In Phase 3 the Better Auth config sets
 * `advanced.database.generateId` to emit UUIDs so app-generated and
 * database-default IDs never diverge.
 */
export const user = pgTable(
  "user",
  {
    id: primaryId(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    ...auditTimestamps,
  },
  () => [
    /**
     * Single owner, enforced by the database (audit R-08).
     *
     * `lib/auth.ts` refuses a second account by reading the table and then
     * creating, which two simultaneous sign-ups can both pass. A unique index
     * on a constant expression permits exactly one row in the table, so the
     * second insert loses no matter how the endpoint is reached.
     *
     * This is deliberately one index and nothing else, because GoHa keeps every
     * table user-scoped so multi-user is possible later (CLAUDE.md section 1).
     * Opening that up is one `DROP INDEX`, with no other structural change.
     */
    uniqueIndex("user_single_owner_uq").on(sql`((true))`),
  ],
);

export const session = pgTable(
  "session",
  {
    id: primaryId(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...auditTimestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: primaryId(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    // Better Auth stores the email/password hash here; never a plaintext secret.
    password: text(),
    ...auditTimestamps,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: primaryId(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...auditTimestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
