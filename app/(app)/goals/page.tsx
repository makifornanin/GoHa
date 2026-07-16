import { GoalsView } from "@/components/goals/goals-view";
import { goalsRepo, lifeAreasRepo } from "@/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  // Identity from the session; both queries are user-scoped in the repositories.
  const user = await requireUser();
  const [goals, lifeAreas] = await Promise.all([
    goalsRepo.listGoalsWithTaskCounts(user.id),
    lifeAreasRepo.listLifeAreas(user.id),
  ]);

  return <GoalsView goals={goals} lifeAreas={lifeAreas} />;
}
