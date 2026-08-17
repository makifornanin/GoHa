import { describe, expect, it } from "vitest";

import {
  countsTowardExpected,
  habitOutcome,
  isCompleteOutcome,
  toDayCellState,
  type HabitMeasure,
  type HabitOutcome,
  type LoggedEntry,
} from "@/lib/habit-outcome";

/**
 * The shared habit-outcome definition (audit R-06).
 *
 * Organised by semantic row rather than by branch, because the bug this module
 * fixes was a disagreement about MEANING (is a below-target numeric day a
 * completion?) rather than a coding error in any one place.
 */

const BOOLEAN: HabitMeasure = { type: "boolean", targetValue: null, higherIsBetter: true };
const MORE_IS_BETTER: HabitMeasure = { type: "numeric", targetValue: 8, higherIsBetter: true };
const LESS_IS_BETTER: HabitMeasure = { type: "numeric", targetValue: 2, higherIsBetter: false };

const TODAY = "2026-08-17";
const YESTERDAY = "2026-08-16";
const TOMORROW = "2026-08-18";

/** Resolve with the boilerplate filled in; every test states only what it varies. */
function resolve(overrides: {
  habit?: HabitMeasure;
  entry?: LoggedEntry | null;
  scheduled?: boolean;
  date?: string;
  today?: string;
}): HabitOutcome {
  return habitOutcome({
    habit: overrides.habit ?? BOOLEAN,
    entry: overrides.entry ?? null,
    scheduled: overrides.scheduled ?? true,
    date: overrides.date ?? TODAY,
    today: overrides.today ?? TODAY,
  });
}

describe("habitOutcome: boolean habits", () => {
  it("a logged done is done", () => {
    expect(resolve({ entry: { status: "done", value: null } })).toBe("done");
  });

  it("an explicit missed is missed", () => {
    expect(resolve({ entry: { status: "missed", value: null } })).toBe("missed");
  });

  it("an explicit skipped is skipped", () => {
    expect(resolve({ entry: { status: "skipped", value: null } })).toBe("skipped");
  });

  it("a stray value on a boolean habit does not downgrade the completion", () => {
    // No target exists to compare against, so there is nothing to fall short of.
    expect(resolve({ entry: { status: "done", value: 1 } })).toBe("done");
  });
});

describe("habitOutcome: numeric habits, higher is better", () => {
  const habit = MORE_IS_BETTER;

  it("meeting the target exactly is done", () => {
    expect(resolve({ habit, entry: { status: "done", value: 8 } })).toBe("done");
  });

  it("exceeding the target is done", () => {
    expect(resolve({ habit, entry: { status: "done", value: 12 } })).toBe("done");
  });

  it("falling short is partial, NOT done", () => {
    // The whole of R-06: this is the day Calendar and Progress counted as a win.
    expect(resolve({ habit, entry: { status: "done", value: 5 } })).toBe("partial");
  });

  it("a logged zero is partial, not missed", () => {
    // The user logged something. It fell short; it was not an explicit miss.
    expect(resolve({ habit, entry: { status: "done", value: 0 } })).toBe("partial");
  });

  it("an explicit missed stays missed regardless of value", () => {
    expect(resolve({ habit, entry: { status: "missed", value: 99 } })).toBe("missed");
  });

  it("an explicit skipped stays skipped regardless of value", () => {
    expect(resolve({ habit, entry: { status: "skipped", value: 99 } })).toBe("skipped");
  });
});

describe("habitOutcome: numeric habits, lower is better", () => {
  const habit = LESS_IS_BETTER;

  it("coming in under the ceiling is done", () => {
    expect(resolve({ habit, entry: { status: "done", value: 1 } })).toBe("done");
  });

  it("hitting the ceiling exactly is done", () => {
    expect(resolve({ habit, entry: { status: "done", value: 2 } })).toBe("done");
  });

  it("going over the ceiling is partial", () => {
    expect(resolve({ habit, entry: { status: "done", value: 3 } })).toBe("partial");
  });

  it("zero is the best possible result, so it is done", () => {
    // The direction flip matters: for "at most 2 coffees", none is a success.
    expect(resolve({ habit, entry: { status: "done", value: 0 } })).toBe("done");
  });
});

describe("habitOutcome: tolerated nulls", () => {
  it("a numeric habit with no target treats a log as done", () => {
    const habit: HabitMeasure = { type: "numeric", targetValue: null, higherIsBetter: true };
    expect(resolve({ habit, entry: { status: "done", value: 3 } })).toBe("done");
  });

  it("a numeric habit with a target but no recorded value treats a log as done", () => {
    expect(resolve({ habit: MORE_IS_BETTER, entry: { status: "done", value: null } })).toBe("done");
  });
});

describe("habitOutcome: unlogged days", () => {
  it("a past scheduled day with no entry is missed", () => {
    expect(resolve({ date: YESTERDAY, today: TODAY })).toBe("missed");
  });

  it("today with no entry is pending, never missed", () => {
    // The day is not over. Calling it a miss would break a live streak.
    expect(resolve({ date: TODAY, today: TODAY })).toBe("pending");
  });

  it("a future scheduled day is pending", () => {
    expect(resolve({ date: TOMORROW, today: TODAY })).toBe("pending");
  });

  it("an unscheduled day is off_schedule, whenever it is", () => {
    for (const date of [YESTERDAY, TODAY, TOMORROW]) {
      expect(resolve({ scheduled: false, date, today: TODAY })).toBe("off_schedule");
    }
  });
});

describe("habitOutcome: precedence", () => {
  it("a logged entry wins over off_schedule", () => {
    // Doing a habit on a rest day is a real act; hiding it would be wrong.
    expect(resolve({ scheduled: false, entry: { status: "done", value: null } })).toBe("done");
  });

  it("a logged partial on an unscheduled past day still reads partial", () => {
    expect(
      resolve({
        habit: MORE_IS_BETTER,
        scheduled: false,
        entry: { status: "done", value: 2 },
        date: YESTERDAY,
      }),
    ).toBe("partial");
  });

  it("a logged entry wins over the past-day miss rule", () => {
    expect(resolve({ date: YESTERDAY, entry: { status: "done", value: null } })).toBe("done");
  });
});

describe("aggregation predicates", () => {
  it("only done counts as a completion", () => {
    expect(isCompleteOutcome("done")).toBe(true);
    for (const outcome of ["partial", "missed", "skipped", "pending", "off_schedule"] as const) {
      expect(isCompleteOutcome(outcome)).toBe(false);
    }
  });

  it("partial is expected but incomplete, which is the point of the fix", () => {
    expect(countsTowardExpected("partial")).toBe(true);
    expect(isCompleteOutcome("partial")).toBe(false);
  });

  it("off_schedule and skipped are excluded from the denominator", () => {
    expect(countsTowardExpected("off_schedule")).toBe(false);
    expect(countsTowardExpected("skipped")).toBe(false);
  });

  it("done, missed and pending all count toward the denominator", () => {
    for (const outcome of ["done", "missed", "pending"] as const) {
      expect(countsTowardExpected(outcome)).toBe(true);
    }
  });
});

describe("legacy vocabulary mapping", () => {
  it("maps every outcome to a cell state", () => {
    expect(toDayCellState("done")).toBe("done");
    expect(toDayCellState("partial")).toBe("partial");
    expect(toDayCellState("missed")).toBe("miss");
    expect(toDayCellState("skipped")).toBe("skip");
    expect(toDayCellState("pending")).toBe("pending");
    expect(toDayCellState("off_schedule")).toBe("off");
  });
});
