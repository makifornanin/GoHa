import { notFound } from "next/navigation";

import { GoalDetailView } from "@/components/goals/goal-detail-view";
import { goalsRepo, habitsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { descendantIds } from "@/lib/goal-tree";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";

/**
 * One goal, opened.
 *
 * A real route rather than the drawer this replaced, because the drawer could
 * not answer the question the hierarchy poses. A subgoal has a parent, a parent
 * has subgoals, and both have to-dos; showing that inside a panel over the
 * board meant the board's flat grid stayed the only picture of the tree, and
 * there was nowhere to put a breadcrumb. A URL also means back, refresh, share
 * and the browser's own history work on a goal.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ goalId: string }>;
}) {
  const { goalId } = await params;
  const user = await requireUser();
  const goal = await goalsRepo.getGoal(user.id, goalId);
  return { title: goal ? goal.title : "Goal" };
}

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ goalId: string }>;
}) {
  const [{ goalId }, user] = await Promise.all([params, requireUser()]);

  /*
   * Archived goals are included on purpose.
   *
   * Settings > Archive links straight here, and 404-ing on something the user
   * can plainly see in their own archive list is worse than showing it with a
   * banner. The view marks it read-only-ish and offers the way back.
   */
  const [{ timeZone, weekStartsOn }, goals, lifeAreas, tasks, habits] = await Promise.all([
    getUserDatePrefs(user.id),
    goalsRepo.listGoalsWithTaskCounts(user.id, { includeArchived: true }),
    lifeAreasRepo.listLifeAreas(user.id, { includeArchived: true }),
    tasksRepo.listTasksForUser(user.id),
    habitsRepo.listHabits(user.id),
  ]);

  const goal = goals.find((entry) => entry.id === goalId);
  // Not "could not load": a goal id that is not in this user's own list is
  // either gone or someone else's, and both are a 404 from here.
  if (!goal) notFound();

  const subtree = new Set<string>([goal.id, ...descendantIds(goals, goal.id)]);

  const [progressUpdates] = await Promise.all([
    goalsRepo.listGoalProgressUpdates(user.id, goal.id),
  ]);

  return (
    <GoalDetailView
      goal={goal}
      goals={goals}
      lifeAreas={lifeAreas}
      /* Every to-do under the goal OR under one of its subgoals: that is the
         set the rolled-up percentage is computed from, so it is the set the
         page has to be able to show. */
      tasks={tasks.filter((task) => task.goalId && subtree.has(task.goalId))}
      habits={habits.filter((habit) => habit.goalId && subtree.has(habit.goalId))}
      progressUpdates={progressUpdates.map((entry) => ({
        id: entry.id,
        progress: entry.progress,
        note: entry.note,
        createdAt: entry.createdAt.toISOString(),
      }))}
      timeZone={timeZone}
      weekStartsOn={weekStartsOn}
    />
  );
}
