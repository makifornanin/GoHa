"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

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

  /*
   * Delegated so the ENTIRE row responds, including the date and the priority
   * chip, which are the pixels people actually aim at.
   *
   * The overlay button below is the real, focusable, correctly named control
   * for the keyboard and for assistive tech. This handler covers the pointer,
   * and does not depend on the overlay winning a paint-order contest against
   * whatever `meta` happens to render: if a chip ever became positioned, it
   * would silently start swallowing clicks, and nothing would catch it.
   *
   * Anything that is itself a control keeps its own click. That includes the
   * overlay, so a click landing there fires once, through the overlay, rather
   * than twice.
   */
  function onRowClick(event: MouseEvent<HTMLDivElement>) {
    if (!onOpen) return;
    if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    onOpen(task);
  }

  return (
    <div
      onClick={onRowClick}
      className={cn(
        // Concentric: rows sit 4px inside the 16px-radius card, so hover is 12.
        "group relative flex h-10 items-center gap-3 rounded-xl px-3 transition-colors duration-150 hover:bg-surface-hover active:bg-surface-pressed",
        "[&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:bottom-0 [&:not(:last-child)]:after:left-3 [&:not(:last-child)]:after:right-0 [&:not(:last-child)]:after:h-px [&:not(:last-child)]:after:bg-separator",
      )}
    >
      {/*
        The real control for the keyboard and assistive tech: one focusable
        button, correctly named, covering the row. The pointer is handled by
        the delegated row click above.
      */}
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(task)}
          aria-label={`Open ${task.title}`}
          className="absolute inset-0 cursor-pointer rounded-xl focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
        />
      ) : null}

      {/* Ticking must never open details, so the checkbox stays on top. */}
      <div className="relative z-10">
        <Checkbox
          checked={completed}
          onToggle={() => onToggle(task)}
          color={checkColor}
          aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
        />
      </div>

      <span className="relative min-w-0 flex-1 truncate">
        <span
          className={cn(
            "text-body transition-colors duration-200",
            completed ? "text-label-tertiary" : "text-label",
            // The hover cue belongs to the row, because the row is what responds.
            onOpen && "group-hover:text-blue",
          )}
        >
          {task.title}
        </span>
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
          className="hit-44 relative z-10 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-label-tertiary opacity-0 transition-opacity duration-150 hover:text-label-secondary focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 group-hover:opacity-100"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
