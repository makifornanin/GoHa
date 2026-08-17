import { describe, expect, it } from "vitest";

import {
  addMonths,
  buildMonthGrid,
  groupByDate,
  monthGridRange,
  monthLabel,
  parseMonthAnchor,
  weekdayHeaders,
} from "@/lib/calendar";
import { isTaskLate, taskMatchesProgress, taskMatchesTimeframe } from "@/lib/task-buckets";
import { parseDurationMinutes } from "@/lib/focus";

describe("calendar grid", () => {
  it("always renders 6 whole weeks", () => {
    const weeks = buildMonthGrid("2026-08-01", "2026-08-06", 1);
    expect(weeks).toHaveLength(6);
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it("starts on the user's week start and marks the month and today", () => {
    // 2026-08-01 is a Saturday; a Monday-start grid begins Mon 2026-07-27.
    const weeks = buildMonthGrid("2026-08-01", "2026-08-06", 1);
    expect(weeks[0][0].date).toBe("2026-07-27");
    expect(weeks[0][0].inMonth).toBe(false);

    const all = weeks.flat();
    expect(all.find((d) => d.date === "2026-08-01")?.inMonth).toBe(true);
    expect(all.filter((d) => d.isToday)).toHaveLength(1);
    expect(all.find((d) => d.isToday)?.date).toBe("2026-08-06");
  });

  it("honours a Sunday week start", () => {
    const weeks = buildMonthGrid("2026-08-01", "2026-08-06", 0);
    expect(weeks[0][0].date).toBe("2026-07-26");
    expect(weekdayHeaders(0)[0]).toBe("Sun");
    expect(weekdayHeaders(1)[0]).toBe("Mon");
  });

  it("moves between months and rolls the year", () => {
    expect(addMonths("2026-08-01", 1)).toBe("2026-09-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(monthLabel("2026-08-01")).toBe("August 2026");
  });

  it("groups items by date and skips undated ones", () => {
    const grouped = groupByDate(
      [{ d: "2026-08-06" }, { d: null }, { d: "2026-08-06" }, { d: "2026-08-07" }],
      (i) => i.d,
    );
    expect(grouped.get("2026-08-06")).toHaveLength(2);
    expect(grouped.get("2026-08-07")).toHaveLength(1);
    expect(grouped.size).toBe(2);
  });
});

describe("independent timeframe / progress filters", () => {
  const now = new Date("2026-08-06T04:00:00.000Z"); // 2026-08-06 noon Manila
  const overdue = { scheduledFor: "2026-08-01", dueAt: null, status: "todo" as const };
  const todayDone = { scheduledFor: "2026-08-06", dueAt: null, status: "completed" as const };
  const undated = { scheduledFor: null, dueAt: null, status: "todo" as const };

  it("derives 'late' from the date, and never for finished work", () => {
    expect(isTaskLate(overdue, now)).toBe(true);
    expect(isTaskLate({ ...overdue, status: "completed" }, now)).toBe(false);
    expect(isTaskLate(undated, now)).toBe(false);
  });

  it("lets a timeframe and a progress state compose", () => {
    // Done work still belongs to today's timeframe: the axes are independent.
    expect(taskMatchesTimeframe(todayDone, "today", now)).toBe(true);
    expect(taskMatchesProgress(todayDone, "done", now)).toBe(true);
    expect(taskMatchesProgress(todayDone, "todo", now)).toBe(false);
  });

  it("treats undated work as Inbox regardless of state", () => {
    expect(taskMatchesTimeframe(undated, "inbox", now)).toBe(true);
    expect(taskMatchesTimeframe(undated, "today", now)).toBe(false);
  });

  it("hides cancelled work from 'all' but keeps it reachable", () => {
    const cancelled = { ...undated, status: "cancelled" as const };
    expect(taskMatchesProgress(cancelled, "all", now)).toBe(false);
    expect(taskMatchesProgress(cancelled, "cancelled", now)).toBe(true);
  });
});

describe("focus duration parsing", () => {
  it("understands plain minutes and h/m combinations", () => {
    expect(parseDurationMinutes("90")).toBe(90);
    expect(parseDurationMinutes("1h30")).toBe(90);
    expect(parseDurationMinutes("1h 30m")).toBe(90);
    expect(parseDurationMinutes("2h")).toBe(120);
    expect(parseDurationMinutes("45m")).toBe(45);
    expect(parseDurationMinutes("45 mins")).toBe(45);
  });

  it("rejects nonsense and out-of-range values", () => {
    expect(parseDurationMinutes("")).toBeNull();
    expect(parseDurationMinutes("abc")).toBeNull();
    expect(parseDurationMinutes("0")).toBeNull();
    expect(parseDurationMinutes("999")).toBeNull();
    expect(parseDurationMinutes("10", 15, 60)).toBeNull();
  });
});

/**
 * The viewed month drives the query (audit R-07).
 *
 * The calendar used to fetch a fixed window around TODAY while navigation was
 * unlimited, so a month far enough away rendered with no habits and no focus
 * time and nothing to say why. These pin the two pure pieces that make the
 * fetched range and the drawn grid the same thing.
 */
describe("parseMonthAnchor", () => {
  const TODAY = "2026-08-17";

  it("accepts YYYY-MM", () => {
    expect(parseMonthAnchor("2026-03", TODAY)).toBe("2026-03-01");
  });

  it("accepts a full date and snaps it to the month", () => {
    expect(parseMonthAnchor("2026-03-19", TODAY)).toBe("2026-03-01");
  });

  it("falls back to the month containing today", () => {
    for (const bad of [undefined, null, "", "nonsense", "2026", "2026-13", "2026-00", "26-03"]) {
      expect(parseMonthAnchor(bad, TODAY)).toBe("2026-08-01");
    }
  });

  it("allows navigating years away from today", () => {
    expect(parseMonthAnchor("2019-11", TODAY)).toBe("2019-11-01");
    expect(parseMonthAnchor("2031-01", TODAY)).toBe("2031-01-01");
  });
});

describe("monthGridRange", () => {
  it("covers exactly the 42 cells the grid draws", () => {
    const anchor = "2026-08-01";
    const range = monthGridRange(anchor, 1);
    const cells = buildMonthGrid(anchor, "2026-08-17", 1).flat();

    expect(cells).toHaveLength(42);
    expect(range.start).toBe(cells[0].date);
    expect(range.end).toBe(cells[41].date);
  });

  it("honours the week-start preference", () => {
    // 2026-08-01 is a Saturday, so the two week starts pull in different days.
    expect(monthGridRange("2026-08-01", 1).start).toBe("2026-07-27"); // Monday
    expect(monthGridRange("2026-08-01", 0).start).toBe("2026-07-26"); // Sunday
  });

  it("agrees with the grid for every month of a year, both week starts", () => {
    // The real guarantee: whatever the server fetched is what the grid shows.
    for (const weekStart of [0, 1] as const) {
      for (let month = 1; month <= 12; month += 1) {
        const anchor = `2026-${String(month).padStart(2, "0")}-01`;
        const range = monthGridRange(anchor, weekStart);
        const cells = buildMonthGrid(anchor, "2026-08-17", weekStart).flat();
        expect(range.start).toBe(cells[0].date);
        expect(range.end).toBe(cells[cells.length - 1].date);
      }
    }
  });
});
