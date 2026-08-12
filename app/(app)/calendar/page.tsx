import {
  CalendarView,
  type CalendarData,
  type FocusDay,
  type HabitDay,
} from "@/components/calendar/calendar-view";
import { focusRepo, habitsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { addDays, zonedToday } from "@/lib/date";
import { buildHabitViews } from "@/lib/habit-view";
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
   * Habit occurrences per day, resolved on the server from the SAME schedule
   * rules the Habits screen uses, so a day cannot read as scheduled here and
   * unscheduled there. Only the current week's cells come with a resolved
   * state, so past and future days fall back to the raw entry.
   */
  const views = buildHabitViews({ habits, entries, today, weekStartsOn, timeZone });
  const doneKey = new Set(
    entries.filter((e) => e.status === "done").map((e) => `${e.habitId}|${e.entryDate}`),
  );

  const habitDays: HabitDay[] = [];
  for (const view of views) {
    const schedule = view.schedule;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (schedule.startDate && date < schedule.startDate) continue;
      if (schedule.frequency === "weekly" && schedule.daysOfWeek?.length) {
        const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
        if (!schedule.daysOfWeek.includes(weekday)) continue;
      }
      habitDays.push({
        date,
        habitId: view.habit.id,
        name: view.habit.name,
        done: doneKey.has(`${view.habit.id}|${date}`),
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
