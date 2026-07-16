import { describe, expect, it } from "vitest";

import {
  isInBucket,
  taskEffectiveDate,
  taskMatchesView,
  type TaskStatusLike,
} from "@/lib/task-buckets";

// Noon Manila on Monday 2026-07-06 (04:00Z). Manila is a fixed +08:00 zone.
const NOW = new Date("2026-07-06T04:00:00.000Z");

function task(fields: {
  status?: TaskStatusLike;
  scheduledFor?: string | null;
  dueAt?: Date | null;
}) {
  return {
    status: fields.status ?? "todo",
    scheduledFor: fields.scheduledFor ?? null,
    dueAt: fields.dueAt ?? null,
  };
}

describe("taskEffectiveDate", () => {
  it("prefers scheduledFor when present", () => {
    expect(taskEffectiveDate(task({ scheduledFor: "2026-07-10", dueAt: new Date("2026-07-20T00:00:00Z") })))
      .toBe("2026-07-10");
  });

  it("falls back to the Manila date of dueAt", () => {
    // 06:00Z = 14:00 Manila on 07-06.
    expect(taskEffectiveDate(task({ dueAt: new Date("2026-07-06T06:00:00.000Z") }))).toBe("2026-07-06");
  });

  it("uses the Manila calendar date for a late-night due time (not the UTC date)", () => {
    // 16:30Z = 00:30 Manila on 07-07.
    expect(taskEffectiveDate(task({ dueAt: new Date("2026-07-06T16:30:00.000Z") }))).toBe("2026-07-07");
  });

  it("is null with neither field (an Inbox task)", () => {
    expect(taskEffectiveDate(task({}))).toBeNull();
  });
});

describe("isInBucket", () => {
  it("today includes today and excludes tomorrow", () => {
    expect(isInBucket("2026-07-06", "today", NOW)).toBe(true);
    expect(isInBucket("2026-07-07", "today", NOW)).toBe(false);
    expect(isInBucket("2026-07-05", "today", NOW)).toBe(false);
  });

  it("this_week spans Mon..Sun (week starts Monday)", () => {
    expect(isInBucket("2026-07-06", "this_week", NOW)).toBe(true); // Mon
    expect(isInBucket("2026-07-12", "this_week", NOW)).toBe(true); // Sun
    expect(isInBucket("2026-07-13", "this_week", NOW)).toBe(false); // next Mon
    expect(isInBucket("2026-07-05", "this_week", NOW)).toBe(false); // prev Sun
  });

  it("this_month covers the calendar month", () => {
    expect(isInBucket("2026-07-01", "this_month", NOW)).toBe(true);
    expect(isInBucket("2026-07-31", "this_month", NOW)).toBe(true);
    expect(isInBucket("2026-08-01", "this_month", NOW)).toBe(false);
    expect(isInBucket("2026-06-30", "this_month", NOW)).toBe(false);
  });

  it("this_quarter covers Q3 (Jul..Sep)", () => {
    expect(isInBucket("2026-07-01", "this_quarter", NOW)).toBe(true);
    expect(isInBucket("2026-09-30", "this_quarter", NOW)).toBe(true);
    expect(isInBucket("2026-10-01", "this_quarter", NOW)).toBe(false);
    expect(isInBucket("2026-06-30", "this_quarter", NOW)).toBe(false);
  });

  it("is false with no effective date", () => {
    expect(isInBucket(null, "today", NOW)).toBe(false);
  });
});

describe("taskMatchesView", () => {
  it("inbox = active tasks with no dates", () => {
    expect(taskMatchesView(task({ status: "todo" }), "inbox", NOW)).toBe(true);
    expect(taskMatchesView(task({ status: "in_progress" }), "inbox", NOW)).toBe(true);
    expect(taskMatchesView(task({ status: "todo", scheduledFor: "2026-07-06" }), "inbox", NOW)).toBe(false);
    expect(taskMatchesView(task({ status: "completed" }), "inbox", NOW)).toBe(false);
  });

  it("today = active tasks whose effective date is today", () => {
    expect(taskMatchesView(task({ scheduledFor: "2026-07-06" }), "today", NOW)).toBe(true);
    // Due today via a due-at instant.
    expect(taskMatchesView(task({ dueAt: new Date("2026-07-06T06:00:00Z") }), "today", NOW)).toBe(true);
    expect(taskMatchesView(task({ scheduledFor: "2026-07-07" }), "today", NOW)).toBe(false);
    // Completed/cancelled are excluded from timeframe views.
    expect(taskMatchesView(task({ status: "completed", scheduledFor: "2026-07-06" }), "today", NOW)).toBe(false);
    expect(taskMatchesView(task({ status: "cancelled", scheduledFor: "2026-07-06" }), "today", NOW)).toBe(false);
  });

  it("done = completed tasks only", () => {
    expect(taskMatchesView(task({ status: "completed" }), "done", NOW)).toBe(true);
    expect(taskMatchesView(task({ status: "todo" }), "done", NOW)).toBe(false);
  });

  it("all = every task, including cancelled", () => {
    expect(taskMatchesView(task({ status: "cancelled" }), "all", NOW)).toBe(true);
    expect(taskMatchesView(task({ status: "todo" }), "all", NOW)).toBe(true);
  });
});
