import { DateRolloverRefresh } from "@/components/date-rollover-refresh";
import { HabitsView } from "@/components/habits/habits-view";
import { goalsRepo, habitsRepo, lifeAreasRepo } from "@/db";
import { addDays, zonedToday } from "@/lib/date";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Habits" };

export default async function HabitsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; goalId?: string; lifeAreaId?: string }>;
}) {
  // Identity from the session; every query is user-scoped in the repositories.
  const user = await requireUser();
  const [{ timeZone, weekStartsOn }, { new: newParam, goalId, lifeAreaId }] = await Promise.all([
    getUserDatePrefs(user.id),
    searchParams,
  ]);
  const today = zonedToday(new Date(), timeZone);

  const [habits, entries, lifeAreas, goals] = await Promise.all([
    habitsRepo.listHabitsWithSchedule(user.id),
    // A wide window so streaks and the weekly grid have the history they need.
    habitsRepo.listEntriesInRange(user.id, { from: addDays(today, -370), to: today }),
    lifeAreasRepo.listLifeAreas(user.id),
    goalsRepo.listGoals(user.id),
  ]);

  return (
    <>
      {/* "today" is resolved on the server; keep it honest past midnight. */}
      <DateRolloverRefresh today={today} timeZone={timeZone} />
      <HabitsView
        habits={habits}
        entries={entries}
        lifeAreas={lifeAreas}
        goals={goals}
        today={today}
        timeZone={timeZone}
        weekStartsOn={weekStartsOn}
        // `?new=1` opens the create form straight away, so "+ Add > Habit"
        // actually opens a form. Ownership of the prefilled ids is re-checked
        // server-side on submit.
        openCreateOnMount={newParam === "1"}
        defaultGoalId={goalId}
        defaultLifeAreaId={lifeAreaId}
      />
    </>
  );
}
