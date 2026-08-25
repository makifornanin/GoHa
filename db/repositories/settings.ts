import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../client";
import { userSettings } from "../schema";
import type { QuoteSourcePref, ThemePreference } from "../schema";
import type { UserSettings } from "../types";

/** User settings repository. One row per user; created on demand with defaults. */

export type UserSettingsInput = {
  timezone?: string;
  theme?: ThemePreference;
  weekStartsOn?: number;
  dailyPlanningTime?: string | null;
  eveningReflectionTime?: string | null;
  notificationsEnabled?: boolean;
  onboardingCompletedAt?: Date | null;
  welcomeEmailSentAt?: Date | null;
  preferences?: Record<string, unknown> | null;
  /* Automation preferences (automation Guide 00, phase A4). */
  morningBriefEnabled?: boolean;
  eveningSummaryEnabled?: boolean;
  deadlineAlertsEnabled?: boolean;
  deadlineLeadMinutes?: number;
  quoteSourcePref?: QuoteSourcePref;
  /** 0=Sunday..6=Saturday, or null for no rest day. */
  sabbathDay?: number | null;
};

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Return the user's settings, creating a defaults row if none exists yet. */
export async function getOrCreateUserSettings(userId: string): Promise<UserSettings> {
  const existing = await getUserSettings(userId);
  if (existing) return existing;
  const [row] = await db
    .insert(userSettings)
    .values({ userId })
    .onConflictDoNothing({ target: userSettings.userId })
    .returning();
  return row ?? (await getUserSettings(userId))!;
}

export async function updateUserSettings(
  userId: string,
  input: UserSettingsInput,
): Promise<UserSettings> {
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/**
 * Claim the right to send this user's welcome email, once and only once.
 *
 * ONE statement, decided by the database. The obvious version reads the row,
 * sees no timestamp, and then writes one, but two sign-up retries arriving
 * together both read null and both send, and the new user is welcomed twice.
 *
 * Here the `where` on the conflict path is what makes it safe: an existing row
 * is only updated while `welcome_email_sent_at` is still null, so exactly one
 * caller gets a row back and everyone else gets nothing. Same shape as
 * `claimInvite`, for the same reason.
 *
 * Returns true when the caller won the claim and should send.
 */
export async function claimWelcomeEmail(userId: string, at: Date = new Date()): Promise<boolean> {
  const rows = await db
    .insert(userSettings)
    .values({ userId, welcomeEmailSentAt: at })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { welcomeEmailSentAt: at, updatedAt: at },
      setWhere: isNull(userSettings.welcomeEmailSentAt),
    })
    .returning({ id: userSettings.id });
  return rows.length > 0;
}

/**
 * Release a welcome claim that produced no event.
 *
 * The claim is taken BEFORE handing the event to n8n, because the alternative
 * order lets a crash between send and write produce a second email on retry. If
 * the handoff then fails outright, the mark is a lie: nothing was queued and
 * nobody will ever be welcomed. Clearing it puts the user back in line.
 *
 * Narrowed to the timestamp this caller wrote, so a concurrent claim that has
 * since succeeded is not undone by a late failure.
 */
export async function releaseWelcomeEmailClaim(userId: string, at: Date): Promise<void> {
  await db
    .update(userSettings)
    .set({ welcomeEmailSentAt: null })
    .where(and(eq(userSettings.userId, userId), eq(userSettings.welcomeEmailSentAt, at)));
}

/**
 * Mark first-login onboarding as seen.
 *
 * Idempotent and first-write-wins: a second call leaves the original timestamp
 * alone, so the record stays "when they first got through it" rather than
 * "when they last clicked something".
 */
export async function completeOnboarding(
  userId: string,
  at: Date = new Date(),
): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId, onboardingCompletedAt: at })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { onboardingCompletedAt: sql`coalesce(${userSettings.onboardingCompletedAt}, ${at})`, updatedAt: at },
    });
}
