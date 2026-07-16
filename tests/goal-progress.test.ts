import { describe, expect, it } from "vitest";

import { calculateGoalProgress, EMPTY_TASK_COUNTS } from "@/lib/goal-progress";

const auto = (tasks: { total: number; completed: number; cancelled: number }) =>
  calculateGoalProgress({
    status: "active",
    progressMode: "auto",
    manualProgress: null,
    tasks,
  });

describe("calculateGoalProgress - completed goals", () => {
  it("is always 100% when the goal status is completed", () => {
    expect(
      calculateGoalProgress({
        status: "completed",
        progressMode: "auto",
        manualProgress: 0,
        tasks: { total: 10, completed: 1, cancelled: 0 },
      }),
    ).toEqual({ percent: 100, source: "completed" });

    // Even in manual mode with a low manual value.
    expect(
      calculateGoalProgress({
        status: "completed",
        progressMode: "manual",
        manualProgress: 10,
        tasks: EMPTY_TASK_COUNTS,
      }).percent,
    ).toBe(100);
  });
});

describe("calculateGoalProgress - manual mode", () => {
  it("uses the manual value, ignoring tasks", () => {
    expect(
      calculateGoalProgress({
        status: "active",
        progressMode: "manual",
        manualProgress: 30,
        tasks: { total: 12, completed: 12, cancelled: 0 },
      }),
    ).toEqual({ percent: 30, source: "manual" });
  });

  it("treats null manual progress as 0", () => {
    expect(
      calculateGoalProgress({
        status: "active",
        progressMode: "manual",
        manualProgress: null,
        tasks: EMPTY_TASK_COUNTS,
      }),
    ).toEqual({ percent: 0, source: "manual" });
  });

  it("clamps manual progress into 0-100", () => {
    const high = calculateGoalProgress({
      status: "active",
      progressMode: "manual",
      manualProgress: 150,
      tasks: EMPTY_TASK_COUNTS,
    });
    const low = calculateGoalProgress({
      status: "active",
      progressMode: "manual",
      manualProgress: -20,
      tasks: EMPTY_TASK_COUNTS,
    });
    expect(high.percent).toBe(100);
    expect(low.percent).toBe(0);
  });
});

describe("calculateGoalProgress - auto (task-based) mode", () => {
  it("is 0% with zero linked tasks", () => {
    expect(auto({ total: 0, completed: 0, cancelled: 0 })).toEqual({ percent: 0, source: "none" });
  });

  it("counts completed tasks over the total", () => {
    expect(auto({ total: 5, completed: 2, cancelled: 0 })).toEqual({ percent: 40, source: "tasks" });
  });

  it("excludes cancelled tasks from the denominator", () => {
    // 5 total, 1 cancelled -> counted 4; 2 done -> 50%.
    expect(auto({ total: 5, completed: 2, cancelled: 1 })).toEqual({ percent: 50, source: "tasks" });
  });

  it("is 0% when every linked task is cancelled", () => {
    expect(auto({ total: 3, completed: 0, cancelled: 3 })).toEqual({ percent: 0, source: "none" });
  });

  it("reaches 100% when all counted tasks are done", () => {
    expect(auto({ total: 4, completed: 4, cancelled: 0 })).toEqual({ percent: 100, source: "tasks" });
    // With a cancelled task: 5 total, 1 cancelled, 4 done -> counted 4, all done.
    expect(auto({ total: 5, completed: 4, cancelled: 1 })).toEqual({ percent: 100, source: "tasks" });
  });

  it("rounds to the nearest whole percent", () => {
    expect(auto({ total: 3, completed: 1, cancelled: 0 }).percent).toBe(33);
    expect(auto({ total: 3, completed: 2, cancelled: 0 }).percent).toBe(67);
  });

  it("clamps completed above counted (defensive against bad data)", () => {
    expect(auto({ total: 6, completed: 8, cancelled: 0 }).percent).toBe(100);
  });
});
