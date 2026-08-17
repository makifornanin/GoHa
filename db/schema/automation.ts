import { date, index, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { automationScope } from "./enums";

/**
 * The automation foundation: the only surface GoHa exposes to the outside.
 *
 * GoHa itself keeps no notification infrastructure, no scheduler, and no
 * third-party integrations (CLAUDE.md section 2). External automations
 * (n8n, Make, Shortcuts) run elsewhere, on someone else's clock, and read
 * through token-authenticated endpoints under `app/api/automation/`.
 *
 * The alternative, which the automation guide starts from, is handing those
 * tools a read-only database role. That works for plain SQL but cannot
 * reproduce the app's own judgement: Today's ranking lives in
 * `lib/today-brain.ts`, and a SQL reimplementation of it drifts from the app
 * the first time the ranking improves. These tables exist so an automation can
 * call the real engine instead of guessing at it.
 */

/**
 * A bearer token belonging to the owner. The secret itself is never stored:
 * only its SHA-256 hash, plus a short prefix so a token can be recognised in
 * the UI without being reconstructable from what is on screen.
 */
export const automationTokens = pgTable(
  "automation_tokens",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** What this token is for, in the owner's words ("n8n morning brief"). */
    name: text().notNull(),
    /** SHA-256 of the secret, hex. Unique so two tokens can never collide. */
    tokenHash: text().notNull(),
    /** First characters of the secret, for display and for the lookup. */
    tokenPrefix: text().notNull(),
    scope: automationScope().notNull().default("read"),
    lastUsedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    /** Revoked rather than deleted, so the request log keeps its subject. */
    revokedAt: timestamp({ withTimezone: true }),
    ...auditTimestamps,
  },
  (t) => [
    unique("automation_tokens_hash_uq").on(t.tokenHash),
    index("automation_tokens_prefix_idx").on(t.tokenPrefix),
    index("automation_tokens_user_id_idx").on(t.userId),
  ],
);

/**
 * Every automation request, answered or refused.
 *
 * Two jobs, both of which need the same rows: it is the audit trail the owner
 * reads in Settings ("what has been calling, and when"), and it is what the
 * rate limiter counts. Counting rows rather than holding a counter in memory
 * means the limit still holds when the app runs as more than one instance,
 * which a per-process map cannot promise.
 */
export const automationRequests = pgTable(
  "automation_requests",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Null once the token is deleted; the request still happened. */
    tokenId: uuid().references(() => automationTokens.id, { onDelete: "set null" }),
    route: text().notNull(),
    status: smallint().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("automation_requests_user_created_idx").on(t.userId, t.createdAt),
    index("automation_requests_token_created_idx").on(t.tokenId, t.createdAt),
  ],
);

/**
 * What an automation has already sent, keyed by (kind, local date).
 *
 * The guide's operating rule is that every flow must be assumed to run twice,
 * so each notification is keyed and skipped if already sent. The automation
 * platform cannot keep that ledger reliably (a re-imported workflow starts with
 * empty static data), and it cannot write to the database directly, because the
 * automation role is SELECT-only by design. So the claim is made here, through
 * one endpoint, and the unique constraint is what makes it a claim rather than
 * a hope: the second caller is told it lost, and sends nothing.
 */
export const automationDeliveries = pgTable(
  "automation_deliveries",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The automation's own name for what it sends, e.g. "morning-brief". */
    kind: text().notNull(),
    /** The LOCAL date the delivery belongs to (CLAUDE.md section 6). */
    deliveryDate: date().notNull(),
    /** Optional note from the sender, for the owner to read back later. */
    detail: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("automation_deliveries_user_kind_date_uq").on(t.userId, t.kind, t.deliveryDate),
    index("automation_deliveries_user_created_idx").on(t.userId, t.createdAt),
  ],
);
