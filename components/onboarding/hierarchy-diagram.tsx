import { ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type HierarchyRow = {
  /** "Life Area", "Goal", "Subgoal", "To-do". */
  level: string;
  /**
   * The worked example at that level.
   *
   * Optional, because the welcome screen shows the SHAPE before any example
   * exists to hang on it: naming the four levels is the whole point there, and
   * a worked example on screen one would pre-empt the two screens that teach it.
   */
  example?: string;
  /** Dim this row: it is context for the rows being taught, not the point. */
  muted?: boolean;
};

/**
 * The chain, drawn.
 *
 * The single most important thing onboarding has to convey is that GoHa's four
 * levels are ONE line, not four features. A paragraph saying so is read once
 * and forgotten; a stack of rows with arrows between them is the shape itself,
 * and the reader gets it before finishing the sentence above it.
 *
 * The example is always concrete. "A goal is a meaningful outcome" teaches
 * nothing; "Find a new job" over "Finish resume" over "Rewrite experience
 * section" teaches the whole model in three lines, because everybody already
 * knows how those three relate.
 *
 * Rendered as an ordered list rather than divs: the order is the meaning, and a
 * screen reader should hear it as a sequence. The arrows are decorative, so the
 * level names carry the relationship in text.
 */
export function HierarchyDiagram({
  rows,
  compact = false,
  className,
}: {
  rows: HierarchyRow[];
  /**
   * The welcome-screen form: level names only, lighter chrome, tighter rows.
   *
   * Screen one has room left over because every step shares one grid cell, and
   * the cell is as tall as the tallest step. Filling it with more prose would
   * make the first thing a newcomer meets a wall of text; filling it with the
   * SHAPE reinforces the one idea the whole product rests on, before the next
   * two screens put a worked example on it.
   */
  compact?: boolean;
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {rows.map((row, index) => (
        <li key={row.level} className="flex flex-col">
          {index > 0 ? (
            <ArrowDown
              className={cn(
                "shrink-0 text-label-quaternary",
                compact ? "my-1 ml-3 size-3" : "my-0.5 ml-4 size-3.5",
              )}
              aria-hidden
            />
          ) : null}
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border transition-opacity",
              compact ? "px-3 py-1.5" : "px-3 py-2",
              row.muted
                ? "border-separator bg-transparent opacity-60"
                : compact
                  ? "border-separator-opaque bg-surface-secondary"
                  : "border-separator-opaque bg-surface shadow-e1",
            )}
            /* Indent each level slightly so the nesting is visible even with
               the arrows stripped out by a high-contrast or reduced-motion
               setting. Capped at three steps so a phone never overflows. */
            style={{ marginLeft: `${Math.min(index, 3) * 10}px` }}
          >
            <span
              className={cn(
                "shrink-0 font-medium uppercase tracking-wide text-label-tertiary",
                compact ? "text-footnote" : "w-20 text-footnote",
              )}
            >
              {row.level}
            </span>
            {row.example ? (
              <span className="min-w-0 flex-1 truncate text-callout text-label">{row.example}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
