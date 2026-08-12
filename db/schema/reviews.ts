import { check, date, index, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";

/**
 * Weekly reviews: the "Reflect" end of the GoHa chain.
 *
 * The Phase 2 schema listed reflections but never created them, which is why
 * Review had nowhere to save anything. This is the ONLY thing the Review screen
 * stores. Every number it shows (what was completed, what slipped, habit
 * consistency, focus time) stays derived from the canonical records on read
 * (CLAUDE.md section 7); freezing a snapshot here would drift the moment a task
 * was reopened.
 *
 * `weekStart` is the local calendar date the week begins on -> DATE, honouring
 * the user's week-start preference. Unique per (user, week) so writing a review
 * is an idempotent upsert rather than an ever-growing pile of drafts.
 */
export const weeklyReviews = pgTable(
  "weekly_reviews",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekStart: date().notNull(),
    /** What went well. */
    wins: text(),
    /** What got in the way. */
    challenges: text(),
    /** The intention carried into next week. */
    focusNextWeek: text(),
    /** Optional 1-5 self-rating of the week. */
    rating: smallint(),
    /** Set when the user marks the review finished; null while it is a draft. */
    completedAt: timestamp({ withTimezone: true }),
    ...auditTimestamps,
  },
  (t) => [
    unique("weekly_reviews_user_week_uq").on(t.userId, t.weekStart),
    index("weekly_reviews_user_week_idx").on(t.userId, t.weekStart),
    check(
      "weekly_reviews_rating_range",
      sql`${t.rating} is null or (${t.rating} >= 1 and ${t.rating} <= 5)`,
    ),
  ],
);
