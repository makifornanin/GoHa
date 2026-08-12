"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Task } from "@/db";

/**
 * Task row per spec section 8: 40px height, padding-x 12, checkbox-to-title
 * gap 12, transparent at rest / `surface-hover` on hover / `surface-pressed`
 * while active, and a hairline separator between rows inset 12px from the
 * left. Completion choreography (section 9): the circular checkbox plays the
 * bouncy scale, the strikethrough sweeps left to right in 200ms. Toggling
 * calls back to complete/reopen the CANONICAL task, never a copy.
 */
export function TaskChecklistItem({
  task,
  onToggle,
  onOpen,
  meta,
  onRemove,
  removeLabel,
  checkColor,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  /** Open the task's detail panel. The title becomes the trigger. */
  onOpen?: (task: Task) => void;
  meta?: ReactNode;
  onRemove?: (task: Task) => void;
  removeLabel?: string;
  /** CSS color for the checked fill (Life Area system color when known). */
  checkColor?: string;
}) {
  const completed = task.status === "completed";

  return (
    <div
      className={cn(
        // Concentric: rows sit 4px inside the 16px-radius card, so hover is 12.
        "group relative flex h-10 items-center gap-3 rounded-xl px-3 transition-colors duration-150 hover:bg-surface-hover active:bg-surface-pressed",
        "[&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:bottom-0 [&:not(:last-child)]:after:left-3 [&:not(:last-child)]:after:right-0 [&:not(:last-child)]:after:h-px [&:not(:last-child)]:after:bg-separator",
      )}
    >
      <Checkbox
        checked={completed}
        onToggle={() => onToggle(task)}
        color={checkColor}
        aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
      />

      <span className="relative min-w-0 flex-1 truncate">
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(task)}
            className={cn(
              "max-w-full truncate rounded-sm text-left text-body transition-colors duration-200 hover:text-blue focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
              completed ? "text-label-tertiary" : "text-label",
            )}
          >
            {task.title}
          </button>
        ) : (
          <span
            className={cn(
              "text-body transition-colors duration-200",
              completed ? "text-label-tertiary" : "text-label",
            )}
          >
            {task.title}
          </span>
        )}
        {/* Strikethrough sweeps left to right, 200ms. */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ scaleX: completed ? 1 : 0 }}
          transition={{ type: "spring", duration: 0.2, bounce: 0 }}
          style={{ originX: 0 }}
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-label-tertiary"
        />
      </span>

      {meta}

      {onRemove ? (
        <button
          type="button"
          onClick={() => onRemove(task)}
          aria-label={removeLabel ?? `Remove ${task.title}`}
          className="hit-44 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-label-tertiary opacity-0 transition-opacity duration-150 hover:text-label-secondary focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 group-hover:opacity-100"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
