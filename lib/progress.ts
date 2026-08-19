import type { FocusSession, HabitEntry, Task } from "@/db";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import { addDays, startOfWeek, toZonedDate, type IsoDate, type Weekday } from "@/lib/date";
import {
  countsTowardExpected,
  habitOutcome,
  isCompleteOutcome,
} from "@/lib/habit-outcome";
import { isDayScheduled } from "@/lib/habit-streaks";
import { buildHabitViews } from "@/lib/habit-view";
import { toNumberOrNull } from "@/lib/habits";
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
 * Uses the SAME schedule predicate and the SAME outcome definition as Habits,
 * Today and Calendar (audit R-06), so a day can never read as missed here and
 * done there. Days before a habit existed are not scheduled at all, so a new
 * habit does not paint the past grey.
 *
 * Two things this used to get wrong across the wide window it spans:
 *
 *  - `done` was taken from the raw entry status, so a numeric habit logged
 *    BELOW its target counted as a completion. It resolves to `partial` now,
 *    and partial is not a completion.
 *  - The schedule test was open-coded and understood only weekly-with-days, so
 *    monthly and "X times per week" habits were treated as due every single
 *    day. That inflated the denominator on every cell.
 *
 * Both change the numbers the Progress and Review screens show. They are now
 * the numbers those screens always claimed to be showing.
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

  // One pass over the entries, so the per-day loop below stays a lookup.
  const entryByKey = new Map(
    params.entries.map((entry) => [`${entry.habitId}|${entry.entryDate}`, entry]),
  );

  // Measurement rules per habit, hoisted out of the day loop.
  const measures = views.map((view) => ({
    id: view.habit.id,
    schedule: view.schedule,
    measure: {
      type: view.habit.type,
      targetValue: toNumberOrNull(view.habit.targetValue),
      higherIsBetter: view.habit.higherIsBetter,
    },
  }));

  return dateRange(params.from, params.to).map((date) => {
    let done = 0;
    let scheduled = 0;
    for (const { id, schedule, measure } of measures) {
      const entry = entryByKey.get(`${id}|${date}`);
      const scheduledForDate = isDayScheduled(schedule, date);
      const outcome = habitOutcome({
        habit: measure,
        entry: entry ? { status: entry.status, value: toNumberOrNull(entry.value) } : null,
        scheduled: scheduledForDate,
        date,
        today: params.today,
      });
      if (!countsTowardExpected(outcome)) continue;
      scheduled += 1;
      if (isCompleteOutcome(outcome)) done += 1;
    }

    const ratio = scheduled === 0 ? 0 : done / scheduled;
    const level: HeatCell["level"] =
      done === 0 ? 0 : ratio >= 1 ? 4 : ratio >= 0.66 ? 3 : ratio >= 0.34 ? 2 : 1;
    return { date, done, scheduled, level };
  });
}

/** Heat cells rolled into weeks, for the heatmap's tabular equivalent. */
export function heatWeeks(
  cells: HeatCell[],
  weekStartsOn: Weekday = 1,
): { weekStart: IsoDate; done: number; scheduled: number }[] {
  const weeks = new Map<IsoDate, { done: number; scheduled: number }>();
  for (const cell of cells) {
    const start = startOfWeek(cell.date, weekStartsOn);
    const week = weeks.get(start) ?? { done: 0, scheduled: 0 };
    week.done += cell.done;
    week.scheduled += cell.scheduled;
    weeks.set(start, week);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([weekStart, week]) => ({ weekStart, ...week }));
}

export type Window = { from: IsoDate; to: IsoDate };

/** Days covered by an inclusive window. */
export function windowDays(window: Window): number {
  let days = 0;
  for (let d = window.from; d <= window.to; d = addDays(d, 1)) days += 1;
  return days;
}

/**
 * The window immediately before this one, of exactly the same length (audit
 * R-18).
 *
 * The comparison used to be "twelve whole weeks" against "eleven whole weeks
 * plus however much of this one has happened". Every "vs previous" figure on
 * the screen was therefore biased downwards, hardest on a Monday, and the
 * screen never said so. Same number of days on both sides, or the number is
 * not a comparison.
 */
export function previousWindow(window: Window): Window {
  const days = windowDays(window);
  return { from: addDays(window.from, -days), to: addDays(window.from, -1) };
}

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
