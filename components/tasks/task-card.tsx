"use client";

import {
  Ban,
  CalendarClock,
  CalendarDays,
  Flag,
  ListChecks,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import type { Task } from "@/db";
import { formatIsoDateMedium, formatZonedDateTimeMedium, MANILA_TZ } from "@/lib/date";
import { lifeAreaColorConfig, resolveColorKey } from "@/lib/life-areas";
import { taskPriorityConfig, taskStatusConfig } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export type TaskLifeAreaRef = { id: string; name: string; color: string | null; icon: string | null };

/**
 * A task card: circular checkbox (fills with the task's Life Area system
 * color), title + status, footnote meta chips, mono dates, and a
 * hover-revealed action row. Solid surface, radius 12 (inner-card scale).
 */
export function TaskCard({
  task,
  subtaskCount,
  goalTitle,
  lifeArea,
  timeZone = MANILA_TZ,
  onOpen,
  onToggleComplete,
  onEdit,
  onCancel,
  onDelete,
  onEditNote,
}: {
  task: Task;
  subtaskCount?: { done: number; total: number };
  goalTitle?: string | null;
  lifeArea?: TaskLifeAreaRef | null;
  timeZone?: string;
  /** Open the detail panel. The card body is the trigger. */
  onOpen?: (task: Task) => void;
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
  const areaColor = lifeArea
    ? lifeAreaColorConfig[resolveColorKey(lifeArea.color, lifeArea.id)]
    : null;
  const scheduledLabel = formatIsoDateMedium(task.scheduledFor);
  const dueLabel = formatZonedDateTimeMedium(task.dueAt, timeZone);

  return (
    <div
      data-testid="task-card"
      className={cn(
        "group relative rounded-xl border border-separator-opaque bg-surface p-3 shadow-e1 transition-shadow hover:shadow-e2",
        (isCompleted || isCancelled) && "opacity-60",
      )}
    >
      {/* The life area's colour on the leading edge: scanning the list tells you
          which part of your life the work belongs to before you read a word. */}
      {areaColor ? (
        <span
          className={cn("absolute inset-y-0 left-0 w-1 rounded-l-xl", areaColor.dot)}
          aria-hidden
        />
      ) : null}

      <div className="flex items-start gap-3">
        {/* Above the stretched title hit area, so ticking never opens details. */}
        <div className="relative z-10 mt-0.5">
          <Checkbox
            checked={isCompleted}
            onToggle={() => onToggleComplete(task)}
            color={areaColor?.fill}
            aria-label={isCompleted ? `Reopen ${task.title}` : `Complete ${task.title}`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            {/*
              The title is the card's trigger, stretched over the whole card via
              `after:inset-0`. That gives one real, focusable, correctly named
              control instead of a click handler on a div, and keeps the card
              body a big target the way Asana's rows are.
            */}
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(task)}
                className={cn(
                  "min-w-0 rounded-sm text-left text-body font-medium text-label after:absolute after:inset-0 after:content-[''] hover:text-blue focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
                  (isCompleted || isCancelled) && "text-label-tertiary line-through",
                )}
              >
                {task.title}
              </button>
            ) : (
              <h3
                className={cn(
                  "text-body font-medium text-label",
                  (isCompleted || isCancelled) && "text-label-tertiary line-through",
                )}
              >
                {task.title}
              </h3>
            )}
            <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-footnote", status.badge)}>
              {status.label}
            </span>
          </div>

          {task.description ? (
            <p className="mt-0.5 line-clamp-2 text-callout text-label-secondary">
              {task.description}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-footnote",
                priority.badge,
              )}
            >
              <Flag className="size-3" aria-hidden />
              {priority.label}
            </span>

            {goalTitle ? (
              <span className="inline-flex items-center gap-1 rounded-sm bg-indigo/12 px-1.5 py-0.5 text-footnote text-indigo">
                <Flag className="size-3" aria-hidden />
                <span className="max-w-48 truncate">{goalTitle}</span>
              </span>
            ) : null}

            {lifeArea && areaColor ? (
              <span className="inline-flex items-center gap-1.5 text-footnote text-label-secondary">
                <span className={cn("size-2 rounded-full", areaColor.dot)} aria-hidden />
                <span className="max-w-40 truncate">{lifeArea.name}</span>
              </span>
            ) : null}

            {scheduledLabel ? (
              <span className="inline-flex items-center gap-1 font-mono text-footnote tabular-nums text-label-secondary">
                <CalendarDays className="size-3" aria-hidden />
                {scheduledLabel}
              </span>
            ) : null}

            {dueLabel ? (
              <span className="inline-flex items-center gap-1 font-mono text-footnote tabular-nums text-label-secondary">
                <CalendarClock className="size-3" aria-hidden />
                Due {dueLabel}
              </span>
            ) : null}

            {subtaskCount && subtaskCount.total > 0 ? (
              <span
                className="inline-flex items-center gap-1 font-mono text-footnote tabular-nums text-label-secondary"
                title={`${subtaskCount.done} of ${subtaskCount.total} steps done`}
              >
                <ListChecks className="size-3" aria-hidden />
                {subtaskCount.done}/{subtaskCount.total}
              </span>
            ) : null}
          </div>

          {isCompleted && task.completionNote ? (
            <p className="mt-2 rounded-md bg-surface-secondary px-2.5 py-1.5 text-callout text-label-secondary">
              <span className="font-medium text-label">Reflection: </span>
              {task.completionNote}
            </p>
          ) : null}

          {/*
            The actions FLOAT over the card's empty bottom-right corner rather
            than occupying a row of their own. `opacity-0` hides a row but still
            reserves its layout, which made every card ~30% taller than its
            content (measured: 28px of a 126px card) and is what made the list
            read as mostly empty space. Revealing them in flow instead would
            resize the card under the pointer, so they overlay.

            Touch devices have no hover to reveal anything, so there they drop
            back into the flow and stay visible.
          */}
          <div
            className={cn(
              "absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-lg border border-separator-opaque bg-surface p-1 opacity-0 shadow-e2 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100",
              // In flow on touch, and allowed to WRAP: four actions in a single
              // no-wrap row ran past the edge of a phone-width card and clipped
              // "Delete" to "Del".
              "[@media(hover:none)]:static [@media(hover:none)]:mt-2 [@media(hover:none)]:flex-wrap [@media(hover:none)]:gap-x-1 [@media(hover:none)]:gap-y-0.5 [@media(hover:none)]:border-0 [@media(hover:none)]:bg-transparent [@media(hover:none)]:p-0 [@media(hover:none)]:opacity-100 [@media(hover:none)]:shadow-none",
            )}
          >
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
              className="text-red hover:bg-red/12 hover:text-red"
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
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-footnote font-medium text-label-secondary transition-colors hover:bg-surface-hover hover:text-label focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}
