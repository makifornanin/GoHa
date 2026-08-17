import { describe, expect, it } from "vitest";

import type { FocusSession, Task } from "@/db";
import {
  buildDuePayload,
  deadlineKey,
  focusOverrunKey,
  FOCUS_OVERRUN_GRACE_SECONDS,
  payloadKeys,
  STREAK_AT_RISK_MINIMUM,
  streakKey,
} from "@/lib/automation/due";
import { FOCUS_AUTO_END_GRACE_SECONDS } from "@/lib/focus";
import type { HabitView } from "@/lib/habit-view";

/**
 * The deadline poll (automation Guide 03).
 *
 * Exactly-once alerting is the whole point, and it is decided here: an item
 * whose key is already claimed never appears, so two polls running back to back
 * produce one alert between them rather than one each.
 */

const TZ = "Asia/Manila";
const TODAY = "2026-08-18";
const NOW = new Date("2026-08-18T04:00:00.000Z"); // 12:00 Manila

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    userId: "u",
    goalId: null,
    lifeAreaId: null,
    parentTaskId: null,
    title: "Send the invoice",
    description: null,
    status: "todo",
    priority: "high",
    scheduledFor: null,
    dueAt: null,
    completedAt: null,
    completionNote: null,
    estimateMinutes: null,
    sortOrder: 0,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  } as Task;
}

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: "s1",
    userId: "u",
    taskId: null,
    sessionDate: TODAY,
    startedAt: new Date(NOW.getTime() - 60 * 60_000),
    endedAt: null,
    pausedAt: null,
    pausedSeconds: 0,
    plannedDurationSeconds: 25 * 60,
    durationSeconds: null,
    status: "in_progress",
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as FocusSession;
}

function habitView(overrides: {
  id: string;
  name: string;
  scheduledToday: boolean;
  todayState: HabitView["todayState"];
  current: number;
}): HabitView {
  return {
    habit: { id: overrides.id, name: overrides.name },
    schedule: {},
    streaks: { current: overrides.current, longest: overrides.current },
    scheduledToday: overrides.scheduledToday,
    todayEntry: null,
    todayState: overrides.todayState,
    weekCells: [],
  } as unknown as HabitView;
}

function build(params: Partial<Parameters<typeof buildDuePayload>[0]> = {}) {
  return buildDuePayload({
    tasks: [],
    activeSessions: [],
    taskTitles: new Map(),
    habitViews: [],
    claimed: new Set(),
    windowMinutes: 210,
    evening: false,
    today: TODAY,
    timeZone: TZ,
    isSabbath: false,
    now: NOW,
    ...params,
  });
}

describe("deadlines", () => {
  it("names a task falling due inside the window", () => {
    const due = task({ dueAt: new Date(NOW.getTime() + 60 * 60_000) });
    const payload = build({ tasks: [due] });

    expect(payload.due.map((item) => item.id)).toEqual(["t1"]);
    expect(payload.due[0].minutesUntil).toBe(60);
    expect(payload.count).toBe(1);
  });

  it("includes a task due exactly at the window edge", () => {
    // Inclusive at the end, or a task due precisely at the next poll falls
    // between two polls and is only ever seen once it is already late.
    const edge = task({ dueAt: new Date(NOW.getTime() + 210 * 60_000) });
    expect(build({ tasks: [edge] }).due).toHaveLength(1);
  });

  it("ignores a task beyond the window", () => {
    const later = task({ dueAt: new Date(NOW.getTime() + 211 * 60_000) });
    expect(build({ tasks: [later] }).due).toHaveLength(0);
  });

  it("reports work already due today separately", () => {
    const late = task({ dueAt: new Date(NOW.getTime() - 30 * 60_000) });
    const payload = build({ tasks: [late] });

    expect(payload.due).toHaveLength(0);
    expect(payload.overdueToday.map((item) => item.id)).toEqual(["t1"]);
  });

  it("says nothing about a completed or cancelled task", () => {
    const done = task({ status: "completed", dueAt: new Date(NOW.getTime() + 60_000) });
    const dropped = task({ id: "t2", status: "cancelled", dueAt: new Date(NOW.getTime() + 60_000) });
    expect(build({ tasks: [done, dropped] }).count).toBe(0);
  });

  it("excludes an item whose key is already claimed", () => {
    const due = task({ dueAt: new Date(NOW.getTime() + 60 * 60_000) });
    const payload = build({ tasks: [due], claimed: new Set([deadlineKey(due)]) });

    // The second of two back-to-back polls says nothing at all.
    expect(payload.count).toBe(0);
  });

  it("re-arms when the task is rescheduled", () => {
    const original = task({ dueAt: new Date("2026-08-18T06:00:00.000Z") });
    const claimed = new Set([deadlineKey(original)]);

    const moved = task({ dueAt: new Date("2026-08-18T05:00:00.000Z") });
    // A new dueAt is a new key, so the moved deadline alerts exactly once more.
    expect(build({ tasks: [moved], claimed }).due).toHaveLength(1);
  });
});

describe("focus overrun", () => {
  it("surfaces a session past its plan by the grace period", () => {
    const planned = 25 * 60;
    const overrun = session({
      taskId: "t1",
      plannedDurationSeconds: planned,
      startedAt: new Date(NOW.getTime() - (planned + FOCUS_OVERRUN_GRACE_SECONDS + 60) * 1000),
    });
    const payload = build({
      activeSessions: [overrun],
      taskTitles: new Map([["t1", "Write the brief"]]),
    });

    expect(payload.focusOverrun).toHaveLength(1);
    expect(payload.focusOverrun[0].taskTitle).toBe("Write the brief");
    expect(payload.focusOverrun[0].minutesOver).toBe(11);
  });

  it("stays quiet inside the grace period", () => {
    const planned = 25 * 60;
    const justOver = session({
      plannedDurationSeconds: planned,
      startedAt: new Date(NOW.getTime() - (planned + 60) * 1000),
    });
    expect(build({ activeSessions: [justOver] }).focusOverrun).toHaveLength(0);
  });

  it("nudges once per session, not once per poll", () => {
    const planned = 25 * 60;
    const stale = session({
      plannedDurationSeconds: planned,
      startedAt: new Date(NOW.getTime() - (planned + 3 * 60 * 60) * 1000),
    });
    const payload = build({
      activeSessions: [stale],
      claimed: new Set([focusOverrunKey(stale.id)]),
    });

    // The 19:00 poll sees the same still-open session the 16:00 poll alerted
    // on. Without the per-session key this is where a duplicate would arrive.
    expect(payload.focusOverrun).toHaveLength(0);
  });

  it("ignores a session with no plan, which has nothing to overrun", () => {
    const open = session({
      plannedDurationSeconds: null,
      startedAt: new Date(NOW.getTime() - 6 * 60 * 60 * 1000),
    });
    expect(build({ activeSessions: [open] }).focusOverrun).toHaveLength(0);
  });

  it("alerts before the app would auto-end the session", () => {
    // Both thresholds exist and they must not coincide, or the notification
    // describes a session that has already closed itself.
    expect(FOCUS_OVERRUN_GRACE_SECONDS).toBeLessThan(FOCUS_AUTO_END_GRACE_SECONDS);
  });
});

describe("streaks at risk", () => {
  const atRisk = habitView({
    id: "h1",
    name: "Read",
    scheduledToday: true,
    todayState: "pending",
    current: STREAK_AT_RISK_MINIMUM,
  });

  it("only speaks on the evening poll", () => {
    expect(build({ habitViews: [atRisk], evening: false }).streaksAtRisk).toHaveLength(0);
    expect(build({ habitViews: [atRisk], evening: true }).streaksAtRisk).toHaveLength(1);
  });

  it("ignores a streak below the threshold", () => {
    const small = habitView({
      id: "h2",
      name: "Stretch",
      scheduledToday: true,
      todayState: "pending",
      current: STREAK_AT_RISK_MINIMUM - 1,
    });
    expect(build({ habitViews: [small], evening: true }).streaksAtRisk).toHaveLength(0);
  });

  it("ignores a habit already done, or deliberately skipped", () => {
    const done = habitView({ id: "h3", name: "Water", scheduledToday: true, todayState: "done", current: 20 });
    const skipped = habitView({ id: "h4", name: "Gym", scheduledToday: true, todayState: "skip", current: 20 });
    expect(build({ habitViews: [done, skipped], evening: true }).streaksAtRisk).toHaveLength(0);
  });

  it("speaks once per habit per day", () => {
    const payload = build({
      habitViews: [atRisk],
      evening: true,
      claimed: new Set([streakKey("h1", TODAY)]),
    });
    expect(payload.streaksAtRisk).toHaveLength(0);
  });
});

describe("payloadKeys", () => {
  it("collects every key so the caller can claim them in one query", () => {
    const due = task({ dueAt: new Date(NOW.getTime() + 60 * 60_000) });
    const payload = build({
      tasks: [due],
      habitViews: [
        habitView({ id: "h1", name: "Read", scheduledToday: true, todayState: "pending", current: 9 }),
      ],
      evening: true,
    });

    expect(payloadKeys(payload)).toEqual([deadlineKey(due), streakKey("h1", TODAY)]);
  });
});

describe("a quiet day", () => {
  it("counts zero end to end, so the Shortcut shows nothing", () => {
    expect(build().count).toBe(0);
  });
});
