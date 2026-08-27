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
