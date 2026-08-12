import type { FocusSession, HabitEntry, Task } from "@/db";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import { addDays, startOfWeek, toZonedDate, type IsoDate, type Weekday } from "@/lib/date";
import { buildHabitViews } from "@/lib/habit-view";
import { MANILA_TZ } from "@/lib/date";

/**
 * Progress aggregation: history, derived on read.
 *
 * Every series here comes from records the app was ALREADY writing and never
 * showing back — completed-task timestamps, focus session durations, habit
 * entries. Nothing new is stored and nothing is recomputed into the database
 * (CLAUDE.md section 7). Pure and `now`-injectable so the boundaries are
 * unit-tested rather than eyeballed.
 */

export type DayPoint = { date: IsoDate; value: number };
export type WeekPoint = { weekStart: IsoDate; label: string; value: number; total: number };

/** Inclusive list of local dates, oldest first. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * Tasks completed per local day.
 *
 * Keyed off `completedAt` (a real instant) resolved into the user's zone, NOT
 * off `scheduledFor`: the question is "what did I finish that day", which is a
 * different question from "what was planned for it".
 */
export function completionsByDay(params: {
  tasks: Task[];
  from: IsoDate;
  to: IsoDate;
  timeZone?: string;
}): DayPoint[] {
  const timeZone = params.timeZone ?? MANILA_TZ;
  const counts = new Map<IsoDate, number>();
  for (const task of params.tasks) {
    if (task.status !== "completed" || !task.completedAt) continue;
    const day = toZonedDate(task.completedAt, timeZone);
    if (day < params.from || day > params.to) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return dateRange(params.from, params.to).map((date) => ({
    date,
    value: counts.get(date) ?? 0,
  }));
}

/** Focus minutes per local day, from persisted session durations. */
export function focusMinutesByDay(params: {
  sessions: FocusSession[];
  from: IsoDate;
  to: IsoDate;
}): DayPoint[] {
  const seconds = new Map<IsoDate, number>();
  for (const session of params.sessions) {
    const day = session.sessionDate;
    if (!day || day < params.from || day > params.to) continue;
    seconds.set(day, (seconds.get(day) ?? 0) + (session.durationSeconds ?? 0));
  }
  return dateRange(params.from, params.to).map((date) => ({
    date,
    value: Math.round((seconds.get(date) ?? 0) / 60),
  }));
}

/**
 * Just the day of the month.
 *
 * A "Aug 10" label truncated to "Au..." on every bar once twelve weeks share a
 * half-width card, which is worse than no label. The card header carries the
 * full range instead, so the axis stays readable at any width.
 */
function weekLabel(weekStart: IsoDate): string {
  return String(Number(weekStart.split("-")[2]));
}

/** Roll daily points into ISO weeks, oldest first. */
export function byWeek(
  points: DayPoint[],
  weekStartsOn: Weekday = 1,
): WeekPoint[] {
  const weeks = new Map<IsoDate, number>();
  for (const point of points) {
    const start = startOfWeek(point.date, weekStartsOn);
    weeks.set(start, (weeks.get(start) ?? 0) + point.value);
  }
  const total = [...weeks.values()].reduce((sum, v) => sum + v, 0);
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([weekStart, value]) => ({ weekStart, label: weekLabel(weekStart), value, total }));
}

export type HeatCell = {
  date: IsoDate;
  /** Habits completed that day. */
  done: number;
  /** Habits scheduled that day. 0 means nothing was due. */
  scheduled: number;
  /** 0-4, for the colour ramp. 0 is "nothing due or nothing done". */
  level: 0 | 1 | 2 | 3 | 4;
};

/**
 * A GitHub-style habit heatmap: one cell per day, intensity = share of that
 * day's scheduled habits actually completed.
 *
 * Uses the SAME `buildHabitViews` the Habits screen uses, so a day can never
 * read as missed here and done there. Days before a habit existed are not
 * scheduled at all, so a new habit does not paint the past grey.
 */
export function habitHeatmap(params: {
  habits: HabitWithSchedule[];
  entries: HabitEntry[];
  from: IsoDate;
  to: IsoDate;
  today: IsoDate;
  weekStartsOn?: Weekday;
  timeZone?: string;
}): HeatCell[] {
  const views = buildHabitViews({
    habits: params.habits,
    entries: params.entries,
    today: params.today,
    weekStartsOn: params.weekStartsOn ?? 1,
    timeZone: params.timeZone,
  });

  // One pass over entries, keyed by habit+date, so the per-day loop is cheap.
  const doneKeys = new Set<string>();
  for (const view of views) {
    for (const cell of view.weekCells) {
      if (cell.state === "done") doneKeys.add(`${view.habit.id}|${cell.date}`);
    }
  }
  // weekCells only covers the current week, so fall back to the raw entries for
  // the wider window the heatmap spans.
  const outcomeByKey = new Map<string, string>();
  for (const entry of params.entries) {
    outcomeByKey.set(`${entry.habitId}|${entry.entryDate}`, entry.status);
  }

  const scheduleOf = new Map(views.map((v) => [v.habit.id, v.schedule]));

  return dateRange(params.from, params.to).map((date) => {
    let done = 0;
    let scheduled = 0;
    for (const view of views) {
      const schedule = scheduleOf.get(view.habit.id);
      if (!schedule) continue;
      if (schedule.startDate && date < schedule.startDate) continue;
      const weekdayScoped = schedule.frequency === "weekly" && schedule.daysOfWeek?.length;
      if (weekdayScoped) {
        const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
        if (!schedule.daysOfWeek!.includes(weekday)) continue;
      }
      scheduled += 1;
      const key = `${view.habit.id}|${date}`;
      if (doneKeys.has(key) || outcomeByKey.get(key) === "done") done += 1;
    }

    const ratio = scheduled === 0 ? 0 : done / scheduled;
    const level: HeatCell["level"] =
      done === 0 ? 0 : ratio >= 1 ? 4 : ratio >= 0.66 ? 3 : ratio >= 0.34 ? 2 : 1;
    return { date, done, scheduled, level };
  });
}

export type ProgressSummary = {
  tasksCompleted: number;
  tasksCompletedPrev: number;
  focusMinutes: number;
  focusMinutesPrev: number;
  habitRate: number;
  habitRatePrev: number;
  bestStreak: number;
  activeGoals: number;
};

/** Percentage change vs the previous window; null when there is no baseline. */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Share of scheduled habit-days actually completed across a window, 0-100. */
export function habitCompletionRate(cells: HeatCell[]): number {
  let done = 0;
  let scheduled = 0;
  for (const cell of cells) {
    done += cell.done;
    scheduled += cell.scheduled;
  }
  return scheduled === 0 ? 0 : Math.round((done / scheduled) * 100);
}
