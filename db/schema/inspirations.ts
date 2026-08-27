import { date, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId } from "./_shared";
import { user } from "./auth";

/**
 * What kind of thing today's inspiration is.
 *
 * Deliberately a NEW enum rather than reusing `quote_source` ("quote" |
 * "verse"). The value travels to n8n verbatim as `dailyInspiration.type`, and
 * the agreed wire value there is `bible_verse`. Renaming a value inside the
 * existing enum would mean an ALTER TYPE against live data that the pool tables
 * still depend on, to buy nothing; a separate enum for a separate table costs
 * one CREATE TYPE and keeps the stored value identical to the emitted one, so
 * nothing has to be translated at the boundary and drift there is impossible.
 */
export const inspirationType = pgEnum("inspiration_type", ["quote", "bible_verse"]);

/**
 * The one Daily Inspiration a person is shown on a given local calendar day.
 *
 * This is a LEDGER, not a pool. `daily_quotes` remains the curated pool and is
 * now the local fallback; this table records the single decided answer for a
 * user and a date so that the Today card and the Morning Brief payload cannot
 * disagree. Once a row exists it is never rewritten: re-reading the same day
 * returns the same record for as long as that local date lasts.
 *
 * That is also why the external provider call belongs BEFORE the insert and
 * never after a read. A miss fetches once; every later read that day is a
 * primary-key lookup, so opening Today twenty times does not call QuoteGarden
 * twenty times.
 */
export const dailyInspirations = pgTable(
  "daily_inspirations",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * The user's LOCAL calendar date, as a real DATE (CLAUDE.md section 6).
     *
     * Not derived from `created_at`: a row written at 23:30 in Asia/Manila is
     * 15:30 UTC the same day, and one written at 00:30 Manila is 16:30 UTC the
     * PREVIOUS day. Truncating the instant would file that second row under
     * yesterday and hand the user a second inspiration a few minutes after
     * midnight. The caller resolves the local date and passes it in.
     */
    localDate: date().notNull(),
    type: inspirationType().notNull(),
    text: text().notNull(),
    /** "Marcus Aurelius", or "Philippians 4:13". Always present. */
    source: text().notNull(),
    /** Only meaningful for scripture; "WEB" for the World English Bible. */
    translation: text(),
    /** Which system produced it: quote_garden, bible_api, or goha_fallback. */
    provider: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /*
     * The concurrency guard, and the whole point of the table.
     *
     * Two requests can genuinely race here: the worker materializing a morning
     * job at 06:00 and the owner opening Today at 06:00. Both find no row, both
     * call a provider, and both try to insert. This constraint means exactly one
     * of them wins and the loser reads the winner's row, so the day still has a
     * single answer. Checking-then-inserting in application code would not:
     * both would have checked before either inserted.
     */
    unique("daily_inspirations_user_local_date_uq").on(t.userId, t.localDate),
    /*
     * Serves the recent-history read that keeps content feeling fresh. The
     * lookback walks backwards from today for one user, which is exactly this
     * index's order.
     */
    index("daily_inspirations_user_date_idx").on(t.userId, t.localDate),
  ],
);
