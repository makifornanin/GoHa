"use client";

import { motion } from "motion/react";
import { CornerDownRight, ListChecks, Pencil, Plus, Target } from "lucide-react";
import Link from "next/link";

import { LifeAreaIcon } from "@/components/life-areas/icon";
import { Button } from "@/components/ui/button";
import { DetailPanel, DetailRow } from "@/components/ui/detail-panel";
import type { LifeArea, Task } from "@/db";
import type { GoalWithCounts } from "@/db/repositories/goals";
import { formatIsoDateMedium } from "@/lib/date";
import { calculateGoalProgress } from "@/lib/goal-progress";
import { goalStatusConfig, goalTimeframeConfig } from "@/lib/goals";
import { lifeAreaColorConfig, resolveColorKey } from "@/lib/life-areas";
import { spring } from "@/lib/motion";
import { taskStatusConfig } from "@/lib/tasks";
import { cn } from "@/lib/utils";

/**
 * The goal, opened: what it is, how far along, what sits under it, and the
 * actual tasks doing the work.
 *
 * A goal card can only ever show a percentage. The interesting question is
 * WHERE that percentage comes from, and that answer lived nowhere in the app:
 * sub-goals were visible only as a "Part of ..." line on another card, and the
 * tasks driving progress were on a different page behind a filter.
 */
export function GoalDetailPanel({
  goal,
  subGoals,
  tasks,
  lifeAreas,
  onClose,
  onEdit,
  onOpenSubGoal,
  onAddTask,
}: {
  goal: GoalWithCounts | null;
  subGoals: GoalWithCounts[];
  tasks: Task[];
  lifeAreas: LifeArea[];
  onClose: () => void;
  onEdit: (goal: GoalWithCounts) => void;
  onOpenSubGoal: (goal: GoalWithCounts) => void;
  onAddTask: (goal: GoalWithCounts) => void;
}) {
  return (
    <DetailPanel
      open={Boolean(goal)}
      onClose={onClose}
      title={goal ? `Details for ${goal.title}` : "Goal details"}
      headerActions={
        goal ? (
          <Button variant="ghost" size="sm" onClick={() => onEdit(goal)}>
            <Pencil className="size-4" aria-hidden />
            Edit
          </Button>
        ) : null
      }
    >
      {goal ? (
        <GoalDetailBody
          key={goal.id}
          goal={goal}
          subGoals={subGoals}
          tasks={tasks}
          lifeAreas={lifeAreas}
          onOpenSubGoal={onOpenSubGoal}
          onAddTask={onAddTask}
        />
      ) : null}
    </DetailPanel>
  );
}

function GoalDetailBody({
  goal,
  subGoals,
  tasks,
  lifeAreas,
  onOpenSubGoal,
  onAddTask,
}: {
  goal: GoalWithCounts;
  subGoals: GoalWithCounts[];
  tasks: Task[];
  lifeAreas: LifeArea[];
  onOpenSubGoal: (goal: GoalWithCounts) => void;
  onAddTask: (goal: GoalWithCounts) => void;
}) {
  const status = goalStatusConfig[goal.status];
  const { percent, source } = calculateGoalProgress({
    status: goal.status,
    progressMode: goal.progressMode,
    manualProgress: goal.manualProgress,
    tasks: {
      total: goal.totalTasks,
      completed: goal.completedTasks,
      cancelled: goal.cancelledTasks,
    },
  });
  const area = goal.lifeAreaId ? lifeAreas.find((a) => a.id === goal.lifeAreaId) ?? null : null;
  const areaColor = area ? lifeAreaColorConfig[resolveColorKey(area.color, area.id)] : null;
  const countedTasks = Math.max(0, goal.totalTasks - goal.cancelledTasks);

  const sourceHint =
    source === "manual"
      ? "Set by hand"
      : source === "completed"
        ? "Goal marked complete"
        : source === "tasks"
          ? `${goal.completedTasks} of ${countedTasks} linked tasks done`
          : "No linked tasks yet";

  return (
    <div className="flex flex-col gap-6">
      <div>
        {area && areaColor ? (
          <span
            className={cn(
              "mb-2 inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-footnote",
              areaColor.tile,
            )}
          >
            <LifeAreaIcon iconKey={area.icon} className="size-3" />
            {area.name}
          </span>
        ) : null}
        <h3 className="text-title-3 text-label">{goal.title}</h3>
        {goal.description ? (
          <p className="mt-1.5 text-callout text-label-secondary">{goal.description}</p>
        ) : null}
      </div>

      {/* Progress, and where it comes from. */}
      <section>
        <div className="mb-1.5 flex items-end justify-between gap-3">
          <span className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-footnote", status.badge)}>
            {status.label}
          </span>
          <span className="font-mono text-title-3 tabular-nums text-label">{percent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-fill-tertiary">
          <motion.div
            className={cn("h-full rounded-full", areaColor ? areaColor.dot : status.bar)}
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={spring.smooth}
          />
        </div>
        <p className="mt-1.5 text-footnote text-label-secondary">{sourceHint}</p>
      </section>

      <div className="flex flex-col gap-1">
        <DetailRow label="Timeframe">
          <span className="text-body text-label">
            {goal.timeframe ? goalTimeframeConfig[goal.timeframe].label : "No timeframe"}
          </span>
        </DetailRow>
        <DetailRow label="Starts">
          <span className="font-mono text-body tabular-nums text-label">
            {formatIsoDateMedium(goal.startDate) ?? "Not set"}
          </span>
        </DetailRow>
        <DetailRow label="Target">
          <span className="font-mono text-body tabular-nums text-label">
            {formatIsoDateMedium(goal.targetDate) ?? "Not set"}
          </span>
        </DetailRow>
      </div>

      {/* Sub-goals */}
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-subhead text-label-secondary">
          <Target className="size-4" aria-hidden />
          Sub-goals
          {subGoals.length > 0 ? (
            <span className="rounded-full bg-fill-tertiary px-1.5 py-0.5 font-mono text-footnote tabular-nums text-label">
              {subGoals.length}
            </span>
          ) : null}
        </h4>
        {subGoals.length === 0 ? (
          <p className="rounded-lg bg-fill-quaternary px-3 py-3 text-callout text-label-tertiary">
            Nothing breaks this goal down yet. Create a goal and set this one as its parent.
          </p>
        ) : (
          <ul className="flex flex-col">
            {subGoals.map((sub) => {
              const subProgress = calculateGoalProgress({
                status: sub.status,
                progressMode: sub.progressMode,
                manualProgress: sub.manualProgress,
                tasks: {
                  total: sub.totalTasks,
                  completed: sub.completedTasks,
                  cancelled: sub.cancelledTasks,
                },
              }).percent;
              return (
                <li key={sub.id}>
                  <button
                    type="button"
                    onClick={() => onOpenSubGoal(sub)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
                  >
                    <CornerDownRight className="size-3.5 shrink-0 text-label-tertiary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-body text-label">{sub.title}</span>
                    <span className="shrink-0 font-mono text-footnote tabular-nums text-label-secondary">
                      {subProgress}%
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The tasks actually moving it */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-subhead text-label-secondary">
            <ListChecks className="size-4" aria-hidden />
            Linked tasks
            {tasks.length > 0 ? (
              <span className="rounded-full bg-fill-tertiary px-1.5 py-0.5 font-mono text-footnote tabular-nums text-label">
                {goal.completedTasks}/{countedTasks}
              </span>
            ) : null}
          </h4>
          <Button variant="ghost" size="sm" onClick={() => onAddTask(goal)}>
            <Plus className="size-4" aria-hidden />
            Add task
          </Button>
        </div>

        {tasks.length === 0 ? (
          <p className="rounded-lg bg-fill-quaternary px-3 py-3 text-callout text-label-tertiary">
            No tasks linked yet.{" "}
            {goal.progressMode === "auto"
              ? "This goal reads 0% until it has some, because its progress is calculated from tasks."
              : "Progress is set by hand on this goal, so tasks are optional."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex min-h-9 items-center gap-2 rounded-lg px-2 py-1.5"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    task.status === "completed"
                      ? "bg-green"
                      : task.status === "cancelled"
                        ? "bg-gray-3"
                        : areaColor
                          ? areaColor.dot
                          : "bg-blue",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-body",
                    task.status === "completed" || task.status === "cancelled"
                      ? "text-label-tertiary line-through"
                      : "text-label",
                  )}
                >
                  {task.title}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm px-1.5 py-0.5 text-footnote",
                    taskStatusConfig[task.status].badge,
                  )}
                >
                  {taskStatusConfig[task.status].label}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/tasks"
          className="mt-2 inline-flex text-callout font-medium text-blue hover:underline"
        >
          Manage in To-dos
        </Link>
      </section>
    </div>
  );
}
