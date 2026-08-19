import "server-only";

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

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

export type ReviewDraftFields = {
  wins?: string | null;
  challenges?: string | null;
  focusNextWeek?: string | null;
};

/**
 * Fill empty review fields in one database statement.
 *
 * The AI round trip can take seconds. A read followed by a normal upsert can
 * overwrite prose the user wrote between those two operations. The conditional
 * expressions below inspect each field at the instant of the write and leave
 * every non-empty value untouched. A completed review is never updated.
 */
export async function fillEmptyReviewDraft(
  userId: string,
  weekStart: IsoDate,
  input: ReviewDraftFields,
): Promise<{ review: WeeklyReview; written: Array<keyof ReviewDraftFields> } | null> {
  const desired = {
    wins: input.wins ?? null,
    challenges: input.challenges ?? null,
    focusNextWeek: input.focusNextWeek ?? null,
  };

  const [row] = await db
    .insert(weeklyReviews)
    .values({ userId, weekStart, ...desired })
    .onConflictDoUpdate({
      target: [weeklyReviews.userId, weeklyReviews.weekStart],
      set: {
        wins: desired.wins
          ? sql`case when nullif(btrim(${weeklyReviews.wins}), '') is null then ${desired.wins} else ${weeklyReviews.wins} end`
          : sql`${weeklyReviews.wins}`,
        challenges: desired.challenges
          ? sql`case when nullif(btrim(${weeklyReviews.challenges}), '') is null then ${desired.challenges} else ${weeklyReviews.challenges} end`
          : sql`${weeklyReviews.challenges}`,
        focusNextWeek: desired.focusNextWeek
          ? sql`case when nullif(btrim(${weeklyReviews.focusNextWeek}), '') is null then ${desired.focusNextWeek} else ${weeklyReviews.focusNextWeek} end`
          : sql`${weeklyReviews.focusNextWeek}`,
        updatedAt: new Date(),
      },
      setWhere: isNull(weeklyReviews.completedAt),
    })
    .returning();

  // `DO UPDATE ... WHERE completed_at IS NULL` returns no row when the review
  // was completed. Return its current state with no written fields so callers
  // can explain the skip without attempting another write.
  const review = row ?? (await getWeeklyReview(userId, weekStart));
  if (!review) return null;
  if (!row) return { review, written: [] };

  const fields = ["wins", "challenges", "focusNextWeek"] as const;
  return {
    review,
    written: fields.filter((field) => desired[field] !== null && review[field] === desired[field]),
  };
}

/** Reopen an existing completed review. Never creates a new empty week row. */
export async function reopenWeeklyReview(
  userId: string,
  weekStart: IsoDate,
): Promise<WeeklyReview | null> {
  const [row] = await db
    .update(weeklyReviews)
    .set({ completedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(weeklyReviews.userId, userId),
        eq(weeklyReviews.weekStart, weekStart),
        isNotNull(weeklyReviews.completedAt),
      ),
    )
    .returning();
  return row ?? null;
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
