import { describe, expect, it } from "vitest";

import type { HabitEntry } from "@/db";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import { buildHabitViews } from "@/lib/habit-view";

const TZ = "Asia/Manila";

/**
 * A habit row with no schedule row, which is the shape that exposed the bug:
 * `startDate` was null, so every day since the beginning of the query horizon
 * counted as scheduled and therefore as MISSED.
 */
function habit(overrides: Partial<HabitWithSchedule> = {}): HabitWithSchedule {
  return {
    id: "habit-1",
    userId: "user-1",
    lifeAreaId: null,
    goalId: null,
    name: "Morning pages",
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
    // Wednesday 2026-08-05, 09:00 Manila.
    createdAt: new Date("2026-08-05T01:00:00.000Z"),
    updatedAt: new Date("2026-08-05T01:00:00.000Z"),
    schedule: null,
    ...overrides,
  } as HabitWithSchedule;
}

function entry(entryDate: string, status: HabitEntry["status"] = "done"): HabitEntry {
  return {
    id: `entry-${entryDate}`,
    userId: "user-1",
    habitId: "habit-1",
    entryDate,
    status,
    value: null,
    note: null,
    createdAt: new Date(`${entryDate}T02:00:00.000Z`),
    updatedAt: new Date(`${entryDate}T02:00:00.000Z`),
  };
}

/** Week of Sun 2026-08-02 .. Sat 2026-08-08, today = Fri 2026-08-07. */
const TODAY = "2026-08-07";

function cellsFor(views: ReturnType<typeof buildHabitViews>) {
  return Object.fromEntries(views[0].weekCells.map((c) => [c.date, c.state]));
}

describe("buildHabitViews: a habit cannot be missed before it exists", () => {
  it("treats days before the habit was created as not scheduled, not missed", () => {
    const views = buildHabitViews({
      habits: [habit()],
      entries: [],
      today: TODAY,
      weekStartsOn: 0,
      timeZone: TZ,
    });
    const cells = cellsFor(views);

    // Created Wed Aug 5: Sun-Tue predate it entirely.
    expect(cells["2026-08-02"]).toBe("off");
    expect(cells["2026-08-03"]).toBe("off");
    expect(cells["2026-08-04"]).toBe("off");

    // Wed and Thu are real, unlogged, past days: genuinely missed.
    expect(cells["2026-08-05"]).toBe("miss");
    expect(cells["2026-08-06"]).toBe("miss");

    // Today is still open, tomorrow has not happened.
    expect(cells[TODAY]).toBe("pending");
    expect(cells["2026-08-08"]).toBe("pending");
  });

  it("does not charge a brand-new habit with a broken streak", () => {
    const createdToday = habit({ createdAt: new Date("2026-08-07T01:00:00.000Z") });
    const views = buildHabitViews({
      habits: [createdToday],
      entries: [],
      today: TODAY,
      weekStartsOn: 0,
      timeZone: TZ,
    });

    expect(views[0].streaks).toEqual({ current: 0, longest: 0 });
    // Nothing before today should be marked at all.
    const before = views[0].weekCells.filter((c) => c.date < TODAY);
    expect(before.every((c) => c.state === "off")).toBe(true);
  });

  it("counts a streak from the creation day forward", () => {
    const views = buildHabitViews({
      habits: [habit()],
      entries: [entry("2026-08-05"), entry("2026-08-06"), entry(TODAY)],
      today: TODAY,
      weekStartsOn: 0,
      timeZone: TZ,
    });
    expect(views[0].streaks.current).toBe(3);
  });

  it("an explicit schedule startDate still wins over the creation date", () => {
    const withSchedule = habit({
      schedule: {
        id: "sched-1",
        userId: "user-1",
        habitId: "habit-1",
        frequency: "daily",
        daysOfWeek: null,
        daysOfMonth: null,
        timesPerPeriod: null,
        startDate: "2026-08-06",
        endDate: null,
        isActive: true,
        createdAt: new Date("2026-08-05T01:00:00.000Z"),
        updatedAt: new Date("2026-08-05T01:00:00.000Z"),
      },
    } as Partial<HabitWithSchedule>);

    const cells = cellsFor(
      buildHabitViews({
        habits: [withSchedule],
        entries: [],
        today: TODAY,
        weekStartsOn: 0,
        timeZone: TZ,
      }),
    );

    // Created Aug 5 but scheduled from Aug 6: Aug 5 is off, Aug 6 is a real miss.
    expect(cells["2026-08-05"]).toBe("off");
    expect(cells["2026-08-06"]).toBe("miss");
  });

  it("marks exactly one cell as today", () => {
    const views = buildHabitViews({
      habits: [habit()],
      entries: [],
      today: TODAY,
      weekStartsOn: 0,
      timeZone: TZ,
    });
    const todayCells = views[0].weekCells.filter((c) => c.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].date).toBe(TODAY);
  });
});
