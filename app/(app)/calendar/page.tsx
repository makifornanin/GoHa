import {
  CalendarView,
  type CalendarData,
  type FocusDay,
  type HabitDay,
} from "@/components/calendar/calendar-view";
import { focusRepo, habitsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { monthGridRange, parseMonthAnchor } from "@/lib/calendar";
import { addDays, zonedToday } from "@/lib/date";
import { habitOutcome } from "@/lib/habit-outcome";
import { isDayScheduled } from "@/lib/habit-streaks";
import { buildHabitViews } from "@/lib/habit-view";
import { toNumberOrNull } from "@/lib/habits";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Calendar" };

/**
 * The viewed month drives the query (audit R-07).
 *
 * This used to fetch a fixed +/-62 day window around TODAY, once, while month
 * navigation was unlimited client-side. Paging three months out therefore
 * rendered a month with no habits and no focus time, with nothing to say the
 * data had simply not been fetched. The month now lives in `?month=`, exactly
 * as the Review screen puts its week in `?week=`, so the server always fetches
 * precisely the 42 days the grid is about to draw.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // Identity from the session; every query is user-scoped in the repositories.
  const user = await requireUser();
  const [{ timeZone, weekStartsOn }, { month }] = await Promise.all([
    getUserDatePrefs(user.id),
    searchParams,
  ]);

  const today = zonedToday(new Date(), timeZone);
  const anchor = parseMonthAnchor(month, today);
  const { start: from, end: to } = monthGridRange(anchor, weekStartsOn);

  const [tasks, habits, entries, sessions, lifeAreas] = await Promise.all([
    tasksRepo.listTasksForUser(user.id),
    habitsRepo.listHabitsWithSchedule(user.id),
    habitsRepo.listEntriesInRange(user.id, { from, to }),
    focusRepo.listCompletedSessionsInRange(user.id, { from, to }),
    lifeAreasRepo.listLifeAreas(user.id),
  ]);

  /**
   * Habit occurrences per day, resolved on the server through the SAME schedule
   * rules and the SAME outcome definition the Habits screen uses, so a day
   * cannot read as scheduled here and unscheduled there, or done here and
   * partial there (audit R-06).
   *
   * `buildHabitViews` is kept for its schedule normalisation (it supplies the
   * created-at floor a habit with no explicit start date needs). Its streak
   * numbers are not meaningful over a 42-day window and are not read here.
   */
  const views = buildHabitViews({ habits, entries, today, weekStartsOn, timeZone });
  const entryByKey = new Map(entries.map((e) => [`${e.habitId}|${e.entryDate}`, e]));

  const habitDays: HabitDay[] = [];
  for (const view of views) {
    const measure = {
      type: view.habit.type,
      targetValue: toNumberOrNull(view.habit.targetValue),
      higherIsBetter: view.habit.higherIsBetter,
    };
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (!isDayScheduled(view.schedule, date)) continue;
      const entry = entryByKey.get(`${view.habit.id}|${date}`);
      habitDays.push({
        date,
        habitId: view.habit.id,
        name: view.habit.name,
        outcome: habitOutcome({
          habit: measure,
          entry: entry ? { status: entry.status, value: toNumberOrNull(entry.value) } : null,
          scheduled: true,
          date,
          today,
        }),
        color: view.habit.color,
      });
    }
  }

  const focusMap = new Map<string, FocusDay>();
  for (const session of sessions) {
    const seconds = session.durationSeconds ?? 0;
    if (seconds <= 0) continue;
    const existing = focusMap.get(session.sessionDate);
    if (existing) {
      existing.seconds += seconds;
      existing.sessions += 1;
    } else {
      focusMap.set(session.sessionDate, { date: session.sessionDate, seconds, sessions: 1 });
    }
  }

  const data: CalendarData = {
    tasks,
    habitDays,
    focusDays: [...focusMap.values()],
    lifeAreas,
    today,
    weekStartsOn,
    // The month being rendered, and the zone every date on it was resolved in.
    anchor,
    gridStart: from,
    gridEnd: to,
    timeZone,
  };

  return <CalendarView data={data} />;
}
