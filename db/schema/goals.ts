import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, check, date, index, integer, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { lifeAreas } from "./life-areas";
import { goalProgressMode, goalStatus, goalTimeframe, priority } from "./enums";

/**
 * Goals and sub-goals. Hierarchy is modeled with a self-referencing
 * `parentGoalId` (a sub-goal points at its parent). A goal belongs to a Life
 * Area; if that area is deleted the goal survives with a null area
 * (`set null`), while deleting a parent goal cascades to its sub-goals.
 *
 * Progress is either DERIVED from linked tasks (`progressMode = 'auto'`, computed
 * on read, never stored) or set by hand (`progressMode = 'manual'`, stored in
 * `manualProgress`). The exact rules live in lib/goal-progress.ts. Intentional
 * manual changes are journaled in `goal_progress_updates` (not on every render).
 */
export const goals = pgTable(
  "goals",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lifeAreaId: uuid().references(() => lifeAreas.id, { onDelete: "set null" }),
    parentGoalId: uuid().references((): AnyPgColumn => goals.id, {
      onDelete: "cascade",
    }),
    title: text().notNull(),
    description: text(),
    status: goalStatus().notNull().default("not_started"),
    timeframe: goalTimeframe(),
    priority: priority().notNull().default("medium"),
    /** 'auto' derives progress from tasks; 'manual' uses `manualProgress`. */
    progressMode: goalProgressMode().notNull().default("auto"),
    /** Manual progress (0-100), used when `progressMode = 'manual'`. */
    manualProgress: smallint(),
    /** Local calendar dates (Asia/Manila), not instants (CLAUDE.md section 6). */
    startDate: date(),
    targetDate: date(),
    sortOrder: integer().notNull().default(0),
    isArchived: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    ...auditTimestamps,
  },
  (t) => [
    index("goals_user_id_idx").on(t.userId),
    index("goals_user_status_idx").on(t.userId, t.status),
    index("goals_user_timeframe_idx").on(t.userId, t.timeframe),
    index("goals_life_area_id_idx").on(t.lifeAreaId),
    index("goals_parent_goal_id_idx").on(t.parentGoalId),
    check(
      "goals_manual_progress_range",
      sql`${t.manualProgress} is null or (${t.manualProgress} >= 0 and ${t.manualProgress} <= 100)`,
    ),
    check("goals_no_self_parent", sql`${t.parentGoalId} is null or ${t.parentGoalId} <> ${t.id}`),
  ],
);

/**
 * Append-only journal of goal progress changes: a snapshot value plus an
 * optional note. Used for the goal history / reflection surface. No
 * `updatedAt` because rows are never edited in place.
 */
export const goalProgressUpdates = pgTable(
  "goal_progress_updates",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    goalId: uuid()
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    /** Progress snapshot (0-100) recorded at this point. */
    progress: smallint().notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goal_progress_updates_goal_id_idx").on(t.goalId, t.createdAt),
    index("goal_progress_updates_user_id_idx").on(t.userId),
    check(
      "goal_progress_updates_range",
      sql`${t.progress} >= 0 and ${t.progress} <= 100`,
    ),
  ],
);
