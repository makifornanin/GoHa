"use client";

import { motion } from "motion/react";
import { Archive, CalendarDays, CheckCircle2, Flag, Pencil, Plus } from "lucide-react";
import Link from "next/link";

import { LifeAreaIcon } from "@/components/life-areas/icon";
import type { GoalWithCounts } from "@/db/repositories/goals";
import { formatIsoDateMedium } from "@/lib/date";
import type { GoalProgressBreakdown } from "@/lib/goal-tree";
import { goalStatusConfig } from "@/lib/goals";
import { lifeAreaColorConfig, resolveColorKey } from "@/lib/life-areas";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type LifeAreaRef = { id: string; name: string; color: string | null; icon: string | null };

const revealAction =
  "hit-44 hit-44-narrow flex size-7 cursor-pointer items-center justify-center rounded-full text-label-tertiary transition-all focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100";

/** At most this many milestones on a card; the rest are a "+N more" line. */
const SUBGOAL_PREVIEW = 3;

/**
 * A GOAL, with its milestones inside it.
 *
 * The card's job is to make the two levels look like what they are. A goal is
 * the container: a title, an outcome, a percentage. Its subgoals are a short
 * indented checklist beneath it, in a smaller type size with their own progress
 * dots. That single change is what stops the board reading as a wall of
 * interchangeable cards, and it is why subgoals are no longer rendered as cards
 * of their own.
 *
 * Progress comes from `goalProgressBreakdown`, so it INCLUDES work filed under
 * the subgoals. A goal whose to-dos all live one level down used to read 0%
 * forever; now the number matches what the card visibly contains.
 */
export function GoalCard({
  goal,
  progress,
  subgoals,
  lifeArea,
  onEdit,
  onArchive,
  onAddSubgoal,
}: {
  goal: GoalWithCounts;
  progress: GoalProgressBreakdown;
  subgoals: GoalWithCounts[];
  lifeArea?: LifeAreaRef | null;
  onEdit: (goal: GoalWithCounts) => void;
  onArchive: (goal: GoalWithCounts) => void;
  onAddSubgoal: (goal: GoalWithCounts) => void;
}) {
  const status = goalStatusConfig[goal.status];
  const countedTasks = Math.max(0, progress.rolled.total - progress.rolled.cancelled);
  const dueLabel = formatIsoDateMedium(goal.targetDate);
  const areaColor = lifeArea
    ? lifeAreaColorConfig[resolveColorKey(lifeArea.color, lifeArea.id)]
    : null;
  const shown = subgoals.slice(0, SUBGOAL_PREVIEW);
  const hidden = subgoals.length - shown.length;

  return (
    <div
      data-testid="goal-card"
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1 transition-shadow hover:shadow-e2",
        status.muted && "opacity-60",
      )}
    >
      {/* The owning life area's colour, so a board of goals reads as colour-coded
          by area rather than as a wall of identical grey cards. */}
      {areaColor ? (
        <span className={cn("absolute inset-x-0 top-0 h-1", areaColor.dot)} aria-hidden />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        {lifeArea && areaColor ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-footnote",
              areaColor.tile,
            )}
          >
            <LifeAreaIcon iconKey={lifeArea.icon} className="size-3" />
            <span className="max-w-40 truncate">{lifeArea.name}</span>
          </span>
        ) : (
          <span className="inline-flex items-center rounded-sm bg-gray-5 px-1.5 py-0.5 text-footnote text-label-secondary">
            No life area
          </span>
        )}

        <div className="relative z-10 flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onAddSubgoal(goal)}
            aria-label={`Add a subgoal to ${goal.title}`}
            className={cn(revealAction, "hover:text-label")}
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
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

      {/* The whole card is the link to the goal's page. The stretched
          pseudo-element keeps the row-level actions above it clickable. */}
      <Link
        href={`/goals/${goal.id}`}
        className="mt-3 rounded-sm text-left text-headline text-label after:absolute after:inset-0 after:content-[''] hover:text-blue focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
      >
        {goal.title}
      </Link>
      {goal.description ? (
        <p className="mt-1 line-clamp-2 text-callout text-label-secondary">{goal.description}</p>
      ) : null}

      {/* Milestones, indented under the goal they belong to. */}
      {subgoals.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 border-l border-separator pl-3">
          {shown.map((sub) => {
            const done = sub.status === "completed";
            return (
              <li key={sub.id} className="flex items-center gap-2 text-footnote">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    done ? "bg-green" : areaColor ? areaColor.dot : "bg-gray-3",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    done ? "text-label-tertiary line-through" : "text-label-secondary",
                  )}
                >
                  {sub.title}
                </span>
              </li>
            );
          })}
          {hidden > 0 ? (
            <li className="text-footnote text-label-tertiary">
              +{hidden} more milestone{hidden === 1 ? "" : "s"}
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto space-y-3 pt-4">
        <div>
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-sm px-1.5 py-0.5 text-footnote",
                status.badge,
              )}
            >
              {status.label}
            </span>
            {/* Say where the number came from. A hand-set goal showing "40%"
                next to "0/0 to-dos" reads as a broken calculation, because
                nothing on the card admitted the percentage was typed in. */}
            <span className="flex items-center gap-1.5">
              {progress.source === "manual" ? (
                <span
                  className="rounded-sm bg-fill-tertiary px-1.5 py-0.5 text-footnote text-label-tertiary"
                  title="Set by hand; linked to-dos do not change it."
                >
                  Set by hand
                </span>
              ) : null}
              <span className="font-mono text-footnote tabular-nums text-label-secondary">
                {progress.percent}%
              </span>
            </span>
          </div>
          {/* Taller than the old 1px hairline and on a fill rather than gray-5:
              at 0% the previous bar was indistinguishable from the card. */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill-tertiary">
            <motion.div
              className={cn("h-full rounded-full", areaColor ? areaColor.dot : status.bar)}
              initial={{ width: 0 }}
              animate={{ width: `${progress.percent}%` }}
              transition={spring.smooth}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-separator pt-2.5 text-footnote text-label-secondary">
          <span
            className="inline-flex items-center gap-1.5"
            title="Completed to-dos, including those under subgoals"
          >
            <CheckCircle2 className="size-3.5" aria-hidden />
            <span className="font-mono tabular-nums">
              {progress.rolled.completed}/{countedTasks}
            </span>
          </span>
          <span className="flex items-center gap-3">
            {progress.subgoalCount > 0 ? (
              <span className="inline-flex items-center gap-1.5" title="Subgoals completed">
                <Flag className="size-3.5" aria-hidden />
                <span className="font-mono tabular-nums">
                  {progress.subgoalsCompleted}/{progress.subgoalCount}
                </span>
              </span>
            ) : null}
            {dueLabel ? (
              <span className="inline-flex items-center gap-1.5" title="Target date">
                <CalendarDays className="size-3.5" aria-hidden />
                <span className="font-mono tabular-nums">{dueLabel}</span>
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
