import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { automationScope, notificationKind, quoteSource } from "./enums";

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
 * What an automation has already sent (automation Guide 00, phase A3).
 *
 * Every flow must be assumed to run twice, so each message claims a key before
 * it is delivered and the second caller is told it lost. The automation
 * platform cannot keep that ledger itself: a re-imported workflow starts with
 * empty static data, and it cannot write to the database directly because the
 * automation role is SELECT-only by design.
 *
 * The key is free text rather than (kind, date) because the guides need to
 * dedupe on things that are not days:
 *
 *   morning_brief     brief:morning:{localDate}
 *   deadline          deadline:{taskId}:{dueAtIso}     re-arms when rescheduled
 *   focus_overrun     focus:{sessionId}:overrun        one nudge per session
 *   streak_risk       streak:{habitId}:{localDate}
 *   graveyard         graveyard:{isoWeek}
 *
 * `payload` holds what was actually sent, which is what makes repeat detection
 * possible: the graveyard digest reads back prior payloads to count how many
 * weeks running a task has appeared, by task id rather than by title.
 */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: notificationKind().notNull(),
    /** The claim. Unique per owner; see the scheme above. */
    dedupeKey: text().notNull(),
    /** The owner's LOCAL date this belongs to (CLAUDE.md section 6). */
    localDate: date().notNull(),
    /** Optional subject of the message, e.g. "task" + its id. */
    entityType: text(),
    entityId: uuid(),
    /** What was sent, structured, for repeat detection and for reading back. */
    payload: jsonb().$type<Record<string, unknown>>(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("notification_log_user_dedupe_key_uq").on(t.userId, t.dedupeKey),
    index("notification_log_user_kind_date_idx").on(t.userId, t.kind, t.localDate),
    index("notification_log_user_sent_idx").on(t.userId, t.sentAt),
  ],
);

/**
 * The pool the daily quote is drawn from (automation Guide 00, phase A6).
 *
 * Not user-scoped: it is reference content, the same for anyone, and the
 * owner's preference for which kind to show lives in `user_settings`. Rows are
 * deactivated rather than deleted so a quote that stops landing can come back.
 *
 * `verified` is false for anything generated and must stay false until a human
 * has checked the wording against a real source. Scripture especially: an
 * approximate verse is a wrong verse, and this table is the one place in GoHa
 * where text is shown as authoritative rather than as something the owner typed
 * themselves.
 */
export const dailyQuotes = pgTable(
  "daily_quotes",
  {
    id: primaryId(),
    source: quoteSource().notNull(),
    text: text().notNull(),
    /** "Proverbs 16:3 (WEB)", "Annie Dillard". Null only for anonymous quotes. */
    attribution: text(),
    /** An optional second rendering, e.g. a Tagalog translation. */
    translation: text(),
    /** Free tag; 'rest' is the pool the Sabbath message draws from. */
    theme: text(),
    active: boolean().notNull().default(true),
    /** False until the wording has been checked against a real source. */
    verified: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The seed script upserts on this, so re-running it never duplicates.
    unique("daily_quotes_source_text_uq").on(t.source, t.text),
    index("daily_quotes_active_theme_idx").on(t.active, t.theme),
  ],
);
