import { boolean, check, jsonb, pgTable, smallint, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { themePreference } from "./enums";

/**
 * Per-user settings. One row per user (unique `userId`). Notifications here are
 * in-app preferences only; no push/email infrastructure is in scope (CLAUDE.md
 * section 2). `preferences` is an open jsonb bag for forward-compatible options
 * so new toggles do not require a migration each time.
 */
export const userSettings = pgTable(
  "user_settings",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    /** IANA timezone. Defaults to the primary user's zone (CLAUDE.md section 6). */
    timezone: text().notNull().default("Asia/Manila"),
    theme: themePreference().notNull().default("system"),
    /** 0=Sunday .. 6=Saturday. Drives week-bucket boundaries. */
    weekStartsOn: smallint().notNull().default(1),
    /** Local time-of-day reminders (no delivery infra yet; UI hints only). */
    dailyPlanningTime: time(),
    eveningReflectionTime: time(),
    notificationsEnabled: boolean().notNull().default(true),
    onboardingCompletedAt: timestamp({ withTimezone: true }),
    preferences: jsonb().$type<Record<string, unknown>>(),
    ...auditTimestamps,
  },
  (t) => [
    check(
      "user_settings_week_starts_on_range",
      sql`${t.weekStartsOn} between 0 and 6`,
    ),
  ],
);
