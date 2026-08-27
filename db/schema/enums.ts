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

/**
 * What an automation token may do. `read` covers every read endpoint;
 * `read_write` additionally allows claiming a delivery, which is the only write
 * the automation surface offers. Nothing here can create or complete domain
 * records: those stay behind the app's own Server Actions.
 */
export const automationScope = pgEnum("automation_scope", ["read", "read_write"]);

/**
 * What an automation sent. One value per kind of message the layer can deliver
 * (automation Guide 00, phase A2), so the log can be grouped and read back
 * without parsing free text.
 */
export const notificationKind = pgEnum("notification_kind", [
  "morning_brief",
  "evening_summary",
  "deadline",
  "focus_overrun",
  /*
   * A contextual nudge about work still sitting on Today.
   *
   * Distinct from `deadline`, which says a task is actually due, and from
   * `focus_overrun`, which is about a session running long. This one only ever
   * claims that something the user put on today is not finished, which is the
   * only thing GoHa can say without guessing at their day.
   */
  "smart_task_reminder",
  "streak_risk",
  "graveyard",
  "review_draft",
  "health",
  "sabbath",
  "test",
]);

/** Where a daily quote comes from: a quote, or a scripture verse. */
export const quoteSource = pgEnum("quote_source", ["quote", "verse"]);

/** Which of those the owner wants to see on a given day. */
export const quoteSourcePref = pgEnum("quote_source_pref", ["quote", "verse", "both"]);

/**
 * Who may create an account on this install.
 *
 * Defaults to invite_only in the schema, because a default that opens a public
 * sign-up page is not a default anyone should get by forgetting to choose.
 */
export const signupMode = pgEnum("signup_mode", ["open", "invite_only"]);

/** User appearance preference. Mirrors next-themes. */
export const themePreference = pgEnum("theme_preference", [
  "light",
  "dark",
  "system",
]);

/**
 * Kind of node placed on a Task Map canvas.
 *
 * Four types could only draw a flat list of boxes. `decision`, `blocker` and
 * `phase` are what a map needs to express a ROUTE rather than an inventory: a
 * branch point, a thing in the way, and a stage that groups the rest. Between
 * them they cover both readings of a map, an automation flow and a roadmap.
 */
export const taskMapNodeType = pgEnum("task_map_node_type", [
  "task",
  "note",
  "group",
  "milestone",
  "decision",
  "blocker",
  "phase",
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
export type AutomationScope = (typeof automationScope.enumValues)[number];
export type NotificationKind = (typeof notificationKind.enumValues)[number];
export type QuoteSource = (typeof quoteSource.enumValues)[number];
export type QuoteSourcePref = (typeof quoteSourcePref.enumValues)[number];
export type SignupMode = (typeof signupMode.enumValues)[number];
