"use client";

import { motion } from "motion/react";
import { Archive, CalendarDays, CheckCircle2, CornerDownRight, Pencil } from "lucide-react";

import { LifeAreaIcon } from "@/components/life-areas/icon";
import type { GoalWithCounts } from "@/db/repositories/goals";
import { formatIsoDateMedium } from "@/lib/date";
import { calculateGoalProgress } from "@/lib/goal-progress";
import { goalStatusConfig } from "@/lib/goals";
import { lifeAreaColorConfig, toColorKey } from "@/lib/life-areas";
import { springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type LifeAreaRef = { name: string; color: string | null; icon: string | null };

const revealAction =
  "flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100";

/**
 * A goal card. The progress bar and percentage come from the shared
 * `calculateGoalProgress` rules; the task meta shows real completed/counted
 * (cancelled excluded) counts (CLAUDE.md section 9: no fabricated numbers).
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
        "group raised card-shadow card-elevated relative flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-5",
        status.muted && "opacity-70",
      )}
    >
      {areaColor ? (
        <div
          className={cn("absolute right-0 top-0 -z-0 size-24 rounded-bl-full", areaColor.blob)}
          aria-hidden
        />
      ) : null}

      <div className="relative flex items-start justify-between gap-2">
        {lifeArea && areaColor ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-label-sm",
              areaColor.tile,
            )}
          >
            <LifeAreaIcon iconKey={lifeArea.icon} className="size-3.5" />
            <span className="max-w-[10rem] truncate">{lifeArea.name}</span>
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md bg-surface-container-high px-2.5 py-1 text-label-sm text-on-surface-variant">
            No life area
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(goal)}
            aria-label={`Edit ${goal.title}`}
            className={cn(revealAction, "hover:bg-surface-container-high hover:text-on-surface")}
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onArchive(goal)}
            aria-label={`Archive ${goal.title}`}
            className={cn(revealAction, "hover:bg-error/10 hover:text-error")}
          >
            <Archive className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {parentTitle ? (
        <p className="relative mt-3 flex items-center gap-1 text-label-sm text-on-surface-variant">
          <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">Part of {parentTitle}</span>
        </p>
      ) : null}

      <h3 className="relative mt-3 text-headline-md text-on-surface">{goal.title}</h3>
      {goal.description ? (
        <p className="relative mt-1 line-clamp-2 text-body-md text-on-surface-variant">
          {goal.description}
        </p>
      ) : null}

      <div className="relative mt-auto space-y-4 pt-5">
        <div>
          <div className="mb-2 flex items-end justify-between gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded px-2 py-0.5 text-label-sm uppercase",
                status.badge,
              )}
            >
              {status.label}
            </span>
            <span className="tabular font-mono text-mono-sm text-on-surface-variant">{percent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-variant">
            <motion.div
              className={cn("h-full rounded-full", status.bar)}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={springSmooth}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-outline-variant/60 pt-3 text-label-sm text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5" title="Completed / total tasks">
            <CheckCircle2 className="size-4" aria-hidden />
            <span className="tabular font-mono text-mono-sm">
              {goal.completedTasks}/{countedTasks}
            </span>
          </span>
          {dueLabel ? (
            <span className="inline-flex items-center gap-1.5" title="Target date">
              <CalendarDays className="size-4" aria-hidden />
              <span className="tabular font-mono text-mono-sm">{dueLabel}</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
