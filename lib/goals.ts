import type { GoalProgressMode, GoalStatus, GoalTimeframe } from "@/db/schema/enums";

/**
 * Shared, client-safe constants for the Goals feature: field limits and the
 * presentation config for statuses and timeframes. Single source of truth reused
 * by the Zod schema, the form, and the cards, expressed in design tokens
 * (CLAUDE.md section 9). Enum types are imported type-only so no server/Drizzle
 * code reaches the client bundle.
 */

export const GOAL_TITLE_MAX = 120;
export const GOAL_DESCRIPTION_MAX = 500;
export const GOAL_PROGRESS_MIN = 0;
export const GOAL_PROGRESS_MAX = 100;

/**
 * Literal value tuples for the goal enums. Kept in sync with the Drizzle enums
 * via `satisfies` (a compile error here if the DB enum changes) while staying
 * plain string literals so Zod and the client bundle need no Drizzle import.
 */
export const GOAL_STATUS_VALUES = [
  "not_started",
  "active",
  "paused",
  "completed",
  "dropped",
] as const satisfies readonly GoalStatus[];

export const GOAL_TIMEFRAME_VALUES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const satisfies readonly GoalTimeframe[];

export const GOAL_PROGRESS_MODES = ["auto", "manual"] as const satisfies readonly GoalProgressMode[];

type StatusMeta = {
  label: string;
  /** Badge (chip) utility classes. */
  badge: string;
  /** Progress-bar fill color. */
  bar: string;
  /** Whether the card should read as de-emphasized (dropped goals). */
  muted?: boolean;
};

/** Presentation per goal status. The Record enforces every status is covered. */
export const goalStatusConfig: Record<GoalStatus, StatusMeta> = {
  not_started: {
    label: "Not Started",
    badge: "bg-surface-variant text-on-surface-variant",
    bar: "bg-outline",
  },
  active: {
    label: "Active",
    badge: "bg-primary-container text-on-primary-container",
    bar: "bg-primary-container",
  },
  paused: {
    label: "Paused",
    badge: "bg-secondary-container text-on-secondary-container",
    bar: "bg-secondary",
  },
  completed: {
    label: "Completed",
    badge: "bg-primary text-on-primary",
    bar: "bg-primary",
  },
  dropped: {
    label: "Dropped",
    badge: "bg-surface-container-high text-outline",
    bar: "bg-outline-variant",
    muted: true,
  },
};

/** Status order for select controls. */
export const GOAL_STATUS_ORDER: readonly GoalStatus[] = GOAL_STATUS_VALUES;

type TimeframeMeta = {
  /** Full label used in forms and card meta. */
  label: string;
  /** Short tab label used in the filter bar (mirrors the design). */
  tab: string;
};

export const goalTimeframeConfig: Record<GoalTimeframe, TimeframeMeta> = {
  daily: { label: "Daily", tab: "Today" },
  weekly: { label: "Weekly", tab: "This Week" },
  monthly: { label: "Monthly", tab: "This Month" },
  quarterly: { label: "Quarterly", tab: "Quarterly" },
  yearly: { label: "Yearly", tab: "Yearly" },
};

export const GOAL_TIMEFRAME_ORDER: readonly GoalTimeframe[] = GOAL_TIMEFRAME_VALUES;

export const DEFAULT_TIMEFRAME: GoalTimeframe = "monthly";

export const goalProgressModeConfig: Record<GoalProgressMode, { label: string; hint: string }> = {
  auto: { label: "From tasks", hint: "Progress is calculated from linked tasks." },
  manual: { label: "Manual", hint: "You set the progress percentage yourself." },
};
