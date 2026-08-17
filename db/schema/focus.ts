import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { tasks } from "./tasks";
import { focusSessionStatus } from "./enums";

/**
 * Focus sessions (Focus Mode). Optionally tied to a task. Carries both the
 * `startedAt` instant and a `sessionDate DATE` (Asia/Manila) so daily focus
 * totals bucket correctly without truncating UTC (CLAUDE.md section 6).
 */
export const focusSessions = pgTable(
  "focus_sessions",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
    sessionDate: date().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp({ withTimezone: true }),
    /** Set while the session is currently paused; null when running or ended. */
    pausedAt: timestamp({ withTimezone: true }),
    /** Accumulated paused time from resolved pause intervals (subtracted from elapsed). */
    pausedSeconds: integer().notNull().default(0),
    /** Intended length (e.g. a 25-minute pomodoro). */
    plannedDurationSeconds: integer(),
    /** Actual focused time; set when the session ends (derived from timestamps). */
    durationSeconds: integer(),
    status: focusSessionStatus().notNull().default("in_progress"),
    note: text(),
    ...auditTimestamps,
  },
  (t) => [
    index("focus_sessions_user_session_date_idx").on(t.userId, t.sessionDate),
    index("focus_sessions_user_status_idx").on(t.userId, t.status),
    index("focus_sessions_task_id_idx").on(t.taskId),
    /**
     * At most one running session per user, enforced by the database (audit
     * R-08). Starting a session closes any lingering one and then inserts,
     * which two clicks landing together can both pass, and the totals are then
     * double counted for as long as both stay open.
     */
    uniqueIndex("focus_sessions_one_active_per_user_uq")
      .on(t.userId)
      .where(sql`${t.status} = 'in_progress'`),
    check(
      "focus_sessions_duration_non_negative",
      sql`${t.durationSeconds} is null or ${t.durationSeconds} >= 0`,
    ),
    check("focus_sessions_paused_seconds_non_negative", sql`${t.pausedSeconds} >= 0`),
    /**
     * A plan is a real length. Extensions add to this column with no ceiling of
     * their own, so the bound lives here: positive, and never longer than a
     * day, which is already far past the point the abandon sweep gives up on a
     * session.
     */
    check(
      "focus_sessions_planned_duration_range",
      sql`${t.plannedDurationSeconds} is null or (${t.plannedDurationSeconds} > 0 and ${t.plannedDurationSeconds} <= 86400)`,
    ),
  ],
);
