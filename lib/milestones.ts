import type { HabitEntry } from "@/db";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import type { Weekday } from "@/lib/date";
import { buildHabitViews } from "@/lib/habit-view";

/**
 * What counts as worth celebrating.
 *
 * Deliberately short. A milestone that fires often is not a milestone, it is a
 * notification, and the fastest way to make a reward meaningless is to hand it
 * out every day. A goal reaching 100% is handled server-side (progress is
 * derived, so only the server can see the crossing); habit streaks are decided
 * here because the client already holds every entry it needs.
 */
export const STREAK_MILESTONES = [7, 30] as const;

export function isStreakMilestone(days: number): boolean {
  return (STREAK_MILESTONES as readonly number[]).includes(days);
}

/**
 * The streak a single habit would have if `entry` were its log for today.
 *
 * Computed from the entry set the optimistic update is about to produce, not
 * from a re-render, so the check happens exactly once at the moment of logging
 * and never fires again on an unrelated re-render. Scoped to one habit so the
 * cost is a single streak walk, not a full rebuild.
 */
export function streakAfterLogging(params: {
  habit: HabitWithSchedule;
  entries: HabitEntry[];
  entry: HabitEntry;
  today: string;
  weekStartsOn?: Weekday;
  timeZone?: string;
}): number {
  const withoutToday = params.entries.filter(
    (e) => !(e.habitId === params.habit.id && e.entryDate === params.today),
  );
  const [view] = buildHabitViews({
    habits: [params.habit],
    entries: [...withoutToday, params.entry],
    today: params.today,
    weekStartsOn: params.weekStartsOn ?? 1,
    timeZone: params.timeZone,
  });
  return view?.streaks.current ?? 0;
}
