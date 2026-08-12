import { describe, expect, it } from "vitest";

import type { DailyPriority, Task } from "@/db";
import type { GoalWithCounts } from "@/db/repositories/goals";
import { daysLate, deriveDaySignal, scoreTasks } from "@/lib/today-brain";

const TZ = "Asia/Manila";
const TODAY = "2026-08-12";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    userId: "user-1",
    goalId: null,
    lifeAreaId: null,
    parentTaskId: null,
    title: "A task",
    description: null,
    status: "todo",
    priority: "medium",
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

function goal(overrides: Partial<GoalWithCounts> = {}): GoalWithCounts {
  return {
    id: "goal-1",
    userId: "user-1",
    lifeAreaId: null,
    parentGoalId: null,
    title: "Ship it",
    description: null,
    status: "active",
    timeframe: "monthly",
    progressMode: "auto",
    manualProgress: null,
    startDate: null,
    targetDate: null,
    completedAt: null,
    sortOrder: 0,
    isArchived: false,
    archivedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    totalTasks: 0,
    completedTasks: 0,
    cancelledTasks: 0,
    ...overrides,
  } as GoalWithCounts;
}

const noHabits = { habits: [], habitEntries: [] };

describe("daysLate", () => {
  it("counts whole days past the effective date", () => {
    expect(daysLate(task({ scheduledFor: "2026-08-09" }), TODAY, TZ)).toBe(3);
    expect(daysLate(task({ scheduledFor: TODAY }), TODAY, TZ)).toBe(0);
    expect(daysLate(task({ scheduledFor: "2026-08-20" }), TODAY, TZ)).toBe(0);
  });

  it("is zero for undated work, which can never be late", () => {
    expect(daysLate(task(), TODAY, TZ)).toBe(0);
  });
});

describe("scoreTasks", () => {
  it("ranks late work above everything scheduled for today", () => {
    const late = task({ title: "Late", scheduledFor: "2026-08-10", priority: "low" });
    const todayUrgent = task({ title: "Today", scheduledFor: TODAY, priority: "urgent" });
    const [first] = scoreTasks({ tasks: [todayUrgent, late], today: TODAY, timeZone: TZ });
    expect(first.task.title).toBe("Late");
    expect(first.reason).toContain("2 days late");
  });

  it("uses priority to break ties on the same day", () => {
    const low = task({ title: "Low", scheduledFor: TODAY, priority: "low" });
    const high = task({ title: "High", scheduledFor: TODAY, priority: "high" });
    const ranked = scoreTasks({ tasks: [low, high], today: TODAY, timeZone: TZ });
    expect(ranked.map((r) => r.task.title)).toEqual(["High", "Low"]);
  });

  it("ranks undated work below anything scheduled", () => {
    const undated = task({ title: "Someday", priority: "urgent" });
    const scheduled = task({ title: "Planned", scheduledFor: TODAY, priority: "low" });
    const ranked = scoreTasks({ tasks: [undated, scheduled], today: TODAY, timeZone: TZ });
    expect(ranked[0].task.title).toBe("Planned");
  });

  it("excludes finished, cancelled, and already-pinned work", () => {
    const done = task({ title: "Done", status: "completed", scheduledFor: TODAY });
    const cancelled = task({ title: "Cancelled", status: "cancelled", scheduledFor: TODAY });
    const pinned = task({ id: "pinned-1", title: "Pinned", scheduledFor: TODAY });
    const open = task({ title: "Open", scheduledFor: TODAY });

    const ranked = scoreTasks({
      tasks: [done, cancelled, pinned, open],
      today: TODAY,
      timeZone: TZ,
      excludeIds: new Set(["pinned-1"]),
    });
    expect(ranked.map((r) => r.task.title)).toEqual(["Open"]);
  });

  it("credits work that moves an active goal", () => {
    const linked = task({ title: "Linked", scheduledFor: TODAY, goalId: "goal-1" });
    const loose = task({ title: "Loose", scheduledFor: TODAY });
    const ranked = scoreTasks({
      tasks: [loose, linked],
      today: TODAY,
      timeZone: TZ,
      goalById: new Map([["goal-1", goal()]]),
    });
    expect(ranked[0].task.title).toBe("Linked");
    expect(ranked[0].reason).toContain('moves "Ship it"');
  });

  it("caps the lateness bonus so an ancient task cannot dominate forever", () => {
    const ancient = task({ title: "Ancient", scheduledFor: "2020-01-01", priority: "low" });
    const recentUrgent = task({ title: "Recent", scheduledFor: "2026-08-11", priority: "urgent" });
    const ranked = scoreTasks({ tasks: [ancient, recentUrgent], today: TODAY, timeZone: TZ });
    // Both are late, so the cap keeps the gap small enough that priority matters.
    const gap = ranked[0].score - ranked[1].score;
    expect(gap).toBeLessThan(120);
  });
});

describe("deriveDaySignal", () => {
  const base = {
    goals: [] as GoalWithCounts[],
    priorities: [] as DailyPriority[],
    today: TODAY,
    timeZone: TZ,
    hour: 10,
    ...noHabits,
  };

  it("leads with overdue work rather than an empty focus prompt", () => {
    const signal = deriveDaySignal({
      ...base,
      tasks: [
        task({ title: "Review sprint board", scheduledFor: "2026-08-11" }),
        task({ title: "Another", scheduledFor: "2026-08-10" }),
      ],
    });
    expect(signal.state).toBe("late");
    expect(signal.lateCount).toBe(2);
    expect(signal.headline).toBe("2 things have slipped");
    expect(signal.detail).toContain("late");
    expect(signal.task).not.toBeNull();
  });

  it("says a clean slate only when there is genuinely nothing", () => {
    const signal = deriveDaySignal({ ...base, tasks: [] });
    expect(signal.state).toBe("clear");
    expect(signal.task).toBeNull();
  });

  it("prefers a pinned priority over its own suggestion", () => {
    const pinned = task({ id: "pin-1", title: "The pinned one", scheduledFor: TODAY });
    const other = task({ title: "Higher scoring", scheduledFor: TODAY, priority: "urgent" });
    const signal = deriveDaySignal({
      ...base,
      tasks: [pinned, other],
      priorities: [
        { id: "p1", taskId: "pin-1", position: 1 } as unknown as DailyPriority,
      ],
    });
    expect(signal.state).toBe("focus");
    expect(signal.task?.title).toBe("The pinned one");
  });

  it("reports the day as done once scheduled work is finished", () => {
    const signal = deriveDaySignal({
      ...base,
      hour: 19,
      tasks: [task({ title: "Finished", scheduledFor: TODAY, status: "completed" })],
    });
    expect(signal.state).toBe("done");
    expect(signal.completedToday).toBe(1);
    expect(signal.totalToday).toBe(1);
    expect(signal.canReflect).toBe(true);
  });

  it("does not offer reflection in the middle of the day", () => {
    const signal = deriveDaySignal({
      ...base,
      hour: 11,
      tasks: [task({ title: "Finished", scheduledFor: TODAY, status: "completed" })],
    });
    expect(signal.state).toBe("done");
    expect(signal.canReflect).toBe(false);
  });

  it("suggests at most three, and never one already pinned", () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      task({ id: `t${i}`, title: `Task ${i}`, scheduledFor: TODAY }),
    );
    const signal = deriveDaySignal({
      ...base,
      tasks,
      priorities: [{ id: "p1", taskId: "t0", position: 1 } as unknown as DailyPriority],
    });
    expect(signal.suggestions).toHaveLength(3);
    expect(signal.suggestions.map((s) => s.task.id)).not.toContain("t0");
  });
});
