import { GoalsView } from "@/components/goals/goals-view";
import { goalsRepo, lifeAreasRepo } from "@/db";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "Goals" };

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; parentGoalId?: string; lifeAreaId?: string }>;
}) {
  // Identity from the session; every query is user-scoped in the repositories.
  const user = await requireUser();
  const [{ timeZone, weekStartsOn }, { new: newParam, parentGoalId, lifeAreaId }] =
    await Promise.all([getUserDatePrefs(user.id), searchParams]);
  const [goals, lifeAreas] = await Promise.all([
    goalsRepo.listGoalsWithTaskCounts(user.id),
    lifeAreasRepo.listLifeAreas(user.id),
  ]);

  return (
    <GoalsView
      goals={goals}
      lifeAreas={lifeAreas}
      timeZone={timeZone}
      weekStartsOn={weekStartsOn}
      // `?new=1` opens the create form straight away, so "+ Add > Goal" from
      // anywhere in the shell actually opens a form rather than just landing
      // on the board. Ownership of the prefilled ids is re-checked on submit.
      openCreateOnMount={newParam === "1"}
      defaultParentGoalId={parentGoalId}
      defaultLifeAreaId={lifeAreaId}
    />
  );
}
