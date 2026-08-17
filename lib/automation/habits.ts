import type { IsoDate } from "@/lib/date";
import type { HabitView } from "@/lib/habit-view";

/**
 * The habit half of the automation surface: what is still open today, and which
 * of those is protecting a streak.
 *
 * The guide's two most valuable habit automations are "an evening check that
 * sends nothing unless something is unchecked" and "rescue a streak of three or
 * more before it breaks". Both need the same answer, and neither should
 * recompute it in SQL: the schedule rules and the outcome rules are shared code
 * (audit R-06), so a day cannot read as due here and unscheduled in the app.
 *
 * Pure: the caller supplies the views that Habits, Today, Calendar and Progress
 * all build from.
 */

/** A streak worth interrupting an evening for. Below this, silence is better. */
export const STREAK_AT_RISK_MINIMUM = 3;

export type HabitDue = {
  id: string;
  name: string;
  /** "pending" (not logged yet) or "partial" (logged, short of target). */
  state: "pending" | "partial";
  currentStreak: number;
  /** True when a real, established streak ends tonight if nothing happens. */
  streakAtRisk: boolean;
  targetValue: number | null;
  unit: string | null;
};

export type HabitsDuePayload = {
  date: IsoDate;
  timeZone: string;
  generatedAt: string;
  scheduledToday: number;
  doneToday: number;
  due: HabitDue[];
  atRisk: HabitDue[];
  /** Nothing outstanding: send nothing. */
  quiet: boolean;
};

export function toHabitsDuePayload(params: {
  views: HabitView[];
  today: IsoDate;
  timeZone: string;
  now: Date;
  streakMinimum?: number;
}): HabitsDuePayload {
  const minimum = params.streakMinimum ?? STREAK_AT_RISK_MINIMUM;
  const scheduled = params.views.filter((view) => view.scheduledToday);

  const due: HabitDue[] = [];
  let doneToday = 0;

  for (const view of scheduled) {
    if (view.todayState === "done") {
      doneToday += 1;
      continue;
    }
    // "skip" is a deliberate, neutral decision by the owner. Chasing it
    // would be arguing with a choice that has already been made.
    if (view.todayState !== "pending" && view.todayState !== "partial") continue;

    const currentStreak = view.streaks.current;
    due.push({
      id: view.habit.id,
      name: view.habit.name,
      state: view.todayState,
      currentStreak,
      streakAtRisk: currentStreak >= minimum,
      targetValue: view.habit.targetValue === null ? null : Number(view.habit.targetValue),
      unit: view.habit.unit,
    });
  }

  due.sort((a, b) => b.currentStreak - a.currentStreak || a.name.localeCompare(b.name));

  return {
    date: params.today,
    timeZone: params.timeZone,
    generatedAt: params.now.toISOString(),
    scheduledToday: scheduled.length,
    doneToday,
    due,
    atRisk: due.filter((habit) => habit.streakAtRisk),
    quiet: due.length === 0,
  };
}
