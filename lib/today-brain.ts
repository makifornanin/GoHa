import type { DailyPriority, HabitEntry, Task } from "@/db";
import type { GoalWithCounts } from "@/db/repositories/goals";
import { MANILA_TZ, toZonedDate, type IsoDate } from "@/lib/date";
import { deriveTodayHabits } from "@/lib/habit-view";
import { taskEffectiveDate } from "@/lib/task-buckets";
import { taskPriorityConfig } from "@/lib/tasks";

/**
 * Today's judgement layer.
 *
 * The dashboard could already COUNT things ("0/0 done, 2 overdue") but never
 * formed an opinion, so the user still had to work out what to do next from raw
 * numbers with two overdue tasks sitting silently below the fold. This module
 * turns the same canonical records into one ranked recommendation and a
 * defensible Top 3, and nothing else: it is pure, injectable on `now`, and
 * stores nothing (CLAUDE.md section 7).
 *
 * There is deliberately no model, no prediction and no hidden heuristic. The
 * score is a small set of stated rules the user can reason about, and every
 * recommendation carries the reason that produced it.
 */

const ACTIVE = new Set(["todo", "in_progress"]);

/** Days a task is past its effective date. 0 when it is today or undated. */
export function daysLate(task: Task, today: IsoDate, timeZone: string = MANILA_TZ): number {
  const effective = taskEffectiveDate(task, timeZone);
  if (!effective || effective >= today) return 0;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${effective}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export type ScoredTask = {
  task: Task;
  score: number;
  /** Plain-language justification, shown to the user verbatim. */
  reason: string;
};

/**
 * Rank the open work by how much it deserves attention right now.
 *
 * The weights are intentionally coarse and readable rather than tuned:
 * lateness dominates (a late task is a promise already broken), priority is the
 * user's own stated ordering, and the remaining nudges break ties. Anything
 * finer would be false precision on a single person's to-do list.
 */
export function scoreTasks(params: {
  tasks: Task[];
  today: IsoDate;
  timeZone?: string;
  goalById?: Map<string, GoalWithCounts>;
  /** Tasks already pinned; excluded from suggestions. */
  excludeIds?: ReadonlySet<string>;
}): ScoredTask[] {
  const timeZone = params.timeZone ?? MANILA_TZ;
  const exclude = params.excludeIds ?? new Set<string>();
  const scored: ScoredTask[] = [];

  for (const task of params.tasks) {
    if (!ACTIVE.has(task.status) || exclude.has(task.id)) continue;

    const late = daysLate(task, params.today, timeZone);
    const effective = taskEffectiveDate(task, timeZone);
    const isToday = effective === params.today;
    const priority = taskPriorityConfig[task.priority];
    const goal = task.goalId ? params.goalById?.get(task.goalId) : undefined;

    let score = 0;
    const reasons: string[] = [];

    if (late > 0) {
      // Capped so a task forgotten for a year cannot drown out everything else.
      score += 100 + Math.min(late, 30) * 4;
      reasons.push(late === 1 ? "1 day late" : `${late} days late`);
    } else if (isToday) {
      score += 50;
      reasons.push("scheduled today");
    }

    score += priority.weight * 15;
    if (priority.weight >= 2) reasons.push(`${priority.label.toLowerCase()} priority`);

    // Already started: finishing beats starting something new.
    if (task.status === "in_progress") {
      score += 20;
      reasons.push("already in progress");
    }

    // A hard deadline today outranks a soft plan for today.
    if (task.dueAt && toZonedDate(task.dueAt, timeZone) === params.today) {
      score += 12;
      if (late === 0) reasons.push("due today");
    }

    if (goal && goal.status === "active") {
      score += 8;
      reasons.push(`moves "${goal.title}"`);
    }

    // Undated work is real but never urgent; keep it below anything scheduled.
    if (!effective) score -= 10;

    scored.push({
      task,
      score,
      reason: reasons.length > 0 ? reasons.slice(0, 2).join(" · ") : "next in your list",
    });
  }

  return scored.sort(
    (a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title),
  );
}

export type DayState = "late" | "focus" | "plan" | "clear" | "done";

export type DaySignal = {
  state: DayState;
  /** One line, the app's actual opinion. */
  headline: string;
  /** Why it thinks so. Empty when there is nothing to justify. */
  detail: string;
  /** The task to act on, when there is one. */
  task: Task | null;
  lateCount: number;
  completedToday: number;
  totalToday: number;
  habitsRemaining: number;
  /** Ranked candidates for a one-tap Top 3. */
  suggestions: ScoredTask[];
  /** True once the scheduled work is finished but the day is not over. */
  canReflect: boolean;
};

/**
 * The single read on the day: what state it is in, what to do next, and why.
 *
 * Ordering matters and is the whole point. Late work is surfaced before
 * anything else because it is the one thing the user has already failed to do;
 * an empty "no focus set" message shown above two overdue tasks was the exact
 * failure this replaces.
 */
export function deriveDaySignal(params: {
  tasks: Task[];
  goals: GoalWithCounts[];
  priorities: DailyPriority[];
  habits: Parameters<typeof deriveTodayHabits>[0];
  habitEntries: HabitEntry[];
  today: IsoDate;
  timeZone?: string;
  /** Local hour 0-23, for the evening reflection nudge. */
  hour: number;
}): DaySignal {
  const timeZone = params.timeZone ?? MANILA_TZ;
  const goalById = new Map(params.goals.map((g) => [g.id, g]));
  const pinnedIds = new Set(
    params.priorities.map((p) => p.taskId).filter((id): id is string => Boolean(id)),
  );

  const taskById = new Map(params.tasks.map((t) => [t.id, t]));
  const pinnedOpen = [...pinnedIds]
    .map((id) => taskById.get(id))
    .filter((t): t is Task => Boolean(t) && ACTIVE.has(t!.status));

  let completedToday = 0;
  let totalToday = 0;
  for (const task of params.tasks) {
    if (taskEffectiveDate(task, timeZone) !== params.today) continue;
    if (task.status === "cancelled") continue;
    totalToday += 1;
    if (task.status === "completed") completedToday += 1;
  }

  const ranked = scoreTasks({
    tasks: params.tasks,
    today: params.today,
    timeZone,
    goalById,
    excludeIds: pinnedIds,
  });
  const lateRanked = ranked.filter((s) => daysLate(s.task, params.today, timeZone) > 0);
  const lateCount =
    lateRanked.length + pinnedOpen.filter((t) => daysLate(t, params.today, timeZone) > 0).length;

  const todayHabits = deriveTodayHabits(params.habits, params.habitEntries, params.today, timeZone);
  const habitsRemaining = todayHabits.filter((h) => h.todayState !== "done").length;

  const openScheduled = params.tasks.filter(
    (t) => ACTIVE.has(t.status) && taskEffectiveDate(t, timeZone) === params.today,
  ).length;
  const nothingPlanned = totalToday === 0 && lateCount === 0 && ranked.length === 0;

  // A pinned, still-open priority is the user's own stated intent and outranks
  // anything the scorer would pick on its own.
  const pinnedNext = pinnedOpen.sort(
    (a, b) =>
      daysLate(b, params.today, timeZone) - daysLate(a, params.today, timeZone) ||
      taskPriorityConfig[b.priority].weight - taskPriorityConfig[a.priority].weight,
  )[0];

  const suggestions = ranked.slice(0, 3);

  if (lateCount > 0) {
    const first = lateRanked[0] ?? (pinnedNext ? { task: pinnedNext, score: 0, reason: "" } : null);
    const target = first?.task ?? null;
    const late = target ? daysLate(target, params.today, timeZone) : 0;
    return {
      state: "late",
      headline:
        lateCount === 1 ? "One thing slipped" : `${lateCount} things have slipped`,
      detail: target
        ? `Start with "${target.title}" — ${late === 1 ? "a day" : `${late} days`} late.`
        : "Clear the overdue work first.",
      task: target,
      lateCount,
      completedToday,
      totalToday,
      habitsRemaining,
      suggestions,
      canReflect: false,
    };
  }

  if (pinnedNext) {
    return {
      state: "focus",
      headline: "Your focus right now",
      detail: `"${pinnedNext.title}" is pinned for today.`,
      task: pinnedNext,
      lateCount,
      completedToday,
      totalToday,
      habitsRemaining,
      suggestions,
      canReflect: false,
    };
  }

  if (nothingPlanned) {
    return {
      state: "clear",
      headline: "A clean slate",
      detail: "Nothing is scheduled. What is the one thing that would make today count?",
      task: null,
      lateCount,
      completedToday,
      totalToday,
      habitsRemaining,
      suggestions,
      canReflect: false,
    };
  }

  if (openScheduled === 0 && totalToday > 0) {
    // Everything scheduled is finished. Say so, and only then look forward.
    const evening = params.hour >= 17;
    return {
      state: "done",
      headline: habitsRemaining > 0 ? "To-dos done, habits left" : "Today is clear",
      detail:
        habitsRemaining > 0
          ? `${completedToday} of ${totalToday} done. ${habitsRemaining} habit${habitsRemaining === 1 ? "" : "s"} still to check in.`
          : evening
            ? `${completedToday} of ${totalToday} done. Worth a look back before you stop.`
            : `${completedToday} of ${totalToday} done. Pull something forward, or stop here.`,
      task: suggestions[0]?.task ?? null,
      lateCount,
      completedToday,
      totalToday,
      habitsRemaining,
      suggestions,
      canReflect: evening,
    };
  }

  const top = suggestions[0] ?? null;
  return {
    state: "plan",
    headline: top ? "Start here" : "Pick your focus",
    detail: top ? `"${top.task.title}" — ${top.reason}.` : "Pin up to three priorities for today.",
    task: top?.task ?? null,
    lateCount,
    completedToday,
    totalToday,
    habitsRemaining,
    suggestions,
    canReflect: false,
  };
}
