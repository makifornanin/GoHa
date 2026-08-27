import type { DailyQuote, HabitEntry, Task } from "@/db";
import type { DailyInspirationPayload } from "@/lib/inspiration/resolve";
import type { GoalWithCounts } from "@/db/repositories/goals";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import type { IsoDate, Weekday } from "@/lib/date";
import { calculateGoalProgress } from "@/lib/goal-progress";
import { hasDaySpecificAutomationCadence } from "@/lib/automation/habits";
import { buildHabitViews } from "@/lib/habit-view";
import { taskEffectiveDate } from "@/lib/task-buckets";
import { daysLate, type DaySignal, type ScoredTask } from "@/lib/today-brain";

/**
 * The morning payload (automation Guide 01, phase 2).
 *
 * A projection of the app's own judgement rather than a second opinion: the
 * ranking, the headline and the reasons all come from `deriveDaySignal`, the
 * same function the Today screen renders. SQL could find late tasks; it could
 * not reproduce this, and a reimplementation drifts from the app the first time
 * the ranking improves.
 *
 * Pure, so the contract external automations depend on is unit-tested here
 * rather than discovered in production by a notification that says the wrong
 * thing at seven in the morning.
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
  /** Present when the task carries one; the narrator may quote it. */
  description: string | null;
  dueAt: string | null;
  goalTitle: string | null;
};

export type BriefHabit = {
  id: string;
  name: string;
  state: "pending" | "partial" | "done" | "skip" | "miss" | "off";
  currentStreak: number;
  targetValue: number | null;
  unit: string | null;
};

export type BriefGoal = {
  id: string;
  title: string;
  progress: number;
  targetDate: string | null;
};

export type MorningBriefPayload = {
  localDate: IsoDate;
  timezone: string;
  isSabbath: boolean;
  generatedAt: string;
  quote: { text: string; attribution: string | null; translation: string | null } | null;
  /**
   * The canonical Daily Inspiration for this user and local date.
   *
   * The SAME stored record the Today card renders, not a second lookup: n8n and
   * the app cannot show different things on one morning. Structured data only;
   * GoHa does not compose the sentence around it, which stays Gemini's job in
   * the workflow.
   *
   * Null only when the day could not be resolved at all. `quote` above is the
   * older curated-pool pick and is kept so the existing workflow does not break
   * the moment this ships.
   */
  dailyInspiration: DailyInspirationPayload | null;
  recommendation: string;
  reason: string;
  state: DaySignal["state"];
  topPriorities: BriefTask[];
  tasks: {
    /** NEVER truncated. Overflow is a display problem, not a data one. */
    overdue: BriefTask[];
    dueToday: BriefTask[];
    scheduledToday: BriefTask[];
  };
  habitsToday: BriefHabit[];
  activeGoals: BriefGoal[];
  counts: { completedToday: number; totalToday: number; habitsRemaining: number };
  /** True when the log already holds brief:morning:{localDate}. */
  alreadyDelivered: boolean;
  /** Nothing worth interrupting anyone for. */
  quiet: boolean;
};

function toBriefTask(
  task: Task,
  today: IsoDate,
  timeZone: string,
  goalTitles: Map<string, string>,
  reason = "",
): BriefTask {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    daysLate: daysLate(task, today, timeZone),
    focusPath: `/focus?taskId=${task.id}`,
    reason,
    description: task.description,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    goalTitle: task.goalId ? goalTitles.get(task.goalId) ?? null : null,
  };
}

const OPEN = new Set(["todo", "in_progress"]);

export function toMorningPayload(params: {
  signal: DaySignal;
  tasks: Task[];
  goals: GoalWithCounts[];
  habits: HabitWithSchedule[];
  habitEntries: HabitEntry[];
  quote: DailyQuote | null;
  /** Already resolved and persisted by the caller; passed through verbatim. */
  dailyInspiration?: DailyInspirationPayload | null;
  alreadyDelivered: boolean;
  today: IsoDate;
  timeZone: string;
  weekStartsOn: Weekday;
  isSabbath: boolean;
  now: Date;
}): MorningBriefPayload {
  const { signal, today, timeZone } = params;
  const goalTitles = new Map(params.goals.map((goal) => [goal.id, goal.title]));
  const asBrief = (task: Task, reason = "") =>
    toBriefTask(task, today, timeZone, goalTitles, reason);

  /*
   * The overdue set is complete, deliberately (Guide 01 revision highlight).
   *
   * It used to be capped at five. A cap here is data truncation: the API stops
   * knowing about work the owner has already failed to do, and no downstream
   * step can put it back. Keeping the notification readable is the narrator's
   * problem, solved with an explicit "+N more" line, not by forgetting.
   */
  const overdue: BriefTask[] = [];
  const dueToday: BriefTask[] = [];
  const scheduledToday: BriefTask[] = [];

  for (const task of params.tasks) {
    if (!OPEN.has(task.status) || task.parentTaskId) continue;
    const late = daysLate(task, today, timeZone);
    if (late > 0) {
      overdue.push(asBrief(task));
      continue;
    }
    const effective = taskEffectiveDate(task, timeZone);
    if (effective !== today) continue;
    if (task.dueAt) dueToday.push(asBrief(task));
    else scheduledToday.push(asBrief(task));
  }

  overdue.sort((a, b) => b.daysLate - a.daysLate || a.title.localeCompare(b.title));

  const views = buildHabitViews({
    habits: params.habits,
    entries: params.habitEntries,
    today,
    weekStartsOn: params.weekStartsOn,
    timeZone,
  });

  const habitsToday: BriefHabit[] = views
    .filter(
      (view) => view.scheduledToday && hasDaySpecificAutomationCadence(view.schedule),
    )
    .map((view) => ({
      id: view.habit.id,
      name: view.habit.name,
      state: view.todayState as BriefHabit["state"],
      currentStreak: view.streaks.current,
      targetValue: view.habit.targetValue === null ? null : Number(view.habit.targetValue),
      unit: view.habit.unit,
    }));

  const activeGoals: BriefGoal[] = params.goals
    .filter((goal) => goal.status === "active" && !goal.isArchived)
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      progress: calculateGoalProgress({
        status: goal.status,
        progressMode: goal.progressMode,
        manualProgress: goal.manualProgress,
        tasks: {
          total: goal.totalTasks,
          completed: goal.completedTasks,
          cancelled: goal.cancelledTasks,
        },
      }).percent,
      targetDate: goal.targetDate,
    }));

  const topPriorities = signal.suggestions.map((scored: ScoredTask) =>
    asBrief(scored.task, scored.reason),
  );

  return {
    localDate: today,
    timezone: timeZone,
    isSabbath: params.isSabbath,
    generatedAt: params.now.toISOString(),
    quote: params.quote
      ? {
          text: params.quote.text,
          attribution: params.quote.attribution,
          translation: params.quote.translation,
        }
      : null,
    dailyInspiration: params.dailyInspiration ?? null,
    recommendation: signal.headline,
    reason: signal.detail,
    state: signal.state,
    topPriorities,
    tasks: { overdue, dueToday, scheduledToday },
    habitsToday,
    activeGoals,
    counts: {
      completedToday: signal.completedToday,
      totalToday: signal.totalToday,
      habitsRemaining: signal.habitsRemaining,
    },
    alreadyDelivered: params.alreadyDelivered,
    // Nothing late, nothing to start, no habit outstanding: there is no message
    // worth sending. Decided here so every workflow decides it the same way.
    quiet:
      overdue.length === 0 &&
      dueToday.length === 0 &&
      scheduledToday.length === 0 &&
      topPriorities.length === 0 &&
      signal.habitsRemaining === 0,
  };
}
