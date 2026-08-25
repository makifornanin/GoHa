"use server";

import { revalidatePath } from "next/cache";

import { settingsRepo } from "@/db";
import { requireUser } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Mark first-login onboarding as seen, for the signed-in account only.
 *
 * There is no input: the only thing this writes is a timestamp, and whose
 * timestamp it is comes from the session rather than from the caller. That is
 * what stops one account from dismissing another's onboarding.
 *
 * Called both when someone finishes the last step and when they choose "Maybe
 * later". A popup that returns on the next login until it is completed is a
 * popup that gets dismissed harder each time; the phone setup it points at is
 * permanently available in Settings, so nothing is lost by taking "later" at
 * face value.
 */
export async function completeOnboardingAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await settingsRepo.completeOnboarding(user.id);
  } catch (error) {
    console.error("failed to complete onboarding", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
