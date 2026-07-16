"use client";

import { motion } from "motion/react";
import { Archive, CalendarDays, CheckCircle2, CornerDownRight, Pencil } from "lucide-react";

import { LifeAreaIcon } from "@/components/life-areas/icon";
import type { GoalWithCounts } from "@/db/repositories/goals";
import { formatIsoDateMedium } from "@/lib/date";
import { calculateGoalProgress } from "@/lib/goal-progress";
import { goalStatusConfig } from "@/lib/goals";
import { lifeAreaColorConfig, toColorKey } from "@/lib/life-areas";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type LifeAreaRef = { name: string; color: string | null; icon: string | null };

const revealAction =
  "hit-44 hit-44-narrow flex size-7 cursor-pointer items-center justify-center rounded-full text-label-tertiary transition-all focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100";

/**
 * A goal card. Progress comes from the shared `calculateGoalProgress` rules;
 * task counts are real completed/counted values (cancelled excluded).
 */
export function GoalCard({
  goal,
  lifeArea,
  parentTitle,
  onEdit,
  onArchive,
}: {
  goal: GoalWithCounts;
  lifeArea?: LifeAreaRef | null;
  parentTitle?: string | null;
  onEdit: (goal: GoalWithCounts) => void;
  onArchive: (goal: GoalWithCounts) => void;
}) {
  const status = goalStatusConfig[goal.status];
  const { percent } = calculateGoalProgress({
    status: goal.status,
    progressMode: goal.progressMode,
    manualProgress: goal.manualProgress,
    tasks: {
      total: goal.totalTasks,
      completed: goal.completedTasks,
      cancelled: goal.cancelledTasks,
    },
  });
  const countedTasks = Math.max(0, goal.totalTasks - goal.cancelledTasks);
  const dueLabel = formatIsoDateMedium(goal.targetDate);
  const areaColor = lifeArea ? lifeAreaColorConfig[toColorKey(lifeArea.color)] : null;

  return (
    <div
      data-testid="goal-card"
      className={cn(
        "group flex h-full flex-col rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1 transition-shadow hover:shadow-e2",
        status.muted && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {lifeArea && areaColor ? (
          <span className={cn("inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-footnote", areaColor.tile)}>
            <LifeAreaIcon iconKey={lifeArea.icon} className="size-3" />
            <span className="max-w-40 truncate">{lifeArea.name}</span>
          </span>
        ) : (
          <span className="inline-flex items-center rounded-sm bg-gray-5 px-1.5 py-0.5 text-footnote text-label-secondary">
            No life area
          </span>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(goal)}
            aria-label={`Edit ${goal.title}`}
            className={cn(revealAction, "hover:text-label")}
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onArchive(goal)}
            aria-label={`Archive ${goal.title}`}
            className={cn(revealAction, "hover:text-red")}
          >
            <Archive className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {parentTitle ? (
        <p className="mt-3 flex items-center gap-1 text-footnote text-label-secondary">
          <CornerDownRight className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Part of {parentTitle}</span>
        </p>
      ) : null}

      <h3 className="mt-3 text-headline text-label">{goal.title}</h3>
      {goal.description ? (
        <p className="mt-1 line-clamp-2 text-callout text-label-secondary">{goal.description}</p>
      ) : null}

      <div className="mt-auto space-y-3 pt-4">
        <div>
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <span className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-footnote", status.badge)}>
              {status.label}
            </span>
            <span className="font-mono text-footnote tabular-nums text-label-secondary">{percent}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-5">
            <motion.div
              className={cn("h-full rounded-full", status.bar)}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={spring.smooth}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-separator pt-2.5 text-footnote text-label-secondary">
          <span className="inline-flex items-center gap-1.5" title="Completed / total tasks">
            <CheckCircle2 className="size-3.5" aria-hidden />
            <span className="font-mono tabular-nums">
              {goal.completedTasks}/{countedTasks}
            </span>
          </span>
          {dueLabel ? (
            <span className="inline-flex items-center gap-1.5" title="Target date">
              <CalendarDays className="size-3.5" aria-hidden />
              <span className="font-mono tabular-nums">{dueLabel}</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
