import { describe, expect, it } from "vitest";

import { contextWeekStart, makeDateContext } from "@/lib/date-context";
import { deriveTodayData } from "@/lib/today";
import { taskEffectiveDate } from "@/lib/task-buckets";
import type { DailyPriority, Task } from "@/db";
import type { GoalWithCounts } from "@/db/repositories/goals";

/**
 * The timezone contract, exercised somewhere that is NOT Asia/Manila
 * (audit R-15).
 *
 * Every case here passed before the retrofit when run as the owner, because
 * the defaults happened to be right for them. That is exactly what made the
 * bug survive: the only way to see it is to be somewhere else, at the boundary.
 */

/** Manila is UTC+8; Los Angeles is UTC-7 in August. They differ by a day here. */
const MANILA = "Asia/Manila";
const LA = "America/Los_Angeles";

/** 2026-08-17T18:30Z = 2026-08-18 02:30 in Manila, but 2026-08-17 11:30 in LA. */
const ACROSS_MIDNIGHT = new Date("2026-08-17T18:30:00.000Z");

describe("makeDateContext", () => {
  it("resolves different local dates from the same instant", () => {
    const manila = makeDateContext({ timeZone: MANILA, weekStartsOn: 1, now: ACROSS_MIDNIGHT });
    const la = makeDateContext({ timeZone: LA, weekStartsOn: 1, now: ACROSS_MIDNIGHT });

    expect(manila.today).toBe("2026-08-18");
    expect(la.today).toBe("2026-08-17");
  });

  it("carries the local hour, not the UTC hour", () => {
    const manila = makeDateContext({ timeZone: MANILA, weekStartsOn: 1, now: ACROSS_MIDNIGHT });
    const la = makeDateContext({ timeZone: LA, weekStartsOn: 1, now: ACROSS_MIDNIGHT });

    expect(manila.hour).toBe(2);
    expect(la.hour).toBe(11);
  });

  it("resolves today once, so two reads cannot straddle midnight", () => {
    // The instant is frozen in the context, which is the point of holding `now`.
    const context = makeDateContext({ timeZone: MANILA, weekStartsOn: 1, now: ACROSS_MIDNIGHT });
    expect(context.now).toBe(ACROSS_MIDNIGHT);
    expect(context.today).toBe("2026-08-18");
  });

  it("honours the week-start preference", () => {
    const now = new Date("2026-08-17T04:00:00.000Z"); // Monday in Manila
    const monday = makeDateContext({ timeZone: MANILA, weekStartsOn: 1, now });
    const sunday = makeDateContext({ timeZone: MANILA, weekStartsOn: 0, now });

    expect(contextWeekStart(monday)).toBe("2026-08-17");
    expect(contextWeekStart(sunday)).toBe("2026-08-16");
  });

  describe("the exact midnight boundary", () => {
    it("2026-08-17T15:59:59Z is still the 17th in Manila", () => {
      const context = makeDateContext({
        timeZone: MANILA,
        weekStartsOn: 1,
        now: new Date("2026-08-17T15:59:59.000Z"),
      });
      expect(context.today).toBe("2026-08-17");
      expect(context.hour).toBe(23);
    });

    it("2026-08-17T16:00:00Z has become the 18th in Manila", () => {
      const context = makeDateContext({
        timeZone: MANILA,
        weekStartsOn: 1,
        now: new Date("2026-08-17T16:00:00.000Z"),
      });
      expect(context.today).toBe("2026-08-18");
      expect(context.hour).toBe(0);
    });

    it("the same two instants are both still the 17th in LA", () => {
      for (const iso of ["2026-08-17T15:59:59.000Z", "2026-08-17T16:00:00.000Z"]) {
        const context = makeDateContext({ timeZone: LA, weekStartsOn: 1, now: new Date(iso) });
        expect(context.today).toBe("2026-08-17");
      }
    });
  });
});

describe("R-15: Today bucketing respects the saved timezone", () => {
  /** A task whose ONLY date is a due-at instant near local midnight. */
  function dueOnly(id: string, dueAt: string): Task {
    return {
      id,
      userId: "u",
      goalId: null,
      lifeAreaId: null,
      parentTaskId: null,
      title: `task ${id}`,
      description: null,
      status: "todo",
      priority: "medium",
      scheduledFor: null,
      dueAt: new Date(dueAt),
      completedAt: null,
      completionNote: null,
      estimateMinutes: null,
      sortOrder: 0,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    } as Task;
  }

  it("puts a due-only task on a different day depending on the zone", () => {
    const task = dueOnly("t1", "2026-08-17T18:30:00.000Z");
    expect(taskEffectiveDate(task, MANILA)).toBe("2026-08-18");
    expect(taskEffectiveDate(task, LA)).toBe("2026-08-17");
  });

  it("deriveTodayData buckets by the supplied zone, not Manila", () => {
    const task = dueOnly("t1", "2026-08-17T18:30:00.000Z");
    const shared = {
      tasks: [task],
      goals: [] as GoalWithCounts[],
      priorities: [] as DailyPriority[],
    };

    // In LA the task is due today (the 17th).
    const la = deriveTodayData({ ...shared, today: "2026-08-17", timeZone: LA });
    expect(la.todayTasks.map((t) => t.id)).toEqual(["t1"]);
    expect(la.overdueTasks).toHaveLength(0);

    // In Manila the same instant is tomorrow, so it is neither today's nor late.
    const manila = deriveTodayData({ ...shared, today: "2026-08-17", timeZone: MANILA });
    expect(manila.todayTasks).toHaveLength(0);
    expect(manila.overdueTasks).toHaveLength(0);
  });

  it("does not call a task overdue a day early in a western zone", () => {
    // Due 2026-08-17 09:00 LA. On the 17th in LA that is today, not overdue.
    const task = dueOnly("t2", "2026-08-17T16:00:00.000Z");
    const data = deriveTodayData({
      tasks: [task],
      goals: [],
      priorities: [],
      today: "2026-08-17",
      timeZone: LA,
    });
    expect(data.overdueTasks).toHaveLength(0);
    expect(data.todayTasks.map((t) => t.id)).toEqual(["t2"]);
  });
});
