import { DateRolloverRefresh } from "@/components/date-rollover-refresh";
import { TodayView } from "@/components/today/today-view";
import type { MomentumData } from "@/components/today/momentum-card";
import {
  dailyPrioritiesRepo,
  focusRepo,
  goalsRepo,
  habitsRepo,
  lifeAreasRepo,
  tasksRepo,
} from "@/db";
import {
  addDays,
  formatManilaLongDate,
  getZonedParts,
  zonedPartOfDay,
  zonedToday,
} from "@/lib/date";
import { buildHabitViews } from "@/lib/habit-view";
import { completionsByDay } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Today" };

/** Two weeks: this week's sparkline plus the week before it to compare against. */
const MOMENTUM_DAYS = 14;

export default async function TodayPage() {
  // Identity from the session; every query below is user-scoped in the repos.
  const user = await requireUser();
  const { timeZone, weekStartsOn } = await getUserDatePrefs(user.id);

  const now = new Date();
  const today = zonedToday(now, timeZone);
  const momentumFrom = addDays(today, -(MOMENTUM_DAYS - 1));

  const [tasks, subtasks, goals, priorities, habits, habitEntries, lifeAreas, focusSessions] =
    await Promise.all([
      tasksRepo.listTasksForUser(user.id),
      tasksRepo.listSubtasksForUser(user.id),
      goalsRepo.listGoalsWithTaskCounts(user.id),
      dailyPrioritiesRepo.listDailyPriorities(user.id, today),
      habitsRepo.listHabitsWithSchedule(user.id),
      // A wider window than today alone: streaks and the momentum sparkline
      // need history, and today's check-in list is derived from the same rows.
      habitsRepo.listEntriesInRange(user.id, { from: addDays(today, -400), to: today }),
      // Life areas carry the colour that everything below them inherits.
      lifeAreasRepo.listLifeAreas(user.id),
      focusRepo.listCompletedSessionsInRange(user.id, { from: momentumFrom, to: today }),
    ]);

  // --- Momentum, derived from records already written elsewhere ---
  const views = buildHabitViews({ habits, entries: habitEntries, today, weekStartsOn, timeZone });
  const bestCurrent = views.reduce(
    (best, v) => (v.streaks.current > best.days ? { days: v.streaks.current, name: v.habit.name } : best),
    { days: 0, name: null as string | null },
  );

  const daily = completionsByDay({ tasks, from: momentumFrom, to: today, timeZone });
  const weekCompletions = daily.slice(-7).map((d) => d.value);
  const weekTotal = weekCompletions.reduce((sum, v) => sum + v, 0);
  const prevWeekTotal = daily.slice(0, 7).reduce((sum, d) => sum + d.value, 0);

  let focusSecondsToday = 0;
  let focusSecondsWeek = 0;
  const weekStart = addDays(today, -6);
  for (const session of focusSessions) {
    const seconds = session.durationSeconds ?? 0;
    if (seconds <= 0) continue;
    if (session.sessionDate >= weekStart) focusSecondsWeek += seconds;
    if (session.sessionDate === today) focusSecondsToday += seconds;
  }

  const momentum: MomentumData = {
    streakDays: bestCurrent.days,
    streakHabit: bestCurrent.days > 0 ? bestCurrent.name : null,
    weekCompletions,
    weekTotal,
    prevWeekTotal,
    focusSecondsToday,
    focusSecondsWeek,
  };

  // Today's habit check-ins read from the same wide entry set, filtered locally.
  const todaysEntries = habitEntries.filter((e) => e.entryDate === today);

  return (
    <>
      {/* "today" is resolved here, on the server. Without this a tab left open
          past midnight keeps rendering yesterday's dashboard. */}
      <DateRolloverRefresh today={today} timeZone={timeZone} />
      <TodayView
        userName={user.name.split(" ")[0] || user.name}
        greetingPart={zonedPartOfDay(now, timeZone)}
        dateLabel={formatManilaLongDate(today) ?? ""}
        today={today}
        timeZone={timeZone}
        hour={getZonedParts(now, timeZone).hour}
        tasks={tasks}
        subtasks={subtasks}
        goals={goals}
        priorities={priorities}
        habits={habits}
        habitEntries={todaysEntries}
        allHabitEntries={habitEntries}
        weekStartsOn={weekStartsOn}
        lifeAreas={lifeAreas}
        momentum={momentum}
      />
    </>
  );
}
