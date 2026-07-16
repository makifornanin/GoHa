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
    check(
      "tasks_estimate_minutes_positive",
      sql`${t.estimateMinutes} is null or ${t.estimateMinutes} > 0`,
    ),
  ],
);
