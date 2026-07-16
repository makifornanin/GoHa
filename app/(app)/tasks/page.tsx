import { TasksView } from "@/components/tasks/tasks-view";
import { goalsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "To-dos" };

export default async function TasksPage() {
  // Identity from the session; every query is user-scoped in the repositories.
  const user = await requireUser();
  const { timeZone, weekStartsOn } = await getUserDatePrefs(user.id);
  const [tasks, goals, lifeAreas] = await Promise.all([
    tasksRepo.listTasksForUser(user.id),
    goalsRepo.listGoals(user.id),
    lifeAreasRepo.listLifeAreas(user.id),
  ]);

  return (
    <TasksView
      tasks={tasks}
      goals={goals}
      lifeAreas={lifeAreas}
      timeZone={timeZone}
      weekStartsOn={weekStartsOn}
    />
  );
}
