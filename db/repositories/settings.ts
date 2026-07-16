import "server-only";

import { eq } from "drizzle-orm";

import { db } from "../client";
import { userSettings } from "../schema";
import type { ThemePreference } from "../schema";
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
  preferences?: Record<string, unknown> | null;
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
