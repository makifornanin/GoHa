import type { FocusSession, Task } from "@/db";
import type { HabitView } from "@/lib/habit-view";
import type { IsoDate } from "@/lib/date";
import { focusElapsedSeconds } from "@/lib/focus";
import { toZonedDate } from "@/lib/date";

/**
 * The deadline poll (automation Guide 03, phase 1).
 *
 * Shortcuts cannot receive a push, so "tell me when a deadline hits" becomes
 * "ask GoHa, at fixed times, what falls due before the next ask". Four polls
 * cover the working day. This module decides what is worth saying at each one.
 *
 * Every item carries a dedupe key COMPUTED HERE, server-side. The workflow
 * claims it through /log before sending, so the same deadline cannot alert
 * twice and rescheduling re-arms it, all without n8n knowing the scheme.
 */

/** How long past its plan an unattended session is worth mentioning. */
export const FOCUS_OVERRUN_GRACE_SECONDS = 10 * 60;
/** Streaks below this are not worth an evening interruption. */
export const STREAK_AT_RISK_MINIMUM = 7;

export type DueItem = {
  id: string;
  title: string;
  priority: Task["priority"];
  dueAt: string | null;
  minutesUntil: number | null;
  dedupeKey: string;
};

export type FocusOverrunItem = {
  sessionId: string;
  taskTitle: string | null;
  plannedMinutes: number;
  elapsedMinutes: number;
  minutesOver: number;
  dedupeKey: string;
};

export type StreakRiskItem = {
  habitId: string;
  name: string;
  currentStreak: number;
  dedupeKey: string;
};

export type DuePayload = {
  localDate: IsoDate;
  timezone: string;
  isSabbath: boolean;
  generatedAt: string;
  windowMinutes: number;
  due: DueItem[];
  overdueToday: DueItem[];
  focusOverrun: FocusOverrunItem[];
  streaksAtRisk: StreakRiskItem[];
  /** Total across every section: the Shortcut shows nothing when this is 0. */
  count: number;
};

const OPEN = new Set(["todo", "in_progress"]);

/** `deadline:{taskId}:{dueAtIso}` — rescheduling changes the key, so it re-arms. */
export function deadlineKey(task: { id: string; dueAt: Date | null }): string {
  return `deadline:${task.id}:${task.dueAt ? task.dueAt.toISOString() : "none"}`;
}

/** `focus:{sessionId}:overrun` — one nudge per session, not one per poll. */
export function focusOverrunKey(sessionId: string): string {
  return `focus:${sessionId}:overrun`;
}

export function streakKey(habitId: string, localDate: IsoDate): string {
  return `streak:${habitId}:${localDate}`;
}

export function buildDuePayload(params: {
  tasks: Task[];
  activeSessions: FocusSession[];
  taskTitles: Map<string, string>;
  habitViews: HabitView[];
  /** Keys already claimed in notification_log; those items are excluded. */
  claimed: Set<string>;
  windowMinutes: number;
  evening: boolean;
  today: IsoDate;
  timeZone: string;
  isSabbath: boolean;
  now: Date;
}): DuePayload {
  const now = params.now.getTime();
  const horizon = now + params.windowMinutes * 60_000;

  const due: DueItem[] = [];
  const overdueToday: DueItem[] = [];

  for (const task of params.tasks) {
    if (!OPEN.has(task.status) || !task.dueAt) continue;
    const key = deadlineKey(task);
    if (params.claimed.has(key)) continue;

    const at = task.dueAt.getTime();
    const item: DueItem = {
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueAt: task.dueAt.toISOString(),
      minutesUntil: Math.round((at - now) / 60_000),
      dedupeKey: key,
    };

    // The window is half-open at the start and INCLUSIVE at the end: a task due
    // exactly at the next poll must be named by this one, or it falls between
    // two polls and is only ever seen as overdue.
    if (at > now && at <= horizon) {
      due.push(item);
      continue;
    }
    // Overdue, but only today's: yesterday's slipped work belongs to the
    // morning brief, which states it as overdue rather than as a deadline.
    if (at <= now && toZonedDate(task.dueAt, params.timeZone) === params.today) {
      overdueToday.push(item);
    }
  }

  due.sort((a, b) => (a.minutesUntil ?? 0) - (b.minutesUntil ?? 0));
  overdueToday.sort((a, b) => (a.minutesUntil ?? 0) - (b.minutesUntil ?? 0));

  /*
   * A focus session left running well past its plan.
   *
   * Keyed per session, so a session that is still open at the next poll is not
   * announced again (Guide 03, revision highlight). Without that, the same
   * forgotten timer would nag at 16:00, 19:00 and every poll after.
   */
  const focusOverrun: FocusOverrunItem[] = [];
  for (const session of params.activeSessions) {
    const planned = session.plannedDurationSeconds ?? 0;
    if (planned <= 0) continue;

    const elapsed = focusElapsedSeconds(
      {
        startedAt: session.startedAt,
        endedAt: null,
        pausedSeconds: session.pausedSeconds,
        pausedAt: session.pausedAt,
      },
      params.now,
    );
    if (elapsed <= planned + FOCUS_OVERRUN_GRACE_SECONDS) continue;

    const key = focusOverrunKey(session.id);
    if (params.claimed.has(key)) continue;

    focusOverrun.push({
      sessionId: session.id,
      taskTitle: session.taskId ? params.taskTitles.get(session.taskId) ?? null : null,
      plannedMinutes: Math.round(planned / 60),
      elapsedMinutes: Math.round(elapsed / 60),
      minutesOver: Math.round((elapsed - planned) / 60),
      dedupeKey: key,
    });
  }

  /*
   * Streaks worth protecting, evening poll only.
   *
   * A streak nudge in the morning is noise: there is all day to log the habit.
   * In the evening it is the last useful moment to say something.
   */
  const streaksAtRisk: StreakRiskItem[] = [];
  if (params.evening) {
    for (const view of params.habitViews) {
      if (!view.scheduledToday) continue;
      if (view.todayState !== "pending" && view.todayState !== "partial") continue;
      if (view.streaks.current < STREAK_AT_RISK_MINIMUM) continue;

      const key = streakKey(view.habit.id, params.today);
      if (params.claimed.has(key)) continue;

      streaksAtRisk.push({
        habitId: view.habit.id,
        name: view.habit.name,
        currentStreak: view.streaks.current,
        dedupeKey: key,
      });
    }
    streaksAtRisk.sort((a, b) => b.currentStreak - a.currentStreak);
  }

  return {
    localDate: params.today,
    timezone: params.timeZone,
    isSabbath: params.isSabbath,
    generatedAt: params.now.toISOString(),
    windowMinutes: params.windowMinutes,
    due,
    overdueToday,
    focusOverrun,
    streaksAtRisk,
    count: due.length + overdueToday.length + focusOverrun.length + streaksAtRisk.length,
  };
}

/** Every key in a payload, so the caller can pre-claim in one query. */
export function payloadKeys(payload: DuePayload): string[] {
  return [
    ...payload.due.map((item) => item.dedupeKey),
    ...payload.overdueToday.map((item) => item.dedupeKey),
    ...payload.focusOverrun.map((item) => item.dedupeKey),
    ...payload.streaksAtRisk.map((item) => item.dedupeKey),
  ];
}
