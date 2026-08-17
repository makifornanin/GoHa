"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { settingsRepo } from "@/db";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import {
  automationPrefsSchema,
  displayNameSchema,
  preferencesSchema,
  rhythmSchema,
  themeSchema,
  type AutomationPrefsInput,
  type PreferencesInput,
  type RhythmInput,
  type ThemeValue,
} from "@/lib/validations/settings";

export type ActionResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Update the owner's display name via Better Auth (identity from the session). */
export async function updateProfileAction(name: string): Promise<ActionResult> {
  await requireUser();
  const parsed = displayNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  try {
    // Better Auth derives the user from the session cookies; it only ever
    // updates the caller's own account.
    await auth.api.updateUser({ headers: await headers(), body: { name: parsed.data } });
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("updateProfileAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Persist the appearance preference. next-themes applies it live on the client. */
export async function updateThemeAction(theme: ThemeValue): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) return { ok: false, error: "That theme is not available." };

  try {
    await settingsRepo.updateUserSettings(user.id, { theme: parsed.data });
    return { ok: true };
  } catch (error) {
    console.error("updateThemeAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Persist the daily rhythm times.
 *
 * The app does not deliver anything from these (push and email are out of
 * scope, CLAUDE.md section 2). They are stated intentions the app reflects back
 * on Today, and a stable place an external automation can read from.
 */
export async function updateRhythmAction(input: RhythmInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = rhythmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  try {
    await settingsRepo.updateUserSettings(user.id, {
      dailyPlanningTime: parsed.data.dailyPlanningTime,
      eveningReflectionTime: parsed.data.eveningReflectionTime,
    });
    revalidatePath("/settings");
    revalidatePath("/today");
    return { ok: true };
  } catch (error) {
    console.error("updateRhythmAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Persist timezone + week start; both drive date-derived views across the app. */
export async function updatePreferencesAction(input: PreferencesInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  try {
    await settingsRepo.updateUserSettings(user.id, {
      timezone: parsed.data.timezone,
      weekStartsOn: parsed.data.weekStartsOn,
    });
    // Every "today"/week view re-derives from these, so refresh the shell tree.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("updatePreferencesAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Persist the automation preferences.
 *
 * Unlike the rhythm times, these are enforced: `morningBriefEnabled` off means
 * `/api/automation/brief/morning` returns a silent response, and a Sabbath day
 * makes every work endpoint go quiet on that weekday. The switch does the thing
 * it says (automation Guide 00, phase B).
 */
export async function updateAutomationPrefsAction(
  input: AutomationPrefsInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = automationPrefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  try {
    await settingsRepo.updateUserSettings(user.id, parsed.data);
    revalidatePath("/settings");
    revalidatePath("/today");
    return { ok: true };
  } catch (error) {
    console.error("updateAutomationPrefsAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
