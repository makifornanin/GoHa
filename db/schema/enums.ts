import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Postgres enum types. Centralized so the same value sets are reused by the
 * schema, the repository seam, and (later) Zod validation at server boundaries.
 */

/** Goal lifecycle. The explicit V1 status set (see docs/BUILD_PLAN.md Phase 5). */
export const goalStatus = pgEnum("goal_status", [
  "not_started",
  "active",
  "paused",
  "completed",
  "dropped",
]);

/** Goal timeframe. Backs the Today/Week/Month/Quarter/Year filter tabs. */
export const goalTimeframe = pgEnum("goal_timeframe", [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);

/** How a goal's progress is determined: derived from tasks, or set by hand. */
export const goalProgressMode = pgEnum("goal_progress_mode", ["auto", "manual"]);

/**
 * Task lifecycle. `cancelled` tasks are excluded from goal progress denominators
 * (see lib/goal-progress.ts). `bucket` (Today/Week/...) is derived, never stored.
 */
export const taskStatus = pgEnum("task_status", [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
]);

/** Shared priority scale for tasks (and available to goals). */
export const priority = pgEnum("priority", ["low", "medium", "high", "urgent"]);

/** Habit measurement kind: a simple done/not-done, or a counted quantity. */
export const habitType = pgEnum("habit_type", ["boolean", "numeric"]);

/** How often a habit is expected. `custom` day sets live in habit_schedules. */
export const habitFrequency = pgEnum("habit_frequency", [
  "daily",
  "weekly",
  "monthly",
]);

/**
 * The logged outcome of a habit on a day. `done` = completed (numeric habits
 * also store the value); `missed` = explicitly not done; `skipped` = deliberately
 * skipped and neutral for streaks.
 */
export const habitEntryStatus = pgEnum("habit_entry_status", [
  "done",
  "missed",
  "skipped",
]);

/** Focus session lifecycle. */
export const focusSessionStatus = pgEnum("focus_session_status", [
  "in_progress",
  "completed",
  "abandoned",
]);

/** Brain dump item lifecycle as it flows toward becoming a task. */
export const brainDumpStatus = pgEnum("brain_dump_status", [
  "inbox",
  "converted",
  "archived",
]);

/** What a brain dump item was converted into. */
export const brainDumpConvertedType = pgEnum("brain_dump_converted_type", [
  "task",
  "goal",
  "habit",
]);

/** User appearance preference. Mirrors next-themes. */
export const themePreference = pgEnum("theme_preference", [
  "light",
  "dark",
  "system",
]);

/** Kind of node placed on a Task Map canvas. */
export const taskMapNodeType = pgEnum("task_map_node_type", [
  "task",
  "note",
  "group",
  "milestone",
]);

/** String-union types derived from the enums above, for use in inputs and the seam. */
export type GoalStatus = (typeof goalStatus.enumValues)[number];
export type GoalTimeframe = (typeof goalTimeframe.enumValues)[number];
export type GoalProgressMode = (typeof goalProgressMode.enumValues)[number];
export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type Priority = (typeof priority.enumValues)[number];
export type HabitType = (typeof habitType.enumValues)[number];
export type HabitFrequency = (typeof habitFrequency.enumValues)[number];
export type HabitEntryStatus = (typeof habitEntryStatus.enumValues)[number];
export type FocusSessionStatus = (typeof focusSessionStatus.enumValues)[number];
export type BrainDumpStatus = (typeof brainDumpStatus.enumValues)[number];
export type BrainDumpConvertedType = (typeof brainDumpConvertedType.enumValues)[number];
export type ThemePreference = (typeof themePreference.enumValues)[number];
export type TaskMapNodeType = (typeof taskMapNodeType.enumValues)[number];
