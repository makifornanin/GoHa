import type { Task } from "@/db/types";
import type { IsoDate } from "@/lib/date";
import type { DaySignal, ScoredTask } from "@/lib/today-brain";
import { daysLate } from "@/lib/today-brain";

/**
 * The shape of the brief an automation receives.
 *
 * Deliberately a projection of `DaySignal` rather than a second opinion: the
 * ranking, the headline and the reasons are the app's own, produced by the same
 * `deriveDaySignal` the Today screen renders. SQL could find late tasks, but it
 * could not reproduce this judgement, and a reimplementation drifts from the
 * app the first time the ranking improves.
 *
 * Pure, so the contract external automations depend on is unit-tested here
 * rather than discovered in production by a notification that says the wrong
 * thing.
 */

export type BriefTask = {
  id: string;
  title: string;
  priority: Task["priority"];
  daysLate: number;
  /** A real deep link: Focus preselects this task. */
  focusPath: string;
  /** Why the app picked it, in the app's words. Empty for the headline task. */
  reason: string;
};

export type BriefPayload = {
  /** The owner's local date this brief describes. */
  date: IsoDate;
  timeZone: string;
  generatedAt: string;
  state: DaySignal["state"];
  headline: string;
  detail: string;
  lateCount: number;
  completedToday: number;
  totalToday: number;
  habitsRemaining: number;
  canReflect: boolean;
  /** The one thing to start with, or null when there is nothing to act on. */
  task: BriefTask | null;
  /** Ranked alternatives, already excluding what is pinned. */
  suggestions: BriefTask[];
  /**
   * True when there is genuinely nothing worth interrupting someone for. The
   * guide's first operating rule is never to notify when there is nothing to
   * act on, and that decision should not be re-derived by every flow.
   */
  quiet: boolean;
};

function briefTask(task: Task, today: IsoDate, timeZone: string, reason = ""): BriefTask {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    daysLate: daysLate(task, today, timeZone),
    focusPath: `/focus?taskId=${task.id}`,
    reason,
  };
}

export function toBriefPayload(params: {
  signal: DaySignal;
  today: IsoDate;
  timeZone: string;
  now: Date;
}): BriefPayload {
  const { signal, today, timeZone } = params;
  const suggestions = signal.suggestions.map((scored: ScoredTask) =>
    briefTask(scored.task, today, timeZone, scored.reason),
  );

  return {
    date: today,
    timeZone,
    generatedAt: params.now.toISOString(),
    state: signal.state,
    headline: signal.headline,
    detail: signal.detail,
    lateCount: signal.lateCount,
    completedToday: signal.completedToday,
    totalToday: signal.totalToday,
    habitsRemaining: signal.habitsRemaining,
    canReflect: signal.canReflect,
    task: signal.task ? briefTask(signal.task, today, timeZone) : null,
    suggestions,
    // Nothing late, nothing to start, no habit outstanding: there is no message
    // worth sending. "Clear" and "done" are states, not news.
    quiet:
      signal.lateCount === 0 &&
      signal.habitsRemaining === 0 &&
      signal.task === null &&
      suggestions.length === 0,
  };
}
