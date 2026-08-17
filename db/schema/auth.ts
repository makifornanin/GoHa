import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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
    /*
     * The single-owner index is GONE, on purpose (migration 0014).
     *
     * `user_single_owner_uq` permitted exactly one row here, which was right
     * while GoHa was one person's private system. The owner now shares it, so
     * the constraint that made that impossible had to go.
     *
     * What replaces it is not nothing: sign-up requires an invitation the owner
     * issues (see `invites` below and the auth route handler). The difference is
     * that the limit is now a policy the owner controls rather than a wall in
     * the schema.
     *
     * Everything downstream was already built for this. Every domain table is
     * user-scoped with a cascading FK, and every repository filters by the
     * session user id, so a second account sees its own data and nothing else.
     * That was the point of keeping the scoping even when there was one user
     * (CLAUDE.md section 1).
     */
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

/**
 * Invitations to create an account.
 *
 * GoHa is deployed on the public internet, so "anyone may register" would mean
 * anyone at all: strangers creating accounts in the owner's database, on the
 * owner's Neon bill. An invitation is barely more friction for the person being
 * invited and closes the door to everyone else.
 *
 * The code is stored as a SHA-256 hash, exactly like an automation token: the
 * link is shown once, on creation, and a leaked database dump does not hand
 * anyone a working invitation.
 *
 * Single use by construction. `claimedAt` is set by an atomic conditional
 * update BEFORE the account is created, so two people opening the same link at
 * the same moment cannot both get in; the loser is told the invitation is
 * already used. If the sign-up then fails, the claim is released.
 */
export const invites = pgTable(
  "invites",
  {
    id: primaryId(),
    /** Who issued it. Their invitations disappear with them. */
    invitedBy: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeHash: text().notNull(),
    /** Leading characters, so the owner can recognise one in the list. */
    codePrefix: text().notNull(),
    /**
     * Optional lock to one address. When set, the sign-up email must match, so
     * a forwarded link cannot be used by someone the owner did not mean.
     */
    email: text(),
    /** A note to the owner: "for Nanin". Never shown to the invitee. */
    label: text(),
    expiresAt: timestamp({ withTimezone: true }),
    /** Held while a sign-up is in flight, and permanently once it succeeds. */
    claimedAt: timestamp({ withTimezone: true }),
    /** The account it produced, once there is one. */
    acceptedBy: uuid().references(() => user.id, { onDelete: "set null" }),
    acceptedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    ...auditTimestamps,
  },
  (t) => [
    unique("invites_code_hash_uq").on(t.codeHash),
    index("invites_code_prefix_idx").on(t.codePrefix),
    index("invites_invited_by_idx").on(t.invitedBy),
  ],
);
