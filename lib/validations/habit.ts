import { z } from "zod";

import {
  HABIT_DESCRIPTION_MAX,
  HABIT_NAME_MAX,
  HABIT_SCHEDULE_TYPES,
  HABIT_TIMES_PER_WEEK_MAX,
  HABIT_TYPE_VALUES,
  HABIT_UNIT_MAX,
} from "@/lib/habits";
import {
  DEFAULT_COLOR_KEY,
  DEFAULT_ICON_KEY,
  LIFE_AREA_COLOR_KEYS,
  LIFE_AREA_ICON_KEYS,
  isHexColor,
  normalizeHex,
} from "@/lib/life-areas";

function optionalUuid(message: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .pipe(z.union([z.uuid(message), z.null()]));
}

const optionalNumber = (schema: z.ZodType<number>) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.union([schema, z.null()]));

/**
 * Habit create/edit input. Covers the habit itself, its numeric target (when
 * applicable), and its schedule (mapped to habit_schedules by the action).
 */
export const habitFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give this habit a name.")
      .max(HABIT_NAME_MAX, `Keep the name to ${HABIT_NAME_MAX} characters or fewer.`),
    description: z
      .string()
      .trim()
      .max(HABIT_DESCRIPTION_MAX, `Keep the description to ${HABIT_DESCRIPTION_MAX} characters or fewer.`)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    type: z.enum(HABIT_TYPE_VALUES).default("boolean"),
    targetValue: optionalNumber(z.coerce.number().positive("Target must be greater than 0.")),
    unit: z
      .string()
      .trim()
      .max(HABIT_UNIT_MAX, `Keep the unit to ${HABIT_UNIT_MAX} characters or fewer.`)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    higherIsBetter: z.boolean().default(true),
    /*
     * A legacy key OR a `#rrggbb` custom colour, exactly as a life area accepts.
     * The column is already `text`, so widening the accepted range needed no
     * migration, and every habit saved as "teal" keeps validating as before.
     */
    color: z
      .string()
      .default(DEFAULT_COLOR_KEY)
      .refine(
        (value) => LIFE_AREA_COLOR_KEYS.includes(value as never) || isHexColor(value),
        "Choose a colour from the palette, or enter one like #4a7ab5.",
      )
      .transform((value) => normalizeHex(value) ?? value),
    icon: z.enum(LIFE_AREA_ICON_KEYS).default(DEFAULT_ICON_KEY),
    lifeAreaId: optionalUuid("Choose a valid life area."),
    goalId: optionalUuid("Choose a valid goal."),
    scheduleType: z.enum(HABIT_SCHEDULE_TYPES).default("daily"),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
    timesPerWeek: z.coerce
      .number()
      .int()
      .min(1, "At least once per week.")
      .max(HABIT_TIMES_PER_WEEK_MAX, `At most ${HABIT_TIMES_PER_WEEK_MAX} times per week.`)
      .default(3),
  })
  .superRefine((data, ctx) => {
    if (data.type === "numeric" && (data.targetValue == null || data.targetValue <= 0)) {
      ctx.addIssue({ code: "custom", path: ["targetValue"], message: "Enter a target greater than 0." });
    }
    if (data.scheduleType === "weekly_days" && data.daysOfWeek.length === 0) {
      ctx.addIssue({ code: "custom", path: ["daysOfWeek"], message: "Pick at least one day." });
    }
  });

export type HabitFormInput = z.input<typeof habitFormSchema>;
export type HabitFormValues = z.output<typeof habitFormSchema>;

export const habitIdSchema = z.uuid("That habit could not be found.");

/** A single day's log for a habit. */
export const habitLogSchema = z.object({
  status: z.enum(["done", "missed", "skipped"]).default("done"),
  value: optionalNumber(z.coerce.number().min(0, "Value cannot be negative.")),
  note: z
    .string()
    .trim()
    .max(280)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type HabitLogInput = z.input<typeof habitLogSchema>;
export type HabitLogValues = z.output<typeof habitLogSchema>;

export const isoDateSchema = z.iso.date("That date is invalid.");

export type HabitFieldErrors = Partial<Record<keyof HabitFormValues, string>>;

export function toHabitFieldErrors(error: z.ZodError): HabitFieldErrors {
  const errors: HabitFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) {
      errors[key as keyof HabitFormValues] = issue.message;
    }
  }
  return errors;
}
