import { ProgressView, type ProgressData } from "@/components/progress/progress-view";
import { focusRepo, goalsRepo, habitsRepo, tasksRepo } from "@/db";
import { addDays, formatIsoDateMedium, startOfWeek, zonedToday } from "@/lib/date";
import { buildHabitViews } from "@/lib/habit-view";
import {
  byWeek,
  completionsByDay,
  focusMinutesByDay,
  habitCompletionRate,
  habitHeatmap,
} from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Progress" };

/** Twelve weeks back: long enough to show a trend, short enough to stay legible. */
const WEEKS_SHOWN = 12;
/**
 * The heatmap reaches further back than the bar charts. Twelve columns of 3px
 * cells left it marooned in a full-width card; half a year fills the row and is
 * the scale the pattern is actually readable at.
 */
const HEATMAP_WEEKS = 26;

export default async function ProgressPage() {
  // Identity from the session; every query is user-scoped in the repositories.
  const user = await requireUser();
  const { timeZone, weekStartsOn } = await getUserDatePrefs(user.id);
  const today = zonedToday(new Date(), timeZone);

  // The visible window, plus an equal window before it to compare against.
  const windowStart = startOfWeek(addDays(today, -7 * (WEEKS_SHOWN - 1)), weekStartsOn);
  const priorStart = addDays(windowStart, -7 * WEEKS_SHOWN);
  const priorEnd = addDays(windowStart, -1);
  const heatStart = startOfWeek(addDays(today, -7 * (HEATMAP_WEEKS - 1)), weekStartsOn);
  // One fetch wide enough for every window on the page.
  const earliest = heatStart < priorStart ? heatStart : priorStart;

  const [tasks, habits, entries, sessions, goals] = await Promise.all([
    tasksRepo.listTasksForUser(user.id),
    habitsRepo.listHabitsWithSchedule(user.id),
    habitsRepo.listEntriesInRange(user.id, { from: earliest, to: today }),
    focusRepo.listCompletedSessionsInRange(user.id, { from: earliest, to: today }),
    goalsRepo.listGoalsWithTaskCounts(user.id),
  ]);

  const completions = completionsByDay({ tasks, from: windowStart, to: today, timeZone });
  const prevCompletions = completionsByDay({ tasks, from: priorStart, to: priorEnd, timeZone });
  // Minutes for the weekly bars only. The comparison totals use real seconds
  // (see `focusSecondsBetween` below), so there is no prior-window minute series.
  const focusDaily = focusMinutesByDay({ sessions, from: windowStart, to: today });

  const heatmap = habitHeatmap({
    habits,
    entries,
    from: heatStart,
    to: today,
    today,
    weekStartsOn,
    timeZone,
  });
  const prevHeatmap = habitHeatmap({
    habits,
    entries,
    from: priorStart,
    to: priorEnd,
    today,
    weekStartsOn,
    timeZone,
  });

  const views = buildHabitViews({ habits, entries, today, weekStartsOn, timeZone });
  const bestStreak = views.reduce((max, v) => Math.max(max, v.streaks.longest), 0);

  const sum = (points: { value: number }[]) => points.reduce((total, p) => total + p.value, 0);

  /**
   * Real seconds off the sessions, NOT rounded minutes multiplied back up.
   * `focusMinutesByDay` rounds for the weekly chart, which is right for a bar
   * per week and wrong for a total: a 40-second session rounded to 0 minutes
   * made this screen report "0s" and "No focus sessions recorded yet" while
   * Today's Momentum card, reading the same rows in seconds, said otherwise.
   */
  const focusSecondsBetween = (from: string, to: string) =>
    sessions.reduce(
      (total, session) =>
        session.sessionDate && session.sessionDate >= from && session.sessionDate <= to
          ? total + (session.durationSeconds ?? 0)
          : total,
      0,
    );
  const focusSeconds = focusSecondsBetween(windowStart, today);

  const data: ProgressData = {
    weeklyCompletions: byWeek(completions, weekStartsOn),
    weeklyFocusMinutes: byWeek(focusDaily, weekStartsOn),
    dailyFocusMinutes: focusDaily,
    heatmap,
    today,
    weekStartsOn,
    rangeLabel: `${formatIsoDateMedium(windowStart)} – ${formatIsoDateMedium(today)}`,
    heatmapRangeLabel: `${formatIsoDateMedium(heatStart)} – ${formatIsoDateMedium(today)}`,
    summary: {
      tasksCompleted: sum(completions),
      tasksCompletedPrev: sum(prevCompletions),
      focusSeconds,
      focusSecondsPrev: focusSecondsBetween(priorStart, priorEnd),
      habitRate: habitCompletionRate(heatmap),
      habitRatePrev: habitCompletionRate(prevHeatmap),
      bestStreak,
      activeGoals: goals.filter((g) => g.status === "active").length,
      goalsCompleted: goals.filter((g) => g.status === "completed").length,
    },
    // An empty page must say "nothing yet", not draw twelve empty weeks.
    hasAnyHistory:
      sum(completions) > 0 ||
      focusSeconds > 0 ||
      heatmap.some((c) => c.done > 0) ||
      sum(prevCompletions) > 0,
  };

  return <ProgressView data={data} />;
}
