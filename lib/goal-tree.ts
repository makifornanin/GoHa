import type { GoalProgressMode, GoalStatus } from "@/db/schema/enums";
import {
  calculateGoalProgress,
  type GoalProgressResult,
  type GoalTaskCounts,
} from "@/lib/goal-progress";

/**
 * The goal hierarchy, as a pure function of the goal list.
 *
 * GoHa's chain is Life Area -> Goal -> Subgoal -> To-do -> Subtask, and the
 * middle two levels are the SAME table: a subgoal is a `goals` row with
 * `parentGoalId` set. That is the right storage model (one set of statuses, one
 * progress rule, one ownership check) but it is also exactly why the two read
 * as identical on screen, so the difference has to be made somewhere. It is
 * made here, once, and every surface reads it from this module.
 *
 * Deliberately free of Drizzle and of `server-only`: the goals list, the goal
 * detail page, the planner and the tests all need these answers, and half of
 * them run in the browser. The repository supplies rows; this decides shape.
 */

/** The minimum a goal needs in order to take part in the hierarchy. */
export type GoalNodeInput = {
  id: string;
  parentGoalId: string | null;
  title: string;
  status: GoalStatus;
  progressMode: GoalProgressMode;
  manualProgress: number | null;
  lifeAreaId: string | null;
  totalTasks: number;
  completedTasks: number;
  cancelledTasks: number;
};

/**
 * How deep the tree is allowed to go.
 *
 * Two levels is the product: a Goal is an outcome, a Subgoal is a checkpoint on
 * the way to it. A third level is a To-do wearing a goal's clothes, and the
 * moment it exists the breadcrumb stops fitting on a phone. The DATABASE still
 * permits arbitrary depth, and an old row may already be deeper, so nothing
 * here throws on one: `goalDepth` reports what is actually there, and the rule
 * below only refuses to CREATE past it.
 */
export const MAX_GOAL_DEPTH = 2;

/** Where a goal sits in the chain. */
export type GoalLevel = "goal" | "subgoal";

export function goalLevel(goal: { parentGoalId: string | null }): GoalLevel {
  return goal.parentGoalId ? "subgoal" : "goal";
}

/**
 * Children by parent id. Built once and reused, because every other function
 * here would otherwise re-scan the whole list once per goal.
 */
export function childrenByParent<T extends { id: string; parentGoalId: string | null }>(
  goals: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const goal of goals) {
    if (!goal.parentGoalId) continue;
    const list = map.get(goal.parentGoalId);
    if (list) list.push(goal);
    else map.set(goal.parentGoalId, [goal]);
  }
  return map;
}

/**
 * Every goal beneath `rootId`, breadth-first, excluding the root itself.
 *
 * Guarded against cycles by the `seen` set rather than by trusting the data. A
 * cycle cannot be created through the app (the Server Action walks ancestors
 * before assigning a parent) but this also runs over rows written by earlier
 * builds, and an infinite loop inside a render is not a recoverable error.
 */
export function descendants<T extends { id: string; parentGoalId: string | null }>(
  goals: readonly T[],
  rootId: string,
): T[] {
  const byParent = childrenByParent(goals);
  const out: T[] = [];
  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    for (const child of byParent.get(queue.shift()!) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      queue.push(child.id);
    }
  }
  return out;
}

/** Ids of everything under `rootId`. The cycle-safe set the forms exclude. */
export function descendantIds<T extends { id: string; parentGoalId: string | null }>(
  goals: readonly T[],
  rootId: string,
): Set<string> {
  return new Set(descendants(goals, rootId).map((goal) => goal.id));
}

/**
 * The chain from the top-level goal down to `goalId`, inclusive.
 *
 * Root first, so it renders straight into a breadcrumb. Returns an empty array
 * for an unknown id, which is what a deleted goal looks like to a page that was
 * already open when it went away.
 */
export function ancestorPath<T extends { id: string; parentGoalId: string | null }>(
  goals: readonly T[],
  goalId: string,
): T[] {
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(goalId) ?? null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentGoalId ? (byId.get(current.parentGoalId) ?? null) : null;
  }
  return path;
}

/** How many levels below the top this goal sits. A top-level goal is 0. */
export function goalDepth<T extends { id: string; parentGoalId: string | null }>(
  goals: readonly T[],
  goalId: string,
): number {
  return Math.max(0, ancestorPath(goals, goalId).length - 1);
}

/**
 * Task counts for a goal INCLUDING everything under it.
 *
 * The bug this fixes was quiet and expensive. The repository counts tasks whose
 * `goal_id` is the goal itself, so someone who did the right thing, broke "Find
 * a new job" into four subgoals and hung every to-do off those, watched the
 * goal sit at 0% forever while its subgoals filled up. The parent looked
 * abandoned precisely because it was being worked on properly.
 *
 * Rolling up is the honest reading: a goal is finished when the work under it
 * is finished, wherever in its tree that work is filed. Cancelled tasks stay
 * excluded by `calculateGoalProgress`, which still owns the arithmetic.
 */
export function rollupTaskCounts<T extends GoalNodeInput>(
  goals: readonly T[],
  goalId: string,
): GoalTaskCounts {
  const self = goals.find((goal) => goal.id === goalId);
  const counted = self ? [self, ...descendants(goals, goalId)] : [];
  return counted.reduce<GoalTaskCounts>(
    (sum, goal) => ({
      total: sum.total + goal.totalTasks,
      completed: sum.completed + goal.completedTasks,
      cancelled: sum.cancelled + goal.cancelledTasks,
    }),
    { total: 0, completed: 0, cancelled: 0 },
  );
}

export type GoalProgressBreakdown = GoalProgressResult & {
  /** Counts for this goal alone, as stored. */
  own: GoalTaskCounts;
  /** Counts including every descendant goal's tasks. */
  rolled: GoalTaskCounts;
  /** True when a descendant contributed anything, i.e. the two differ. */
  includesSubgoals: boolean;
  /** Direct children, of any status. */
  subgoalCount: number;
  /** Direct children whose status is `completed`. */
  subgoalsCompleted: number;
};

/**
 * A goal's progress, its subgoal tally, and where the number came from.
 *
 * One function, so no surface has to remember to roll up. `manual` and
 * `completed` goals are untouched by any of this: `calculateGoalProgress`
 * short-circuits both before tasks are ever consulted, so a hand-set goal keeps
 * reading exactly what its owner typed.
 */
export function goalProgressBreakdown<T extends GoalNodeInput>(
  goals: readonly T[],
  goalId: string,
): GoalProgressBreakdown {
  const goal = goals.find((entry) => entry.id === goalId);
  const own: GoalTaskCounts = goal
    ? { total: goal.totalTasks, completed: goal.completedTasks, cancelled: goal.cancelledTasks }
    : { total: 0, completed: 0, cancelled: 0 };
  const rolled = rollupTaskCounts(goals, goalId);
  const children = goals.filter((entry) => entry.parentGoalId === goalId);

  const result = calculateGoalProgress({
    status: goal?.status ?? "not_started",
    progressMode: goal?.progressMode ?? "auto",
    manualProgress: goal?.manualProgress ?? null,
    tasks: rolled,
  });

  return {
    ...result,
    own,
    rolled,
    includesSubgoals:
      rolled.total !== own.total ||
      rolled.completed !== own.completed ||
      rolled.cancelled !== own.cancelled,
    subgoalCount: children.length,
    subgoalsCompleted: children.filter((child) => child.status === "completed").length,
  };
}

/**
 * Why a goal may not become another's parent.
 *
 * Three different mistakes, reported separately so the form can say which one
 * happened instead of just refusing: a goal cannot parent itself, cannot be
 * parented by its own descendant (a cycle nothing can render), and cannot be
 * nested under something that is already a subgoal (a third level the product
 * does not have).
 */
export type ParentRejection = "self" | "cycle" | "too_deep" | null;

export function rejectParent<T extends { id: string; parentGoalId: string | null }>(
  goals: readonly T[],
  goalId: string | null,
  candidateParentId: string,
): ParentRejection {
  if (goalId && candidateParentId === goalId) return "self";
  if (goalId && descendantIds(goals, goalId).has(candidateParentId)) return "cycle";
  const candidate = goals.find((goal) => goal.id === candidateParentId);
  if (candidate?.parentGoalId) return "too_deep";
  return null;
}

/** The human sentence for a rejection, shared by the form and the action. */
export const PARENT_REJECTION_MESSAGE: Record<Exclude<ParentRejection, null>, string> = {
  self: "A goal cannot be its own parent.",
  cycle: "That goal already sits underneath this one.",
  too_deep: "Subgoals cannot have subgoals of their own. Add a to-do instead.",
};

/** Goals that may be offered as a parent for `goalId` (null when creating). */
export function eligibleParents<T extends { id: string; parentGoalId: string | null }>(
  goals: readonly T[],
  goalId: string | null,
): T[] {
  return goals.filter((goal) => rejectParent(goals, goalId, goal.id) === null);
}

/**
 * Goals as a flat, ORDERED list of options, with subgoals shown under parents.
 *
 * Every "choose a goal" control in the app was a flat alphabetical-ish dropdown
 * of every row in the table, so "Finish resume" and "Find a new job" sat side by
 * side as equals and the person picking one could not tell which was which. The
 * hierarchy exists precisely so a to-do can be filed against a milestone rather
 * than a whole ambition; a picker that hides it makes that impossible to do on
 * purpose.
 *
 * Each subgoal is labelled with its parent, so the option reads the way the
 * breadcrumb does. Archived goals are dropped: assigning work to something the
 * user has shelved is never the intent.
 */
export function goalPickerOptions<
  T extends { id: string; parentGoalId: string | null; title: string; isArchived?: boolean },
>(
  goals: readonly T[],
  /**
   * A goal to list even if it is archived, because it is the CURRENT choice.
   *
   * Without this, a to-do whose goal was archived showed "Select..." in its
   * detail panel: the row still carried the goal id, but the picker had
   * filtered the archived goal out, so the control fell back to a placeholder
   * and the to-do looked unlinked when it was not. Browser QA caught it after
   * archiving a goal tree. The value is never silently dropped (the panel
   * patches from the task, not the select), but the display was a lie.
   */
  selectedId?: string | null,
): { id: string; label: string; depth: 0 | 1 }[] {
  const active = goals.filter((goal) => !goal.isArchived || goal.id === selectedId);
  const byParent = childrenByParent(active);
  const out: { id: string; label: string; depth: 0 | 1 }[] = [];

  /** An archived goal is still shown when it is the current choice; say so. */
  const label = (goal: T, text: string) =>
    goal.isArchived ? `${text} (archived)` : text;

  for (const goal of active) {
    if (goal.parentGoalId) continue;
    out.push({ id: goal.id, label: label(goal, goal.title), depth: 0 });
    for (const child of byParent.get(goal.id) ?? []) {
      // A middle dot rather than an indent: a native <select> collapses leading
      // whitespace, and this control has to read the same in both.
      out.push({
        id: child.id,
        label: label(child, `${goal.title} › ${child.title}`),
        depth: 1,
      });
    }
  }

  /*
   * Anything orphaned still has to be offerable.
   *
   * A subgoal whose parent is archived is not reachable through the loop above,
   * and silently dropping it would make an existing to-do's own goal vanish
   * from the picker that is meant to show it.
   */
  const listed = new Set(out.map((option) => option.id));
  for (const goal of active) {
    if (!listed.has(goal.id)) out.push({ id: goal.id, label: label(goal, goal.title), depth: 0 });
  }

  return out;
}
