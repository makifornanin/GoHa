"use server";

import { revalidatePath } from "next/cache";

import { inspirationsRepo } from "@/db";
import type { InspirationTakeaway } from "@/db";
import { getDailyInspiration } from "@/lib/inspiration/daily";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";
import { zonedToday } from "@/lib/date";
import { takeawayBodySchema } from "@/lib/validations/takeaway";

/*
 * A `"use server"` module may export ONLY async functions, so the limit and the
 * schema live in `lib/validations/takeaway.ts`. They have to be client-readable
 * anyway: the composer counts characters as they are typed.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Save what today's inspiration meant to this reader.
 *
 * Three things are deliberately NOT parameters: the user, the date, and which
 * inspiration this responds to.
 *
 *   - The user comes from the session, like everywhere else.
 *   - The DATE is resolved from the caller's saved timezone here on the server,
 *     not sent by the client. A browser that has travelled, or a tab left open
 *     past midnight, would otherwise file a note under the wrong day, and the
 *     unique constraint would then reject the real one.
 *   - The INSPIRATION is read through `getDailyInspiration`, the single
 *     canonical resolver. That guarantees a takeaway is attached to the record
 *     the user was actually shown rather than to an id they could name.
 *
 * The text itself is stored VERBATIM. It is the one thing in GoHa that is
 * purely the user's own writing, and nothing here rewrites, summarises, or
 * improves it (CLAUDE.md section 10).
 */
export async function saveTakeawayAction(
  body: string,
): Promise<ActionResult<{ takeaway: InspirationTakeaway | null }>> {
  const user = await requireUser();

  const parsed = takeawayBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That could not be saved." };
  }

  const { timeZone } = await getUserDatePrefs(user.id);
  const localDate = zonedToday(new Date(), timeZone);

  try {
    // Clearing the field means "no takeaway today", which is a deletion rather
    // than an empty row: one representation of nothing instead of two.
    if (parsed.data.length === 0) {
      await inspirationsRepo.deleteTakeaway(user.id, localDate);
      revalidatePath("/today");
      return { ok: true, data: { takeaway: null } };
    }

    const inspiration = await getDailyInspiration(user.id, localDate);
    const takeaway = await inspirationsRepo.upsertTakeaway({
      userId: user.id,
      inspirationId: inspiration.id,
      localDate,
      body: parsed.data,
    });

    revalidatePath("/today");
    return { ok: true, data: { takeaway } };
  } catch (error) {
    console.error("saveTakeawayAction failed", error);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }
}
