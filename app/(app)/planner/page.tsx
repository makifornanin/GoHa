import { DateRolloverRefresh } from "@/components/date-rollover-refresh";
import { PlannerView } from "@/components/planner/planner-view";
import { goalsRepo, lifeAreasRepo, plannerRepo, tasksRepo } from "@/db";
import { addDays, formatManilaLongDate, zonedToday } from "@/lib/date";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Day Planner" };

/**
 * The 24-hour Day Planner.
 *
 * Today by default, with tomorrow one click away, because the two moments
 * people plan are "now, before I start" and "tonight, for the morning".
 * Anything further out is a calendar, and this is deliberately not one.
 */
export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [user, { date }] = await Promise.all([requireUser(), searchParams]);
  const { timeZone, weekStartsOn } = await getUserDatePrefs(user.id);

  const today = zonedToday(new Date(), timeZone);
  const tomorrow = addDays(today, 1);
  // Only today or tomorrow are addressable. A stray `?date=` falls back to
  // today rather than rendering a day the UI has no controls for.
  const planDate = date === tomorrow ? tomorrow : today;

  const [contents, lifeAreas, tasks, goals] = await Promise.all([
    plannerRepo.getPlanContents(user.id, planDate),
    lifeAreasRepo.listLifeAreas(user.id),
    tasksRepo.listTasksForUser(user.id),
    goalsRepo.listGoalsWithTaskCounts(user.id),
  ]);

  return (
    <>
      {/* Resolved on the server, so a tab left open past midnight stops
          planning yesterday. */}
      <DateRolloverRefresh today={today} timeZone={timeZone} />
      <PlannerView
        planDate={planDate}
        today={today}
        tomorrow={tomorrow}
        dateLabel={formatManilaLongDate(planDate) ?? planDate}
        allocations={contents?.allocations ?? []}
        items={contents?.items ?? []}
        lifeAreas={lifeAreas}
        tasks={tasks}
        goals={goals.map((goal) => ({
          id: goal.id,
          title: goal.title,
          status: goal.status,
          lifeAreaId: goal.lifeAreaId,
        }))}
        timeZone={timeZone}
        weekStartsOn={weekStartsOn}
      />
    </>
  );
}
