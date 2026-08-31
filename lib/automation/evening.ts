import type { DailyPriority, FocusSession, HabitEntry, Task } from "@/db";
import type { GoalWithCounts } from "@/db/repositories/goals";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import { hasDaySpecificAutomationCadence } from "@/lib/automation/habits";
import { toZonedDate, type IsoDate, type Weekday } from "@/lib/date";
import { buildHabitViews } from "@/lib/habit-view";
import { toNumberOrNull } from "@/lib/habits";
import { taskEffectiveDate } from "@/lib/task-buckets";
import { daysLate } from "@/lib/today-brain";

/**
 * The evening payload (automation Guide 02, phase 1).
 *
 * The model receives FINISHED NUMBERS, never raw rows. Two reasons, and the
 * second is the important one: a narrator handed raw data starts doing
 * arithmetic, and a narrator that does arithmetic gets it wrong occasionally
 * and confidently. Everything here is computed and closed before it leaves.
 *
 * Habit outcomes come from the shared derivation (audit R-06), which is this
 * guide's hard prerequisite: read from the raw entry status, a numeric habit
 * logged at 2 of 8 glasses is stored as `done`, and the summary would
 * congratulate the owner for a habit they missed.
 */

export type EveningTask = { title: string; priority: Task["priority"]; goalTitle: string | null };
export type EveningSlipped = EveningTask & { why: "overdue" | "scheduled" | "priority-slot" };

export type EveningHabit = {
  name: string;
  outcome: "done" | "partial" | "miss" | "skip" | "pending";
  value: number | null;
  target: number | null;
  unit: string | null;
  streakAfter: number;
};

export type EveningPayload = {
  localDate: IsoDate;
  timezone: string;
  isSabbath: boolean;
  generatedAt: string;
  tasksCompleted: EveningTask[];
  tasksPlannedNotDone: EveningSlipped[];
  habitOutcomes: EveningHabit[];
  focusMinutes: number;
  focus7DayAvg: number;
  streaksKept: string[];
  streaksBroken: string[];
  top3Result: { pinned: number; completed: number };
  alreadyDelivered: boolean;
  /** Set when detail=counts stripped titles before they left the server. */
  detailLevel: "full" | "counts";
};

const OPEN = new Set(["todo", "in_progress"]);

/**
 * `detail=counts` strips every title and description (Guide 02, step 1.4).
 *
 * To-do titles and goal names are intimate data, and this payload is sent to a
 * third-party model every evening. The switch exists so that is a deliberate
 * choice rather than a default nobody looked at.
 */
export function toEveningPayload(params: {
  tasks: Task[];
  goals: GoalWithCounts[];
  priorities: DailyPriority[];
  habits: HabitWithSchedule[];
  habitEntries: HabitEntry[];
  focusSessions: FocusSession[];
  today: IsoDate;
  timeZone: string;
  weekStartsOn: Weekday;
  isSabbath: boolean;
  alreadyDelivered: boolean;
  detail?: "full" | "counts";
  now: Date;
}): EveningPayload {
  const detail = params.detail ?? "full";
  const goalTitles = new Map(params.goals.map((goal) => [goal.id, goal.title]));
  const hide = detail === "counts";
  const name = (value: string, index: number) => (hide ? `task ${index + 1}` : value);
  const goalOf = (task: Task) => (hide ? null : task.goalId ? goalTitles.get(task.goalId) ?? null : null);

  const tasksCompleted: EveningTask[] = [];
  const tasksPlannedNotDone: EveningSlipped[] = [];
  const pinnedIds = new Set(
    params.priorities.map((p) => p.taskId).filter((id): id is string => Boolean(id)),
  );

  let index = 0;
  for (const task of params.tasks) {
    if (task.parentTaskId) continue;

    if (
      task.status === "completed" &&
      task.completedAt &&
      taskCompletedOn(task, params.today, params.timeZone)
    ) {
      tasksCompleted.push({
        title: name(task.title, index++),
        priority: task.priority,
        goalTitle: goalOf(task),
      });
      continue;
    }

    if (!OPEN.has(task.status)) continue;
    const late = daysLate(task, params.today, params.timeZone) > 0;
    const scheduledToday = taskEffectiveDate(task, params.timeZone) === params.today;
    if (!late && !scheduledToday && !pinnedIds.has(task.id)) continue;

    tasksPlannedNotDone.push({
      title: name(task.title, index++),
      priority: task.priority,
      goalTitle: goalOf(task),
      why: late ? "overdue" : pinnedIds.has(task.id) ? "priority-slot" : "scheduled",
    });
  }

  const views = buildHabitViews({
    habits: params.habits,
    entries: params.habitEntries,
    today: params.today,
    weekStartsOn: params.weekStartsOn,
    timeZone: params.timeZone,
  });

  const habitOutcomes: EveningHabit[] = [];
  const streaksKept: string[] = [];
  const streaksBroken: string[] = [];

  for (const view of views) {
    if (!view.scheduledToday || !hasDaySpecificAutomationCadence(view.schedule)) continue;
    // Habit NAMES survive counts mode: they are the owner's own words but they
    // carry no third-party detail, and a summary that cannot say which habit
    // slipped is not a summary.
    const outcome = view.todayState as EveningHabit["outcome"];
    habitOutcomes.push({
      name: view.habit.name,
      outcome,
      value: view.todayEntry ? toNumberOrNull(view.todayEntry.value) : null,
      target: view.habit.targetValue === null ? null : Number(view.habit.targetValue),
      unit: view.habit.unit,
      streakAfter: view.streaks.current,
    });
    if (outcome === "done") streaksKept.push(view.habit.name);
    else if (outcome === "miss" || outcome === "partial") streaksBroken.push(view.habit.name);
  }

  let focusSecondsToday = 0;
  let focusSecondsWindow = 0;
  for (const session of params.focusSessions) {
    const seconds = session.durationSeconds ?? 0;
    if (seconds <= 0) continue;
    focusSecondsWindow += seconds;
    if (session.sessionDate === params.today) focusSecondsToday += seconds;
  }

  const pinnedTasks = params.tasks.filter((task) => pinnedIds.has(task.id));

  return {
    localDate: params.today,
    timezone: params.timeZone,
    isSabbath: params.isSabbath,
    generatedAt: params.now.toISOString(),
    tasksCompleted,
    tasksPlannedNotDone,
    habitOutcomes,
    focusMinutes: Math.round(focusSecondsToday / 60),
    // The 7-day window includes today, so "versus the average" compares like
    // with like rather than today against the six days before it.
    focus7DayAvg: Math.round(focusSecondsWindow / 60 / 7),
    streaksKept,
    streaksBroken,
    top3Result: {
      pinned: pinnedIds.size,
      completed: pinnedTasks.filter((task) => task.status === "completed").length,
    },
    alreadyDelivered: params.alreadyDelivered,
    detailLevel: detail,
  };
}

/**
 * Completed on the given local day, by the instant it was completed.
 *
 * Through `toZonedDate` rather than a local Intl formatter: every local-date
 * derivation in GoHa goes through `lib/date` (CLAUDE.md section 6), and a
 * second implementation here is exactly how two screens start disagreeing
 * about which day something happened on.
 */
function taskCompletedOn(task: Task, today: IsoDate, timeZone: string): boolean {
  if (!task.completedAt) return false;
  return toZonedDate(task.completedAt, timeZone) === today;
}
