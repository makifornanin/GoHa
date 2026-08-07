import { DateRolloverRefresh } from "@/components/date-rollover-refresh";
import { TodayView } from "@/components/today/today-view";
import { dailyPrioritiesRepo, goalsRepo, habitsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { formatManilaLongDate, zonedPartOfDay, zonedToday } from "@/lib/date";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  // Identity from the session; every query below is user-scoped in the repos.
  const user = await requireUser();
  const { timeZone } = await getUserDatePrefs(user.id);

  const now = new Date();
  const today = zonedToday(now, timeZone);

  const [tasks, goals, priorities, habits, habitEntries, lifeAreas] = await Promise.all([
    tasksRepo.listTasksForUser(user.id),
    goalsRepo.listGoalsWithTaskCounts(user.id),
    dailyPrioritiesRepo.listDailyPriorities(user.id, today),
    habitsRepo.listHabitsWithSchedule(user.id),
    habitsRepo.listHabitEntriesForDate(user.id, today),
    // Life areas carry the colour that everything below them inherits.
    lifeAreasRepo.listLifeAreas(user.id),
  ]);

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
        tasks={tasks}
        goals={goals}
        priorities={priorities}
        habits={habits}
        habitEntries={habitEntries}
        lifeAreas={lifeAreas}
      />
    </>
  );
}
