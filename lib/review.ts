import type { FocusSession, HabitEntry, Task } from "@/db";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import { addDays, MANILA_TZ, toZonedDate, type IsoDate, type Weekday } from "@/lib/date";
import { habitCompletionRate, habitHeatmap } from "@/lib/progress";
import { taskEffectiveDate } from "@/lib/task-buckets";

/**
 * What actually happened in a week.
 *
 * Every figure is derived from the canonical records on read: completed-task
 * timestamps, habit entries, focus durations. Nothing is snapshotted into the
 * review row, so reopening a task next month corrects the history rather than
 * leaving a stale number frozen in place (CLAUDE.md section 7).
 */

/**
 * Field limit for the prose prompts, shared by the Zod schema and the form.
 *
 * It lives HERE, not in the actions file: a `"use server"` module may only
 * export async functions, so a plain constant exported from one is stripped at
 * build time and the client import fails at runtime. TypeScript cannot see
 * that, since the export exists in the source.
 */
export const REVIEW_FIELD_MAX = 2000;

export type ReviewWeek = { start: IsoDate; end: IsoDate };

/** The half-open week containing `date`, honouring the week-start preference. */
export function weekBounds(weekStart: IsoDate): ReviewWeek {
  return { start: weekStart, end: addDays(weekStart, 6) };
}

export type ReviewStats = {
  completed: Task[];
  /** Open work whose date fell inside the week and is still not done. */
  slipped: Task[];
  /** Completed inside the week, grouped by life area id ("none" when unset). */
  completedByArea: { areaId: string | null; count: number }[];
  focusSeconds: number;
  focusSessions: number;
  habitRate: number;
  habitDaysDone: number;
  habitDaysScheduled: number;
  /** Goals that reached completed status during the week. */
  goalsCompleted: number;
  /** Carried straight into the next week's plan. */
  carryOver: Task[];
};

export function deriveReviewStats(params: {
  week: ReviewWeek;
  tasks: Task[];
  habits: HabitWithSchedule[];
  habitEntries: HabitEntry[];
  sessions: FocusSession[];
  goals: { status: string; completedAt: Date | null }[];
  today: IsoDate;
  weekStartsOn?: Weekday;
  timeZone?: string;
}): ReviewStats {
  const timeZone = params.timeZone ?? MANILA_TZ;
  const { start, end } = params.week;
  const inWeek = (day: IsoDate | null) => day !== null && day >= start && day <= end;

  const completed: Task[] = [];
  const slipped: Task[] = [];
  for (const task of params.tasks) {
    if (task.status === "cancelled") continue;

    if (task.status === "completed" && task.completedAt) {
      if (inWeek(toZonedDate(task.completedAt, timeZone))) completed.push(task);
      continue;
    }
    // Still open, and it was meant to happen during this week.
    if (inWeek(taskEffectiveDate(task, timeZone))) slipped.push(task);
  }

  const areaCounts = new Map<string | null, number>();
  for (const task of completed) {
    areaCounts.set(task.lifeAreaId, (areaCounts.get(task.lifeAreaId) ?? 0) + 1);
  }

  let focusSeconds = 0;
  let focusSessions = 0;
  for (const session of params.sessions) {
    if (!inWeek(session.sessionDate)) continue;
    const seconds = session.durationSeconds ?? 0;
    if (seconds <= 0) continue;
    focusSeconds += seconds;
    focusSessions += 1;
  }

  // The same heatmap the Progress page uses, scoped to this one week, so habit
  // consistency can never disagree between the two screens.
  const cells = habitHeatmap({
    habits: params.habits,
    entries: params.habitEntries,
    from: start,
    to: end,
    today: params.today,
    weekStartsOn: params.weekStartsOn,
    timeZone,
  });
  const habitDaysDone = cells.reduce((sum, c) => sum + c.done, 0);
  const habitDaysScheduled = cells.reduce((sum, c) => sum + c.scheduled, 0);

  const goalsCompleted = params.goals.filter(
    (g) => g.status === "completed" && g.completedAt && inWeek(toZonedDate(g.completedAt, timeZone)),
  ).length;

  return {
    completed,
    slipped,
    completedByArea: [...areaCounts.entries()]
      .map(([areaId, count]) => ({ areaId, count }))
      .sort((a, b) => b.count - a.count),
    focusSeconds,
    focusSessions,
    habitRate: habitCompletionRate(cells),
    habitDaysDone,
    habitDaysScheduled,
    goalsCompleted,
    // What should follow you into next week: still open, and already overdue.
    carryOver: slipped.slice(0, 8),
  };
}
