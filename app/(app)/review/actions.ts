"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { reviewsRepo, type WeeklyReview } from "@/db";
import { startOfWeek } from "@/lib/date";
import { REVIEW_FIELD_MAX } from "@/lib/review";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Validation for a weekly review (CLAUDE.md section 5: Zod at every boundary).
 * `weekStart` is a local calendar date; blank prose normalises to null so an
 * emptied field clears rather than storing "".
 */
const prose = z
  .string()
  .trim()
  .max(REVIEW_FIELD_MAX, `Keep it under ${REVIEW_FIELD_MAX} characters.`)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const reviewSchema = z.object({
  weekStart: z.iso.date("That week could not be found."),
  wins: prose,
  challenges: prose,
  focusNextWeek: prose,
  rating: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullish()
    .transform((v) => v ?? null),
});

export type ReviewInput = z.input<typeof reviewSchema>;

/**
 * Save (or update) the review for a week.
 *
 * Upsert-on-(user, week), so autosaving a draft edits one row instead of
 * accumulating drafts. `complete` stamps `completedAt`; leaving it off keeps
 * the review a draft the user can come back to.
 */
export async function saveWeeklyReviewAction(
  input: ReviewInput,
  complete = false,
): Promise<ActionResult<WeeklyReview>> {
  const user = await requireUser();

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your review." };
  }
  const { weekStart, ...fields } = parsed.data;

  /*
   * The posted week must actually BE a week boundary (audit R-05).
   *
   * `weekly_reviews` is unique on (user_id, week_start), so the value is a
   * primary key in all but name: a mid-week date silently creates a second,
   * overlapping row for the same seven days, and both then show up in history
   * with different prose. Zod can only prove the string is a date; only the
   * user's own week-start preference can say whether it is a Monday.
   *
   * Checked server-side because the client can be wrong about it: an old tab
   * open when the preference changes still posts the previous boundary.
   */
  const { weekStartsOn } = await getUserDatePrefs(user.id);
  if (startOfWeek(weekStart, weekStartsOn) !== weekStart) {
    return {
      ok: false,
      error: "That is not the start of a week. Reload the page and try again.",
    };
  }

  try {
    const review = await reviewsRepo.upsertWeeklyReview(user.id, weekStart, {
      ...fields,
      ...(complete ? { completedAt: new Date() } : {}),
    });
    revalidatePath("/review");
    return { ok: true, data: review };
  } catch (error) {
    console.error("saveWeeklyReviewAction failed", error);
    return { ok: false, error: "Could not save your review. Please try again." };
  }
}

/** Reopen a finished review so it can be edited again. */
export async function reopenWeeklyReviewAction(
  weekStart: string,
): Promise<ActionResult<WeeklyReview>> {
  const user = await requireUser();
  const parsed = z.iso.date().safeParse(weekStart);
  if (!parsed.success) return { ok: false, error: "That week could not be found." };

  try {
    const review = await reviewsRepo.upsertWeeklyReview(user.id, parsed.data, {
      completedAt: null,
    });
    revalidatePath("/review");
    return { ok: true, data: review };
  } catch (error) {
    console.error("reopenWeeklyReviewAction failed", error);
    return { ok: false, error: "Could not reopen that review. Please try again." };
  }
}
