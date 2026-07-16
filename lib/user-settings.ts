import "server-only";

import { cache } from "react";

import { settingsRepo, type UserSettings } from "@/db";
import { MANILA_TZ, type Weekday } from "@/lib/date";

/**
 * Server-side settings accessor. Wrapped in React `cache` so the shell layout
 * and the page within the same request share one query (and one create-on-demand
 * for a brand-new owner). Feature pages call `getUserDatePrefs` to derive their
 * "today"/week views in the user's chosen timezone and week start.
 */
export const getUserSettingsCached = cache(
  async (userId: string): Promise<UserSettings> => settingsRepo.getOrCreateUserSettings(userId),
);

export type UserDatePrefs = { timeZone: string; weekStartsOn: Weekday };

/** The timezone + week start to feed into `lib/date` and `lib/task-buckets`. */
export async function getUserDatePrefs(userId: string): Promise<UserDatePrefs> {
  const settings = await getUserSettingsCached(userId);
  return {
    timeZone: settings.timezone || MANILA_TZ,
    weekStartsOn: (settings.weekStartsOn as Weekday) ?? 1,
  };
}
