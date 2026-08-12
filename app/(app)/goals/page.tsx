import { GoalsView } from "@/components/goals/goals-view";
import { goalsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  // Identity from the session; every query is user-scoped in the repositories.
  const user = await requireUser();
  const [goals, lifeAreas, tasks] = await Promise.all([
    goalsRepo.listGoalsWithTaskCounts(user.id),
    lifeAreasRepo.listLifeAreas(user.id),
    // The detail panel shows the tasks actually driving each goal's progress.
    tasksRepo.listTasksForUser(user.id),
  ]);

  return <GoalsView goals={goals} lifeAreas={lifeAreas} tasks={tasks} />;
}
