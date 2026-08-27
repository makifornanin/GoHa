import { boolean, check, jsonb, pgTable, smallint, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { quoteSourcePref, signupMode, themePreference } from "./enums";

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
    /**
     * When the welcome email event was handed to n8n, and the idempotency key
     * for sending it.
     *
     * A nullable timestamp rather than a boolean, matching every other
     * once-only milestone here (`invites.claimedAt`, `push_subscriptions
     * .disabledAt`). It is claimed by a conditional upsert that only writes
     * where the column is still null, so two concurrent sign-up retries cannot
     * both win and the user cannot be welcomed twice. Set when the event is
     * ACCEPTED for delivery, not when Gmail delivers: GoHa does not send mail
     * and cannot observe the latter.
     */
    welcomeEmailSentAt: timestamp({ withTimezone: true }),
    preferences: jsonb().$type<Record<string, unknown>>(),

    /*
     * Automation preferences (Guide 00, phase A4).
     *
     * All three toggles default to FALSE. A notification the owner did not ask
     * for is worse than no automation at all, and a default-on switch means the
     * first thing a new setup does is interrupt someone. The API layer enforces
     * these, so turning one off silences the endpoint itself rather than
     * relying on every workflow to check.
     */
    morningBriefEnabled: boolean().notNull().default(false),
    eveningSummaryEnabled: boolean().notNull().default(false),
    deadlineAlertsEnabled: boolean().notNull().default(false),
    /**
     * Contextual midday task nudges, up to four a day.
     *
     * Its own switch rather than a rider on `deadlineAlertsEnabled`, because
     * the two make different promises: deadline alerts fire about work the user
     * dated themselves, and this one fires because GoHa decided the moment was
     * a reasonable one. Someone can very reasonably want the first and not the
     * second, and off is how it ships.
     */
    smartRemindersEnabled: boolean().notNull().default(false),
    /** How far ahead /due looks by default, in minutes. */
    deadlineLeadMinutes: smallint().notNull().default(60),
    quoteSourcePref: quoteSourcePref().notNull().default("both"),
    /**
     * The rest day, 0=Sunday..6=Saturday, matching `weekStartsOn`. Null means
     * disabled. On this day the automation layer stays quiet (Guide 07).
     */
    sabbathDay: smallint(),
    ...auditTimestamps,
  },
  (t) => [
    check(
      "user_settings_week_starts_on_range",
      sql`${t.weekStartsOn} between 0 and 6`,
    ),
    check(
      "user_settings_sabbath_day_range",
      sql`${t.sabbathDay} is null or (${t.sabbathDay} between 0 and 6)`,
    ),
    check(
      "user_settings_deadline_lead_range",
      sql`${t.deadlineLeadMinutes} between 5 and 1440`,
    ),
  ],
);

/**
 * Settings for the whole install, not for one person.
 *
 * Exactly one row, held there by a unique index on a constant expression. Who
 * may create an account is a property of this GoHa rather than of any account
 * in it, so it cannot live in `user_settings`: whichever user's row you put it
 * in becomes silently special, and nobody can tell which.
 *
 * The owner is the account that was created first, and only the owner can
 * change what is here.
 */
export const appSettings = pgTable(
  "app_settings",
  {
    id: primaryId(),
    /**
     * `open`: anyone who reaches the sign-in page can create an account.
     * `invite_only`: an invitation from the owner is required.
     */
    signupMode: signupMode().notNull().default("invite_only"),
    ...auditTimestamps,
  },
  () => [uniqueIndex("app_settings_singleton_uq").on(sql`((true))`)],
);
