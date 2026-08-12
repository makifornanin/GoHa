import { describe, expect, it } from "vitest";

import type { FocusSession, HabitEntry, Task } from "@/db";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import { deriveReviewStats, weekBounds } from "@/lib/review";

const TZ = "Asia/Manila";
/** Monday 2026-08-10 .. Sunday 2026-08-16. */
const WEEK = weekBounds("2026-08-10");
const TODAY = "2026-08-16";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    userId: "u",
    goalId: null,
    lifeAreaId: null,
    parentTaskId: null,
    title: "task",
    description: null,
    status: "todo",
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
    startedAt: new Date(),
    endedAt: new Date(),
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

const base = {
  week: WEEK,
  habits: [] as HabitWithSchedule[],
  habitEntries: [] as HabitEntry[],
  sessions: [] as FocusSession[],
  goals: [] as { status: string; completedAt: Date | null }[],
  today: TODAY,
  weekStartsOn: 1 as const,
  timeZone: TZ,
};

describe("weekBounds", () => {
  it("spans seven inclusive days", () => {
    expect(WEEK).toEqual({ start: "2026-08-10", end: "2026-08-16" });
  });
});

describe("deriveReviewStats", () => {
  it("counts a task in the week it was COMPLETED, not the week it was scheduled", () => {
    const stats = deriveReviewStats({
      ...base,
      tasks: [
        task({
          scheduledFor: "2026-07-01",
          status: "completed",
          completedAt: new Date("2026-08-12T02:00:00.000Z"),
        }),
      ],
    });
    expect(stats.completed).toHaveLength(1);
    expect(stats.slipped).toHaveLength(0);
  });

  it("excludes work completed outside the week", () => {
    const stats = deriveReviewStats({
      ...base,
      tasks: [
        task({ status: "completed", completedAt: new Date("2026-08-02T02:00:00.000Z") }),
        task({ status: "completed", completedAt: new Date("2026-08-20T02:00:00.000Z") }),
      ],
    });
    expect(stats.completed).toHaveLength(0);
  });

  it("counts still-open work dated inside the week as slipped", () => {
    const stats = deriveReviewStats({
      ...base,
      tasks: [
        task({ title: "Open", scheduledFor: "2026-08-13" }),
        task({ title: "Next week", scheduledFor: "2026-08-20" }),
        task({ title: "Undated" }),
      ],
    });
    expect(stats.slipped.map((t) => t.title)).toEqual(["Open"]);
  });

  it("ignores cancelled work entirely", () => {
    const stats = deriveReviewStats({
      ...base,
      tasks: [task({ status: "cancelled", scheduledFor: "2026-08-13" })],
    });
    expect(stats.slipped).toHaveLength(0);
    expect(stats.completed).toHaveLength(0);
  });

  it("groups completed work by life area, largest first", () => {
    const stats = deriveReviewStats({
      ...base,
      tasks: [
        task({ lifeAreaId: "a", status: "completed", completedAt: new Date("2026-08-11T02:00:00.000Z") }),
        task({ lifeAreaId: "a", status: "completed", completedAt: new Date("2026-08-12T02:00:00.000Z") }),
        task({ lifeAreaId: "b", status: "completed", completedAt: new Date("2026-08-13T02:00:00.000Z") }),
      ],
    });
    expect(stats.completedByArea).toEqual([
      { areaId: "a", count: 2 },
      { areaId: "b", count: 1 },
    ]);
  });

  it("sums only in-week focus sessions", () => {
    const stats = deriveReviewStats({
      ...base,
      tasks: [],
      sessions: [session("2026-08-11", 1500), session("2026-08-12", 900), session("2026-08-30", 3000)],
    });
    expect(stats.focusSeconds).toBe(2400);
    expect(stats.focusSessions).toBe(2);
  });

  it("derives habit consistency from scheduled days only", () => {
    const stats = deriveReviewStats({
      ...base,
      tasks: [],
      habits: [habit],
      habitEntries: [entry("2026-08-10"), entry("2026-08-11")],
    });
    // Scheduled Mon-Sun (7 days from its start date), 2 done.
    expect(stats.habitDaysScheduled).toBe(7);
    expect(stats.habitDaysDone).toBe(2);
    expect(stats.habitRate).toBe(29);
  });

  it("counts goals completed inside the week", () => {
    const stats = deriveReviewStats({
      ...base,
      tasks: [],
      goals: [
        { status: "completed", completedAt: new Date("2026-08-12T02:00:00.000Z") },
        { status: "completed", completedAt: new Date("2026-07-12T02:00:00.000Z") },
        { status: "active", completedAt: null },
      ],
    });
    expect(stats.goalsCompleted).toBe(1);
  });

  it("caps the carry-over list so a bad week does not become a wall", () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      task({ title: `Open ${i}`, scheduledFor: "2026-08-13" }),
    );
    const stats = deriveReviewStats({ ...base, tasks });
    expect(stats.slipped).toHaveLength(12);
    expect(stats.carryOver).toHaveLength(8);
  });
});
