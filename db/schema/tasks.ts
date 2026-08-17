import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { check, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { goals } from "./goals";
import { lifeAreas } from "./life-areas";
import { priority, taskStatus } from "./enums";

/**
 * Tasks / To-Dos. Date-derived views (Today/Week/Month/Quarter/Year/Inbox/Done)
 * are computed from `scheduledFor` + `dueAt` with timezone-aware rules
 * (`lib/date.ts`); there is deliberately NO static `bucket` column.
 *
 * - `scheduledFor` is the local calendar date the task is planned for -> DATE.
 * - `dueAt` is a hard deadline instant -> TIMESTAMPTZ.
 *
 * Completing a task also drives linked goal progress (computed in the seam), so
 * completion state lives only here (CLAUDE.md section 7, one connected system).
 */
export const tasks = pgTable(
  "tasks",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    goalId: uuid().references(() => goals.id, { onDelete: "set null" }),
    lifeAreaId: uuid().references(() => lifeAreas.id, { onDelete: "set null" }),
    /**
     * Subtask parent. A checklist step that only exists as part of its parent,
     * so it CASCADES: deleting the parent removes its steps rather than leaving
     * them orphaned at the top level. One level deep by convention (the UI never
     * offers a subtask of a subtask); goal hierarchy is the tool for real depth.
     */
    parentTaskId: uuid().references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text(),
    status: taskStatus().notNull().default("todo"),
    priority: priority().notNull().default("medium"),
    scheduledFor: date(),
    dueAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    /** Persistent completion feedback/reflection, captured during or after done. */
    completionNote: text(),
    /** Optional planning estimate, feeds Focus Mode defaults. */
    estimateMinutes: integer(),
    sortOrder: integer().notNull().default(0),
    ...auditTimestamps,
  },
  (t) => [
    index("tasks_user_id_idx").on(t.userId),
    index("tasks_user_status_idx").on(t.userId, t.status),
    index("tasks_user_scheduled_for_idx").on(t.userId, t.scheduledFor),
    index("tasks_user_due_at_idx").on(t.userId, t.dueAt),
    index("tasks_goal_id_idx").on(t.goalId),
    index("tasks_life_area_id_idx").on(t.lifeAreaId),
    index("tasks_parent_task_id_idx").on(t.parentTaskId),
    /*
     * Partial indexes for the automation reads (Guide 00, phase A5).
     *
     * The graveyard sweep asks for in-progress tasks that have not moved, and
     * the deadline poll asks for unfinished work with a due date. Both are
     * small slices of a table that is mostly neither, so a partial index is a
     * fraction of the size of the full ones above and is the one actually
     * chosen for those queries.
     */
    index("tasks_user_in_progress_idx")
      .on(t.userId, t.status)
      .where(sql`${t.status} = 'in_progress'`),
    index("tasks_user_open_due_idx")
      .on(t.userId, t.dueAt)
      .where(sql`${t.completedAt} is null`),
    check("tasks_no_self_parent", sql`${t.parentTaskId} is null or ${t.parentTaskId} <> ${t.id}`),
    check(
      "tasks_estimate_minutes_positive",
      sql`${t.estimateMinutes} is null or ${t.estimateMinutes} > 0`,
    ),
  ],
);
