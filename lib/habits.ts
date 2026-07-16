import type { HabitType } from "@/db/schema/enums";
import type { StreakOutcome } from "@/lib/habit-streaks";

/**
 * Shared, client-safe constants for the Habits feature. Habits reuse the Life
 * Areas color/icon palette (see lib/life-areas) for their accent + glyph.
 */

export const HABIT_NAME_MAX = 80;
export const HABIT_DESCRIPTION_MAX = 280;
export const HABIT_UNIT_MAX = 24;
export const HABIT_TIMES_PER_WEEK_MAX = 7;

export const HABIT_TYPE_VALUES = ["boolean", "numeric"] as const satisfies readonly HabitType[];

export const habitTypeConfig: Record<HabitType, { label: string; hint: string }> = {
  boolean: { label: "Yes / No", hint: "Simply did it or not (done, missed, or skipped)." },
  numeric: { label: "Measured", hint: "Track a number toward a target, e.g. 8 glasses." },
};

/** How a habit is scheduled. Maps to habit_schedules columns in the action. */
export const HABIT_SCHEDULE_TYPES = ["daily", "weekly_days", "weekly_times"] as const;
export type HabitScheduleType = (typeof HABIT_SCHEDULE_TYPES)[number];

export const habitScheduleTypeConfig: Record<HabitScheduleType, { label: string }> = {
  daily: { label: "Every day" },
  weekly_days: { label: "Specific days" },
  weekly_times: { label: "Times per week" },
};

/** Weekday labels indexed by JS weekday (0=Sunday..6=Saturday). */
export const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
export const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Weekday numbers in Monday-first display order. */
export const WEEK_ORDER_MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** Cell appearance for the weekly history grid, keyed by resolved day outcome. */
export type DayCellState = StreakOutcome | "pending" | "off";

export const dayCellConfig: Record<DayCellState, { className: string; label: string }> = {
  done: { className: "bg-green", label: "Done" },
  partial: { className: "bg-green/40", label: "Partial" },
  miss: { className: "bg-red/25", label: "Missed" },
  skip: { className: "bg-gray-4", label: "Skipped" },
  pending: { className: "border border-dashed border-gray-3 bg-transparent", label: "Pending" },
  off: { className: "bg-transparent", label: "Not scheduled" },
};

/** Parse a DB numeric string (or null) to a number for the domain utilities. */
export function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
