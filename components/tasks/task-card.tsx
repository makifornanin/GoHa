"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Ban,
  CalendarClock,
  CalendarDays,
  Check,
  Flag,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LifeAreaIcon } from "@/components/life-areas/icon";
import type { Task } from "@/db";
import { formatIsoDateMedium, formatManilaDateTimeMedium } from "@/lib/date";
import { lifeAreaColorConfig, toColorKey } from "@/lib/life-areas";
import { easeOutExpo, springSnappy } from "@/lib/motion";
import { taskPriorityConfig, taskStatusConfig } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export type TaskLifeAreaRef = { name: string; color: string | null; icon: string | null };

/**
 * A task row: a priority accent bar, a completion checkbox with a satisfying
 * completion animation, status/priority/goal/life-area meta, scheduling (mono),
 * and an action row. Completed tasks show their persistent completion feedback.
 */
export function TaskCard({
  task,
  goalTitle,
  lifeArea,
  onToggleComplete,
  onEdit,
  onCancel,
  onDelete,
  onEditNote,
}: {
  task: Task;
  goalTitle?: string | null;
  lifeArea?: TaskLifeAreaRef | null;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onCancel: (task: Task) => void;
  onDelete: (task: Task) => void;
  onEditNote: (task: Task) => void;
}) {
  const priority = taskPriorityConfig[task.priority];
  const status = taskStatusConfig[task.status];
  const isCompleted = task.status === "completed";
  const isCancelled = task.status === "cancelled";
  const areaColor = lifeArea ? lifeAreaColorConfig[toColorKey(lifeArea.color)] : null;
  const scheduledLabel = formatIsoDateMedium(task.scheduledFor);
  const dueLabel = formatManilaDateTimeMedium(task.dueAt);

  const [burst, setBurst] = useState(false);
  const prevCompleted = useRef(isCompleted);
  useEffect(() => {
    if (!prevCompleted.current && isCompleted) {
      setBurst(true);
      const timeout = setTimeout(() => setBurst(false), 520);
      prevCompleted.current = isCompleted;
      return () => clearTimeout(timeout);
    }
    prevCompleted.current = isCompleted;
  }, [isCompleted]);

  return (
    <div
      data-testid="task-card"
      className={cn(
        "group raised card-shadow card-elevated relative overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-5 pl-6",
        (isCompleted || isCancelled) && "opacity-70",
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1.5", priority.accent)} aria-hidden />

      <div className="flex items-start gap-4">
        <motion.button
          type="button"
          onClick={() => onToggleComplete(task)}
          aria-label={isCompleted ? `Reopen ${task.title}` : `Complete ${task.title}`}
          aria-pressed={isCompleted}
          whileTap={{ scale: 0.85 }}
          transition={springSnappy}
          className={cn(
            "relative mt-0.5 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 transition-colors duration-150",
            isCompleted
              ? "border-primary bg-primary text-on-primary"
              : "border-outline text-transparent hover:border-primary hover:text-primary",
          )}
        >
          <AnimatePresence initial={false}>
            {isCompleted ? (
              <motion.span
                key="check"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={springSnappy}
              >
                <Check className="size-4 stroke-2" aria-hidden />
              </motion.span>
            ) : null}
          </AnimatePresence>
          {burst ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary"
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ duration: 0.5, ease: easeOutExpo }}
            />
          ) : null}
        </motion.button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              className={cn(
                "text-headline-md text-on-surface",
                (isCompleted || isCancelled) && "line-through",
              )}
            >
              {task.title}
            </h3>
            <span
              className={cn(
                "shrink-0 rounded px-2 py-1 text-label-sm uppercase",
                status.badge,
              )}
            >
              {status.label}
            </span>
          </div>

          {task.description ? (
            <p className="mt-1 line-clamp-2 text-body-md text-on-surface-variant">
              {task.description}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-label-sm",
                priority.badge,
              )}
            >
              <Flag className="size-3.5" aria-hidden />
              {priority.label}
            </span>

            {goalTitle ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-tertiary-container/20 px-2.5 py-1 text-label-sm text-tertiary">
                <Flag className="size-3.5" aria-hidden />
                <span className="max-w-[12rem] truncate">{goalTitle}</span>
              </span>
            ) : null}

            {lifeArea && areaColor ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-label-sm",
                  areaColor.tile,
                )}
              >
                <LifeAreaIcon iconKey={lifeArea.icon} className="size-3.5" />
                <span className="max-w-[10rem] truncate">{lifeArea.name}</span>
              </span>
            ) : null}

            {scheduledLabel ? (
              <span className="tabular inline-flex items-center gap-1 font-mono text-mono-sm text-on-surface-variant">
                <CalendarDays className="size-3.5" aria-hidden />
                {scheduledLabel}
              </span>
            ) : null}

            {dueLabel ? (
              <span className="tabular inline-flex items-center gap-1 font-mono text-mono-sm text-on-surface-variant">
                <CalendarClock className="size-3.5" aria-hidden />
                Due {dueLabel}
              </span>
            ) : null}
          </div>

          {isCompleted && task.completionNote ? (
            <p className="mt-3 rounded-lg border border-outline-variant/60 bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant">
              <span className="font-semibold text-on-surface">Reflection: </span>
              {task.completionNote}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-outline-variant/40 pt-3 opacity-80 transition-opacity group-hover:opacity-100">
            <ActionButton onClick={() => onEdit(task)} icon={Pencil} label="Edit" />
            {isCompleted ? (
              <ActionButton
                onClick={() => onEditNote(task)}
                icon={MessageSquarePlus}
                label={task.completionNote ? "Edit reflection" : "Add reflection"}
              />
            ) : null}
            {isCompleted ? (
              <ActionButton onClick={() => onToggleComplete(task)} icon={RotateCcw} label="Reopen" />
            ) : null}
            {!isCompleted && !isCancelled ? (
              <ActionButton onClick={() => onCancel(task)} icon={Ban} label="Cancel" />
            ) : null}
            <ActionButton
              onClick={() => onDelete(task)}
              icon={Trash2}
              label="Delete"
              className="ml-auto hover:bg-error/10 hover:text-error"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  icon: Icon,
  label,
  className,
}: {
  onClick: () => void;
  icon: typeof Pencil;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}
