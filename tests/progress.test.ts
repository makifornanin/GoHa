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
  heatWeeks,
  previousWindow,
  windowDays,
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

  /*
   * Regression cover for audit R-06. The suite above passed throughout the bug,
   * because every fixture was a boolean habit on a daily schedule, which is the
   * one shape the old open-coded logic got right.
   */
  describe("R-06 regressions", () => {
    const numeric = {
      ...habit,
      id: "h2",
      name: "Water",
      type: "numeric",
      targetValue: "8",
      higherIsBetter: true,
      schedule: { ...habit.schedule, id: "s2", habitId: "h2" },
    } as HabitWithSchedule;

    function numericEntry(entryDate: string, value: string): HabitEntry {
      return { ...entry(entryDate), id: `n-${entryDate}`, habitId: "h2", value } as HabitEntry;
    }

    it("does not count a below-target numeric day as done", () => {
      const cells = habitHeatmap({
        habits: [numeric],
        entries: [numericEntry("2026-08-11", "5")],
        from: "2026-08-11",
        to: "2026-08-11",
        today: "2026-08-12",
        weekStartsOn: 1,
        timeZone: TZ,
      });
      // Logged, so status is "done" in the row, but 5 < 8: partial, not complete.
      expect(cells[0].scheduled).toBe(1);
      expect(cells[0].done).toBe(0);
      expect(habitCompletionRate(cells)).toBe(0);
    });

    it("counts a met numeric target as done", () => {
      const cells = habitHeatmap({
        habits: [numeric],
        entries: [numericEntry("2026-08-11", "8")],
        from: "2026-08-11",
        to: "2026-08-11",
        today: "2026-08-12",
        weekStartsOn: 1,
        timeZone: TZ,
      });
      expect(cells[0].done).toBe(1);
      expect(habitCompletionRate(cells)).toBe(100);
    });

    it("respects a lower-is-better target", () => {
      const ceiling = {
        ...numeric,
        id: "h3",
        targetValue: "2",
        higherIsBetter: false,
        schedule: { ...habit.schedule, id: "s3", habitId: "h3" },
      } as HabitWithSchedule;
      const under = { ...numericEntry("2026-08-11", "1"), habitId: "h3" } as HabitEntry;
      const over = { ...numericEntry("2026-08-12", "5"), id: "n-over", habitId: "h3" } as HabitEntry;

      const cells = habitHeatmap({
        habits: [ceiling],
        entries: [under, over],
        from: "2026-08-11",
        to: "2026-08-12",
        today: "2026-08-13",
        weekStartsOn: 1,
        timeZone: TZ,
      });
      const byDate = Object.fromEntries(cells.map((c) => [c.date, c]));
      expect(byDate["2026-08-11"].done).toBe(1); // 1 <= 2, met
      expect(byDate["2026-08-12"].done).toBe(0); // 5 > 2, partial
    });

    it("does not schedule a weekly habit on days outside its weekdays", () => {
      // 2026-08-11 is a Tuesday, 2026-08-12 a Wednesday.
      const mondaysOnly = {
        ...habit,
        id: "h4",
        schedule: {
          ...habit.schedule,
          id: "s4",
          habitId: "h4",
          frequency: "weekly",
          daysOfWeek: [1],
        },
      } as HabitWithSchedule;

      const cells = habitHeatmap({
        habits: [mondaysOnly],
        entries: [],
        from: "2026-08-11",
        to: "2026-08-12",
        today: "2026-08-13",
        weekStartsOn: 1,
        timeZone: TZ,
      });
      expect(cells.every((c) => c.scheduled === 0)).toBe(true);
    });

    it("does not treat a times-per-week habit as due every day", () => {
      // The old open-coded test only handled weekly+daysOfWeek, so a
      // "3 times per week" habit was counted as scheduled on all 7 days and the
      // denominator was more than double what it should be. isDayScheduled
      // treats every day as ELIGIBLE for this shape, which is the documented
      // rule; the point of this test is that the two now agree.
      const timesPerWeek = {
        ...habit,
        id: "h5",
        schedule: {
          ...habit.schedule,
          id: "s5",
          habitId: "h5",
          frequency: "weekly",
          daysOfWeek: null,
          timesPerPeriod: 3,
        },
      } as HabitWithSchedule;

      const cells = habitHeatmap({
        habits: [timesPerWeek],
        entries: [],
        from: "2026-08-10",
        to: "2026-08-16",
        today: "2026-08-17",
        weekStartsOn: 1,
        timeZone: TZ,
      });
      // Eligible every day, matching lib/habit-streaks.isDayScheduled.
      expect(cells.map((c) => c.scheduled)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    });
  });
});

describe("comparison windows (audit R-18)", () => {
  it("gives the previous window exactly as many days as the current one", () => {
    // A window that ends mid-week: 11 whole weeks plus a Monday and Tuesday.
    const current = { from: "2026-05-25", to: "2026-08-11" };
    const prior = previousWindow(current);

    expect(windowDays(current)).toBe(79);
    expect(windowDays(prior)).toBe(79);
    // It ends the day before the current window starts, with no gap or overlap.
    expect(prior.to).toBe("2026-05-24");
    expect(prior.from).toBe("2026-03-07");
  });

  it("holds for a single-day window", () => {
    const prior = previousWindow({ from: "2026-08-17", to: "2026-08-17" });
    expect(prior).toEqual({ from: "2026-08-16", to: "2026-08-16" });
  });

  it("stops a part-week reading as a fall against a full one", () => {
    // 2 tasks a day, every day, for an unbroken run spanning every window here.
    const tasks: Task[] = dateRange("2026-01-01", "2026-08-11").flatMap((date) => [
      task({ completedAt: new Date(`${date}T05:00:00.000Z`) }),
      task({ completedAt: new Date(`${date}T06:00:00.000Z`) }),
    ]);

    const current = { from: "2026-05-25", to: "2026-08-11" };
    const prior = previousWindow(current);
    const sum = (points: { value: number }[]) => points.reduce((t, p) => t + p.value, 0);

    const now = sum(completionsByDay({ tasks, ...current, timeZone: TZ }));
    const before = sum(completionsByDay({ tasks, ...prior, timeZone: TZ }));

    // Identical behaviour on both sides now reports as identical.
    expect(now).toBe(before);
    expect(deltaPercent(now, before)).toBe(0);

    // The old shape: 12 whole weeks of baseline against a part-finished window.
    const oldPrior = { from: "2026-03-02", to: "2026-05-24" };
    const oldBefore = sum(completionsByDay({ tasks, ...oldPrior, timeZone: TZ }));
    expect(deltaPercent(now, oldBefore)).toBeLessThan(0);
  });
});

describe("heatWeeks (audit R-18 tabular equivalent)", () => {
  it("rolls cells into weeks that total the same as the cells", () => {
    const cells = [
      { date: "2026-08-10", done: 2, scheduled: 3, level: 2 as const },
      { date: "2026-08-11", done: 3, scheduled: 3, level: 4 as const },
      { date: "2026-08-17", done: 1, scheduled: 2, level: 2 as const },
    ];
    const weeks = heatWeeks(cells, 1);

    expect(weeks).toEqual([
      { weekStart: "2026-08-10", done: 5, scheduled: 6 },
      { weekStart: "2026-08-17", done: 1, scheduled: 2 },
    ]);
    // The table and the headline percentage cannot disagree.
    const done = weeks.reduce((t, w) => t + w.done, 0);
    const scheduled = weeks.reduce((t, w) => t + w.scheduled, 0);
    expect(Math.round((done / scheduled) * 100)).toBe(habitCompletionRate(cells));
  });
});
