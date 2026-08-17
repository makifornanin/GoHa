import { describe, expect, it } from "vitest";

import type { Task } from "@/db";
import { toBriefPayload } from "@/lib/automation/brief";
import { STREAK_AT_RISK_MINIMUM, toHabitsDuePayload } from "@/lib/automation/habits";
import type { HabitView } from "@/lib/habit-view";
import type { DaySignal } from "@/lib/today-brain";
import { claimDeliverySchema } from "@/lib/validations/automation";

/**
 * What external automations receive. This is a published contract: a workflow
 * out in n8n formats a notification from these field names, and a silent change
 * to them shows up as a notification that says nothing, hours later, on someone
 * else's phone.
 */

const TZ = "Asia/Manila";
const TODAY = "2026-08-17";
const NOW = new Date("2026-08-17T00:30:00.000Z"); // 08:30 Manila

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "u",
    goalId: null,
    lifeAreaId: null,
    parentTaskId: null,
    title: "Draft the proposal",
    description: null,
    status: "todo",
    priority: "high",
    scheduledFor: null,
    dueAt: null,
    completedAt: null,
    completionNote: null,
    estimateMinutes: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Task;
}

function signal(overrides: Partial<DaySignal> = {}): DaySignal {
  return {
    state: "focus",
    headline: "One thing to start",
    detail: 'Start with "Draft the proposal".',
    task: null,
    lateCount: 0,
    completedToday: 0,
    totalToday: 0,
    habitsRemaining: 0,
    suggestions: [],
    canReflect: false,
    ...overrides,
  };
}

describe("brief payload", () => {
  it("passes the app's own judgement through unchanged", () => {
    const payload = toBriefPayload({
      signal: signal({
        state: "late",
        headline: "2 things have slipped",
        detail: 'Start with "Draft the proposal" — 3 days late.',
        lateCount: 2,
        completedToday: 1,
        totalToday: 4,
        habitsRemaining: 1,
      }),
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });

    expect(payload.state).toBe("late");
    expect(payload.headline).toBe("2 things have slipped");
    expect(payload.detail).toBe('Start with "Draft the proposal" — 3 days late.');
    expect(payload.lateCount).toBe(2);
    expect(payload.completedToday).toBe(1);
    expect(payload.totalToday).toBe(4);
    expect(payload.habitsRemaining).toBe(1);
    expect(payload.date).toBe(TODAY);
    expect(payload.timeZone).toBe(TZ);
    expect(payload.generatedAt).toBe(NOW.toISOString());
  });

  it("carries a task with its lateness and a working deep link", () => {
    const late = task({ scheduledFor: "2026-08-14" });
    const payload = toBriefPayload({
      signal: signal({ task: late, lateCount: 1 }),
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });

    expect(payload.task).toEqual({
      id: late.id,
      title: "Draft the proposal",
      priority: "high",
      daysLate: 3,
      focusPath: `/focus?taskId=${late.id}`,
      reason: "",
    });
  });

  it("keeps each suggestion's stated reason, which is what a message quotes", () => {
    const payload = toBriefPayload({
      signal: signal({
        suggestions: [
          { task: task({ id: "a" }), score: 40, reason: "due today · high priority" },
          { task: task({ id: "b", title: "Email Sam" }), score: 20, reason: "next in your list" },
        ],
      }),
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });

    expect(payload.suggestions.map((s) => [s.id, s.reason])).toEqual([
      ["a", "due today · high priority"],
      ["b", "next in your list"],
    ]);
  });

  it("marks a day with nothing to act on as quiet", () => {
    // The guide's first rule: never notify when there is nothing to act on.
    const payload = toBriefPayload({
      signal: signal({ state: "clear", task: null, suggestions: [], habitsRemaining: 0 }),
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });
    expect(payload.quiet).toBe(true);
  });

  it("is not quiet when anything is outstanding", () => {
    const withTask = toBriefPayload({
      signal: signal({ task: task() }),
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });
    const withHabit = toBriefPayload({
      signal: signal({ habitsRemaining: 1 }),
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });
    const withLate = toBriefPayload({
      signal: signal({ lateCount: 2 }),
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });

    expect([withTask.quiet, withHabit.quiet, withLate.quiet]).toEqual([false, false, false]);
  });
});

function view(overrides: {
  id: string;
  name: string;
  scheduledToday: boolean;
  todayState: HabitView["todayState"];
  current: number;
}): HabitView {
  return {
    habit: {
      id: overrides.id,
      name: overrides.name,
      targetValue: null,
      unit: null,
    },
    schedule: {},
    streaks: { current: overrides.current, longest: overrides.current },
    scheduledToday: overrides.scheduledToday,
    todayEntry: null,
    todayState: overrides.todayState,
    weekCells: [],
  } as unknown as HabitView;
}

describe("habits due payload", () => {
  it("reports only what is scheduled today and still open", () => {
    const payload = toHabitsDuePayload({
      views: [
        view({ id: "h1", name: "Read", scheduledToday: true, todayState: "pending", current: 5 }),
        view({ id: "h2", name: "Water", scheduledToday: true, todayState: "done", current: 9 }),
        view({ id: "h3", name: "Gym", scheduledToday: false, todayState: "pending", current: 2 }),
      ],
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });

    expect(payload.scheduledToday).toBe(2);
    expect(payload.doneToday).toBe(1);
    expect(payload.due.map((h) => h.id)).toEqual(["h1"]);
    expect(payload.quiet).toBe(false);
  });

  it("treats a deliberate skip as settled, not as something to chase", () => {
    const payload = toHabitsDuePayload({
      views: [
        view({ id: "h1", name: "Read", scheduledToday: true, todayState: "skip", current: 5 }),
      ],
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });

    expect(payload.due).toEqual([]);
    expect(payload.quiet).toBe(true);
  });

  it("counts a numeric habit logged short of target as still due", () => {
    const payload = toHabitsDuePayload({
      views: [
        view({ id: "h1", name: "Water", scheduledToday: true, todayState: "partial", current: 4 }),
      ],
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });

    expect(payload.due[0].state).toBe("partial");
  });

  it("flags only streaks worth interrupting an evening for", () => {
    const payload = toHabitsDuePayload({
      views: [
        view({
          id: "h1",
          name: "Read",
          scheduledToday: true,
          todayState: "pending",
          current: STREAK_AT_RISK_MINIMUM,
        }),
        view({
          id: "h2",
          name: "Stretch",
          scheduledToday: true,
          todayState: "pending",
          current: STREAK_AT_RISK_MINIMUM - 1,
        }),
      ],
      today: TODAY,
      timeZone: TZ,
      now: NOW,
    });

    expect(payload.atRisk.map((h) => h.id)).toEqual(["h1"]);
    // Longest streak first: that is the one worth naming in a short message.
    expect(payload.due.map((h) => h.id)).toEqual(["h1", "h2"]);
  });
});

describe("delivery claim validation", () => {
  it("normalises the kind so two spellings cannot both be first", () => {
    const parsed = claimDeliverySchema.parse({ kind: "  Morning-Brief  " });
    expect(parsed.kind).toBe("morning-brief");
  });

  it("refuses a kind that would fragment the ledger", () => {
    expect(claimDeliverySchema.safeParse({ kind: "morning brief" }).success).toBe(false);
    expect(claimDeliverySchema.safeParse({ kind: "-leading" }).success).toBe(false);
    expect(claimDeliverySchema.safeParse({ kind: "" }).success).toBe(false);
  });

  it("takes a local date, never an instant", () => {
    expect(claimDeliverySchema.parse({ kind: "brief", date: "2026-08-17" }).date).toBe("2026-08-17");
    expect(
      claimDeliverySchema.safeParse({ kind: "brief", date: "2026-08-17T00:00:00Z" }).success,
    ).toBe(false);
    expect(claimDeliverySchema.safeParse({ kind: "brief", date: "2026-13-01" }).success).toBe(false);
  });

  it("treats an empty detail as no detail", () => {
    expect(claimDeliverySchema.parse({ kind: "brief", detail: "   " }).detail).toBeNull();
  });
});
