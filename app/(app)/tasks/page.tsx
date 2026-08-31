import { TasksView } from "@/components/tasks/tasks-view";
import { goalsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

export const metadata = { title: "To-dos" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    new?: string;
    goalId?: string;
    lifeAreaId?: string;
    parentTaskId?: string;
  }>;
}) {
  // Identity from the session; every query is user-scoped in the repositories.
  const user = await requireUser();
  const [{ timeZone, weekStartsOn }, { new: newParam, goalId, lifeAreaId, parentTaskId }] =
    await Promise.all([getUserDatePrefs(user.id), searchParams]);
  const [tasks, subtasks, goals, lifeAreas] = await Promise.all([
    tasksRepo.listTasksForUser(user.id),
    tasksRepo.listSubtasksForUser(user.id),
    /*
     * Archived goals INCLUDED, deliberately.
     *
     * A to-do keeps its `goal_id` when its goal is archived, so a list that
     * excludes archived goals leaves the picker unable to name the goal the
     * to-do actually has: it fell back to "Select..." and the to-do looked
     * unlinked when it was not. `goalPickerOptions` still hides archived goals
     * from the CHOICES; it only keeps the one already selected, labelled as
     * archived. Filtering here made that impossible, because the row was gone
     * before the picker ever saw it.
     */
    goalsRepo.listGoals(user.id, { includeArchived: true }),
    lifeAreasRepo.listLifeAreas(user.id),
  ]);

  return (
    <TasksView
      tasks={tasks}
      subtasks={subtasks}
      goals={goals}
      lifeAreas={lifeAreas}
      timeZone={timeZone}
      weekStartsOn={weekStartsOn}
      // `/tasks?new=1` opens the create form straight away, so the shell's
      // "Add to-do" / "Quick Action" / mobile "+" actually open a form.
      openCreateOnMount={newParam === "1"}
      // "+ Add > To-do" from inside a goal or a life area arrives with those
      // already chosen; "+ Add > Subtask" from inside a to-do arrives with its
      // parent. Ownership of every one is still verified server-side on submit.
      defaultGoalId={goalId}
      defaultLifeAreaId={lifeAreaId}
      defaultParentTaskId={parentTaskId}
    />
  );
}
