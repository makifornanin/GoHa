import { describe, expect, it } from "vitest";

import type { FocusSession, HabitEntry, Task } from "@/db";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import {
  byWeek,
  completionsByDay,
  dateRange,
  deltaPercent,
  focusMinutesByDay,
  habitCompletionRate,
  habitHeatmap,
} from "@/lib/progress";

const TZ = "Asia/Manila";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    userId: "u",
    goalId: null,
    lifeAreaId: null,
    parentTaskId: null,
    title: "t",
    description: null,
    status: "completed",
    priority: "medium",
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

function session(sessionDate: string, durationSeconds: number): FocusSession {
  return {
    id: `f-${sessionDate}-${durationSeconds}`,
    userId: "u",
    taskId: null,
    sessionDate,
    startedAt: new Date(`${sessionDate}T02:00:00.000Z`),
    endedAt: new Date(`${sessionDate}T03:00:00.000Z`),
    durationSeconds,
    plannedDurationSeconds: null,
    pausedSeconds: 0,
    pausedAt: null,
    status: "completed",
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as FocusSession;
}

describe("dateRange", () => {
  it("is inclusive at both ends", () => {
    expect(dateRange("2026-08-10", "2026-08-13")).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
  });
});

describe("completionsByDay", () => {
  it("buckets by the LOCAL day a task was completed, not its scheduled date", () => {
    // 2026-08-11T17:30Z is 2026-08-12 01:30 in Manila: a different local day.
    const points = completionsByDay({
      tasks: [
        task({ scheduledFor: "2026-08-01", completedAt: new Date("2026-08-11T17:30:00.000Z") }),
      ],
      from: "2026-08-10",
      to: "2026-08-13",
      timeZone: TZ,
    });
    const byDate = Object.fromEntries(points.map((p) => [p.date, p.value]));
    expect(byDate["2026-08-12"]).toBe(1);
    expect(byDate["2026-08-11"]).toBe(0);
  });

  it("ignores tasks that are not completed, and emits zeros for quiet days", () => {
    const points = completionsByDay({
      tasks: [task({ status: "todo", completedAt: null })],
      from: "2026-08-10",
      to: "2026-08-12",
      timeZone: TZ,
    });
    expect(points.map((p) => p.value)).toEqual([0, 0, 0]);
    expect(points).toHaveLength(3);
  });
});

describe("focusMinutesByDay", () => {
  it("sums session seconds into whole minutes per day", () => {
    const points = focusMinutesByDay({
      sessions: [session("2026-08-11", 1500), session("2026-08-11", 900), session("2026-08-12", 600)],
      from: "2026-08-10",
      to: "2026-08-12",
    });
    const byDate = Object.fromEntries(points.map((p) => [p.date, p.value]));
    expect(byDate["2026-08-11"]).toBe(40);
    expect(byDate["2026-08-12"]).toBe(10);
    expect(byDate["2026-08-10"]).toBe(0);
  });
});

describe("byWeek", () => {
  it("groups days into Monday-start weeks", () => {
    // 2026-08-10 is a Monday.
    const weeks = byWeek(
      [
        { date: "2026-08-10", value: 1 },
        { date: "2026-08-13", value: 2 },
        { date: "2026-08-17", value: 5 },
      ],
      1,
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[0].weekStart).toBe("2026-08-10");
    expect(weeks[0].value).toBe(3);
    expect(weeks[1].weekStart).toBe("2026-08-17");
    expect(weeks[1].value).toBe(5);
  });
});

describe("deltaPercent", () => {
  it("returns null when there is no baseline to compare against", () => {
    expect(deltaPercent(5, 0)).toBeNull();
  });
  it("treats nothing-to-nothing as no change rather than a null", () => {
    expect(deltaPercent(0, 0)).toBe(0);
  });
  it("computes a rounded percentage change", () => {
    expect(deltaPercent(12, 10)).toBe(20);
    expect(deltaPercent(8, 10)).toBe(-20);
  });
});

describe("habitHeatmap", () => {
  const habit: HabitWithSchedule = {
    id: "h1",
    userId: "u",
    lifeAreaId: null,
    goalId: null,
    name: "Read",
    description: null,
    type: "boolean",
    targetValue: null,
    unit: null,
    higherIsBetter: true,
    color: null,
    icon: null,
    sortOrder: 0,
    isArchived: false,
    archivedAt: null,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    schedule: {
      id: "s1",
      userId: "u",
      habitId: "h1",
      frequency: "daily",
      daysOfWeek: null,
      daysOfMonth: null,
      timesPerPeriod: null,
      startDate: "2026-08-10",
      endDate: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as HabitWithSchedule;

  function entry(entryDate: string): HabitEntry {
    return {
      id: `e-${entryDate}`,
      userId: "u",
      habitId: "h1",
      entryDate,
      status: "done",
      value: null,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as HabitEntry;
  }

  it("does not schedule days before the habit started", () => {
    const cells = habitHeatmap({
      habits: [habit],
      entries: [],
      from: "2026-08-07",
      to: "2026-08-12",
      today: "2026-08-12",
      weekStartsOn: 1,
      timeZone: TZ,
    });
    const byDate = Object.fromEntries(cells.map((c) => [c.date, c]));
    expect(byDate["2026-08-08"].scheduled).toBe(0);
    expect(byDate["2026-08-08"].level).toBe(0);
    expect(byDate["2026-08-10"].scheduled).toBe(1);
  });

  it("marks a fully completed day at the top of the ramp", () => {
    const cells = habitHeatmap({
      habits: [habit],
      entries: [entry("2026-08-11")],
      from: "2026-08-10",
      to: "2026-08-12",
      today: "2026-08-12",
      weekStartsOn: 1,
      timeZone: TZ,
    });
    const byDate = Object.fromEntries(cells.map((c) => [c.date, c]));
    expect(byDate["2026-08-11"].done).toBe(1);
    expect(byDate["2026-08-11"].level).toBe(4);
    expect(byDate["2026-08-10"].level).toBe(0);
  });

  it("computes an overall completion rate from scheduled days only", () => {
    const cells = habitHeatmap({
      habits: [habit],
      entries: [entry("2026-08-11"), entry("2026-08-12")],
      from: "2026-08-07",
      to: "2026-08-12",
      today: "2026-08-12",
      weekStartsOn: 1,
      timeZone: TZ,
    });
    // Scheduled 10th-12th (3 days), 2 done. Days before the start do not count.
    expect(habitCompletionRate(cells)).toBe(67);
  });
});
