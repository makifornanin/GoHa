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

export type ThemeValue = z.infer<typeof themeSchema>;
export type PreferencesInput = z.input<typeof preferencesSchema>;
