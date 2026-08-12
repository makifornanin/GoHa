import { z } from "zod";

import { isValidTimeZone } from "@/lib/timezones";

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a display name.")
  .max(80, "Keep your name under 80 characters.");

export const themeSchema = z.enum(["light", "dark", "system"]);

export const timezoneSchema = z
  .string()
  .trim()
  .refine(isValidTimeZone, "Choose a valid timezone.");

/** 0=Sunday .. 6=Saturday, matching the DB check constraint. */
export const weekStartSchema = z.coerce.number().int().min(0).max(6);

export const preferencesSchema = z.object({
  timezone: timezoneSchema,
  weekStartsOn: weekStartSchema,
});

/**
 * A local time-of-day ("HH:mm"), or null when the user clears it.
 *
 * Stored in a `time` column, so seconds are irrelevant and an empty field must
 * become NULL rather than "" (which Postgres would reject).
 */
const optionalTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .pipe(
    z.union([
      z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a time as HH:MM."),
      z.null(),
    ]),
  );

/**
 * The daily rhythm: when you intend to plan the day and when you intend to look
 * back at it. These are intentions the app shows back to you, not reminders it
 * delivers: push and email infrastructure are explicitly out of scope
 * (CLAUDE.md section 2), so nothing here sends anything. An external
 * automation can read these times and do the delivering.
 */
export const rhythmSchema = z.object({
  dailyPlanningTime: optionalTime,
  eveningReflectionTime: optionalTime,
});

export type ThemeValue = z.infer<typeof themeSchema>;
export type PreferencesInput = z.input<typeof preferencesSchema>;
export type RhythmInput = z.input<typeof rhythmSchema>;
