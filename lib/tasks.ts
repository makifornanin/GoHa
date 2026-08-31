import type { Priority, TaskStatus } from "@/db/schema/enums";

/**
 * Shared, client-safe constants for the Tasks feature: field limits and the
 * presentation config for statuses and priorities, in design tokens. Enum types
 * are imported type-only so no Drizzle code reaches the client bundle.
 */

export const TASK_TITLE_MAX = 160;
export const TASK_DESCRIPTION_MAX = 1000;
export const TASK_COMPLETION_NOTE_MAX = 1000;

export const TASK_STATUS_VALUES = [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
] as const satisfies readonly TaskStatus[];

export const TASK_PRIORITY_VALUES = [
  "low",
  "medium",
  "high",
  "urgent",
] as const satisfies readonly Priority[];

type StatusMeta = { label: string; badge: string };

export const taskStatusConfig: Record<TaskStatus, StatusMeta> = {
  todo: { label: "To Do", badge: "bg-gray-5 text-label-secondary" },
  in_progress: { label: "In Progress", badge: "bg-blue/15 text-blue" },
  completed: { label: "Completed", badge: "bg-green/15 text-green" },
  cancelled: { label: "Cancelled", badge: "bg-gray-5 text-label-tertiary" },
};

export const TASK_STATUS_ORDER: readonly TaskStatus[] = TASK_STATUS_VALUES;

type PriorityMeta = {
  label: string;
  /** Chip classes. */
  badge: string;
  /** Colour for showing the priority as plain words rather than a chip. */
  text: string;
  /** Left accent-bar color on the task card. */
  accent: string;
  /** Sort weight (higher = more urgent) for priority sorting. */
  weight: number;
};

export const taskPriorityConfig: Record<Priority, PriorityMeta> = {
  low: {
    label: "Low",
    badge: "bg-gray-5 text-label-secondary",
    text: "text-label-secondary",
    accent: "bg-gray-3",
    weight: 0,
  },
  medium: {
    label: "Medium",
    badge: "bg-blue/15 text-blue",
    text: "text-blue",
    accent: "bg-blue",
    weight: 1,
  },
  high: {
    label: "High",
    badge: "bg-orange/15 text-orange",
    text: "text-orange",
    accent: "bg-orange",
    weight: 2,
  },
  urgent: {
    label: "Urgent",
    text: "text-red",
    badge: "bg-red text-white",
    accent: "bg-red",
    weight: 3,
  },
};

export const TASK_PRIORITY_ORDER: readonly Priority[] = TASK_PRIORITY_VALUES;

/**
 * Duration options offered when estimating a to-do.
 *
 * A short ladder, not a number field. Planning a day is a judgement call, and
 * asking for minutes invites false precision: nobody's "write the case study"
 * is 47 minutes. These are the buckets people actually think in, and the
 * planner's arithmetic is honest at this resolution.
 *
 * `null` is a real, first-class choice. An estimate is optional everywhere in
 * GoHa, and the planner says so out loud rather than inventing a default: a
 * fabricated duration would silently corrupt the one number the Day Planner
 * exists to get right.
 */
export const TASK_ESTIMATE_OPTIONS: readonly number[] = [15, 30, 45, 60, 90, 120, 180, 240];

/** The largest estimate the form accepts, in minutes. A day is the ceiling. */
export const TASK_ESTIMATE_MAX_MINUTES = 24 * 60;

/**
 * "1h 30m" rather than "90m". Nobody plans a day in three-digit minutes, and
 * the planner adds these up in front of the user, so they have to read as time.
 */
export function formatEstimate(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** The same value spelled for a screen reader, which should not read "1h 30m". */
export function describeEstimate(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (rest > 0) parts.push(`${rest} minute${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
}
