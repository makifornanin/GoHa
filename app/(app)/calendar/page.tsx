import {
  CalendarView,
  type CalendarData,
  type FocusDay,
  type HabitDay,
} from "@/components/calendar/calendar-view";
import { focusRepo, habitsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { addDays, zonedToday } from "@/lib/date";
import { habitOutcome } from "@/lib/habit-outcome";
import { isDayScheduled } from "@/lib/habit-streaks";
import { buildHabitViews } from "@/lib/habit-view";
import { toNumberOrNull } from "@/lib/habits";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Calendar" };

/**
 * A window wide enough to cover the month being viewed plus a month either
 * side, so paging back and forth does not refetch on every click.
 */
const WINDOW_DAYS = 62;

export default async function CalendarPage() {
  // Identity from the session; every query is user-scoped in the repositories.
  const user = await requireUser();
  const { timeZone, weekStartsOn } = await getUserDatePrefs(user.id);
  const today = zonedToday(new Date(), timeZone);
  const from = addDays(today, -WINDOW_DAYS);
  const to = addDays(today, WINDOW_DAYS);

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
   * Two things changed here. The outcome came from `entry.status === "done"`,
   * which counted a numeric habit logged BELOW its target as a completion; it
   * now goes through lib/habit-outcome, so those days read as `partial`. And
   * schedule matching was open-coded, handling only weekly-with-days and
   * silently treating monthly and times-per-week habits as due every day; it now
   * calls isDayScheduled, the same predicate the streak walker uses.
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
  };

  return <CalendarView data={data} />;
}
