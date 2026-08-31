import type { GoalProgressMode, GoalStatus } from "@/db/schema/enums";

/**
 * Goal progress calculation. This is the single, authoritative definition of how
 * a goal's completion percentage is derived. It is a pure function (no I/O) so it
 * can be reused on the server and client and unit-tested exhaustively.
 *
 * ── Rules ────────────────────────────────────────────────────────────────────
 * A goal's progress is an integer 0-100 decided in this order:
 *
 *  1. COMPLETED GOAL: if the goal's status is `completed`, progress is 100,
 *     regardless of tasks or manual value. A completed goal is done.
 *
 *  2. MANUAL MODE (`progressMode = 'manual'`): progress is `manualProgress`
 *     (clamped to 0-100; null is treated as 0). Linked to-dos do not affect it.
 *     This suits goals measured by a number, not a checklist (e.g. "save 6
 *     months of expenses"). Intentional changes are journaled in
 *     `goal_progress_updates`; the value is never recomputed on render.
 *
 *  3. AUTO MODE (`progressMode = 'auto'`, the default): progress is derived from
 *     the goal's linked tasks:
 *       - CANCELLED tasks are excluded entirely (neither numerator nor
 *         denominator). They represent work deliberately dropped.
 *       - Let `counted = total - cancelled` (todo + in_progress + completed).
 *       - Let `done = completed tasks` (status `completed`), clamped to `counted`.
 *       - If `counted > 0`: progress = round(done / counted * 100).
 *       - ZERO LINKED (or all-cancelled) tasks: `counted = 0`, so progress is 0.
 *         An auto goal with nothing to measure has made no measurable progress.
 *
 * The derived value is computed on read and is NEVER written back to the goals
 * row (CLAUDE.md section 7: no duplicated, drift-prone data).
 */

/** Task counts for a single goal, as returned by the repository. */
export type GoalTaskCounts = {
  /** All tasks linked to the goal, any status (including done and cancelled). */
  total: number;
  /** Linked to-dos with status `done`. */
  completed: number;
  /** Linked to-dos with status `cancelled`. */
  cancelled: number;
};

export type GoalProgressSource = "completed" | "manual" | "tasks" | "none";

export type GoalProgressResult = {
  /** Integer 0-100. */
  percent: number;
  /** Which rule produced the value (useful for UI hints and tests). */
  source: GoalProgressSource;
};

export const EMPTY_TASK_COUNTS: GoalTaskCounts = { total: 0, completed: 0, cancelled: 0 };

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function calculateGoalProgress(params: {
  status: GoalStatus;
  progressMode: GoalProgressMode;
  manualProgress: number | null;
  tasks: GoalTaskCounts;
}): GoalProgressResult {
  // 1. A completed goal always reads 100%.
  if (params.status === "completed") {
    return { percent: 100, source: "completed" };
  }

  // 2. Manual mode: the stored value wins, tasks are ignored.
  if (params.progressMode === "manual") {
    return { percent: clampPercent(params.manualProgress ?? 0), source: "manual" };
  }

  // 3. Auto mode: derive from tasks, excluding cancelled from the denominator.
  const counted = Math.max(0, params.tasks.total - params.tasks.cancelled);
  if (counted === 0) {
    return { percent: 0, source: "none" };
  }
  const done = Math.min(Math.max(0, params.tasks.completed), counted);
  return { percent: clampPercent((done / counted) * 100), source: "tasks" };
}
