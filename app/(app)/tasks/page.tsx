import { TasksView } from "@/components/tasks/tasks-view";
import { goalsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "To-dos" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  // Identity from the session; every query is user-scoped in the repositories.
  const user = await requireUser();
  const [{ timeZone, weekStartsOn }, { new: newParam }] = await Promise.all([
    getUserDatePrefs(user.id),
    searchParams,
  ]);
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
      // `/tasks?new=1` opens the create form straight away, so the shell's
      // "Add Task" / "Quick Action" / mobile "+" actually open a form.
      openCreateOnMount={newParam === "1"}
    />
  );
}
