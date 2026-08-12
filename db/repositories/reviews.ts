import "server-only";

import { and, desc, eq } from "drizzle-orm";

import type { IsoDate } from "@/lib/date";
import { db } from "../client";
import { weeklyReviews } from "../schema";
import type { WeeklyReview } from "../types";

/**
 * Weekly reviews repository. User-scoped throughout.
 *
 * A review is the only thing the Review screen persists; its statistics stay
 * derived from tasks, habits and focus sessions on read (CLAUDE.md section 7).
 */

export type WeeklyReviewInput = {
  wins?: string | null;
  challenges?: string | null;
  focusNextWeek?: string | null;
  rating?: number | null;
  completedAt?: Date | null;
};

export async function getWeeklyReview(
  userId: string,
  weekStart: IsoDate,
): Promise<WeeklyReview | null> {
  const [row] = await db
    .select()
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.userId, userId), eq(weeklyReviews.weekStart, weekStart)))
    .limit(1);
  return row ?? null;
}

/**
 * Create or update the review for a week.
 *
 * The unique (user_id, week_start) constraint makes this a true upsert, so
 * autosaving a draft repeatedly edits one row instead of accumulating drafts.
 */
export async function upsertWeeklyReview(
  userId: string,
  weekStart: IsoDate,
  input: WeeklyReviewInput,
): Promise<WeeklyReview> {
  const [row] = await db
    .insert(weeklyReviews)
    .values({ userId, weekStart, ...input })
    .onConflictDoUpdate({
      target: [weeklyReviews.userId, weeklyReviews.weekStart],
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/** Finished reviews, newest first, for the history rail. */
export async function listWeeklyReviews(userId: string, limit = 12): Promise<WeeklyReview[]> {
  return db
    .select()
    .from(weeklyReviews)
    .where(eq(weeklyReviews.userId, userId))
    .orderBy(desc(weeklyReviews.weekStart))
    .limit(limit);
}
