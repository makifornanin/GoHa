import { boolean, check, date, index, pgTable, smallint, text, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { tasks } from "./tasks";

/**
 * Daily priorities: the "Top 3 Actions" for a given local date on the Today
 * dashboard. Each slot is `position` 1..3. A slot may point at an existing task
 * (`taskId`, cascades away if the task is deleted) or hold a free-text `label`.
 * For task-linked slots completion is derived from the task; `completed` covers
 * free-text slots.
 *
 * `priorityDate` is an Asia/Manila calendar date (CLAUDE.md section 6). The
 * unique (userId, priorityDate, position) constraint keeps each slot single.
 */
export const dailyPriorities = pgTable(
  "daily_priorities",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    priorityDate: date().notNull(),
    position: smallint().notNull(),
    taskId: uuid().references(() => tasks.id, { onDelete: "cascade" }),
    label: text(),
    completed: boolean().notNull().default(false),
    ...auditTimestamps,
  },
  (t) => [
    unique("daily_priorities_user_date_position_uq").on(
      t.userId,
      t.priorityDate,
      t.position,
    ),
    index("daily_priorities_user_date_idx").on(t.userId, t.priorityDate),
    check("daily_priorities_position_range", sql`${t.position} between 1 and 3`),
    check(
      "daily_priorities_task_or_label",
      sql`${t.taskId} is not null or ${t.label} is not null`,
    ),
  ],
);
