import type { GoalWithCounts } from "@/db/repositories/goals";
import type { DailyPriority, Task } from "@/db";
import type { IsoDate } from "@/lib/date";
import { calculateGoalProgress } from "@/lib/goal-progress";
import { taskEffectiveDate } from "@/lib/task-buckets";
import { taskPriorityConfig } from "@/lib/tasks";

/**
 * Pure derivation of the Today dashboard from CANONICAL data only (CLAUDE.md
 * section 7): the same tasks, goals, and daily_priorities rows used everywhere
 * else. Nothing here is stored; every section is computed from the live records,
 * so a task completed on Today is the same task seen in To-dos and Goals.
 */

export type ActiveGoalProgress = { goal: GoalWithCounts; percent: number };
export type ResolvedPriority = { priority: DailyPriority; task: Task | null };

export type TodayData = {
  /** Active tasks whose effective date is today. */
  todayTasks: Task[];
  /** Active tasks whose effective date is before today. */
  overdueTasks: Task[];
  /** Today's tasks completed so far / total scheduled today (excludes cancelled). */
  completedToday: number;
  totalToday: number;
  completionPercent: number;
  /** Active goals with derived progress. */
  activeGoals: ActiveGoalProgress[];
  /** Daily priorities resolved to their canonical task (null if the task is gone). */
  priorities: ResolvedPriority[];
  /** The single suggested focus: the first incomplete priority task, else null. */
  focus: Task | null;
};

const isActive = (task: Task) => task.status === "todo" || task.status === "in_progress";

export function deriveTodayData(params: {
  today: IsoDate;
  tasks: Task[];
  goals: GoalWithCounts[];
  priorities: DailyPriority[];
}): TodayData {
  const { today, tasks, goals, priorities } = params;

  const todayTasks: Task[] = [];
  const overdueTasks: Task[] = [];
  let completedToday = 0;
  let totalToday = 0;

  for (const task of tasks) {
    const effective = taskEffectiveDate(task);
    const isToday = effective === today;

    if (isToday && task.status !== "cancelled") {
      totalToday += 1;
      if (task.status === "completed") completedToday += 1;
    }
    if (isActive(task)) {
      if (isToday) todayTasks.push(task);
      else if (effective !== null && effective < today) overdueTasks.push(task);
    }
  }

  const completionPercent = totalToday === 0 ? 0 : Math.round((completedToday / totalToday) * 100);

  const activeGoals: ActiveGoalProgress[] = goals
    .filter((goal) => goal.status === "active")
    .map((goal) => ({
      goal,
      percent: calculateGoalProgress({
        status: goal.status,
        progressMode: goal.progressMode,
        manualProgress: goal.manualProgress,
        tasks: { total: goal.totalTasks, completed: goal.completedTasks, cancelled: goal.cancelledTasks },
      }).percent,
    }));

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const resolved: ResolvedPriority[] = priorities.map((priority) => ({
    priority,
    task: priority.taskId ? taskById.get(priority.taskId) ?? null : null,
  }));

  // Suggested focus: the first still-open pinned priority, else today's
  // highest-priority open task.
  const priorityFocus = resolved.find((r) => r.task && r.task.status !== "completed")?.task ?? null;
  const fallbackFocus =
    [...todayTasks].sort(
      (a, b) => taskPriorityConfig[b.priority].weight - taskPriorityConfig[a.priority].weight,
    )[0] ?? null;
  const focus = priorityFocus ?? fallbackFocus;

  return {
    todayTasks,
    overdueTasks,
    completedToday,
    totalToday,
    completionPercent,
    activeGoals,
    priorities: resolved,
    focus,
  };
}
