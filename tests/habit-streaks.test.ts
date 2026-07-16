import { describe, expect, it } from "vitest";

import { manilaToday } from "@/lib/date";
import {
  computeHabitStreaks,
  entryOutcome,
  isDayScheduled,
  type EntryLike,
  type HabitLike,
  type ScheduleLike,
} from "@/lib/habit-streaks";

const boolHabit: HabitLike = { type: "boolean", targetValue: null, higherIsBetter: true };
const numHabit = (target: number, higherIsBetter = true): HabitLike => ({
  type: "numeric",
  targetValue: target,
  higherIsBetter,
});

const daily = (startDate: string): ScheduleLike => ({
  frequency: "daily",
  daysOfWeek: null,
  timesPerPeriod: null,
  startDate,
});
// Mon/Wed/Fri (0=Sun..6=Sat).
const mwf = (startDate: string): ScheduleLike => ({
  frequency: "weekly",
  daysOfWeek: [1, 3, 5],
  timesPerPeriod: null,
  startDate,
});

function e(entryDate: string, status: EntryLike["status"] = "done", value: number | null = null): EntryLike {
  return { entryDate, status, value };
}

describe("entryOutcome", () => {
  it("maps skip and miss directly", () => {
    expect(entryOutcome(boolHabit, e("2026-07-06", "skipped"))).toBe("skip");
    expect(entryOutcome(boolHabit, e("2026-07-06", "missed"))).toBe("miss");
  });

  it("numeric: value meeting the target is done, below is partial", () => {
    expect(entryOutcome(numHabit(8), e("2026-07-06", "done", 8))).toBe("done");
    expect(entryOutcome(numHabit(8), e("2026-07-06", "done", 5))).toBe("partial");
  });

  it("numeric at-most: below/at target is done, above is partial", () => {
    expect(entryOutcome(numHabit(3, false), e("2026-07-06", "done", 2))).toBe("done");
    expect(entryOutcome(numHabit(3, false), e("2026-07-06", "done", 5))).toBe("partial");
  });
});

describe("computeHabitStreaks - daily", () => {
  it("counts consecutive done days", () => {
    const entries = [e("2026-07-04"), e("2026-07-05"), e("2026-07-06")];
    expect(computeHabitStreaks({ habit: boolHabit, schedule: daily("2026-07-04"), entries, today: "2026-07-06" }))
      .toEqual({ current: 3, longest: 3 });
  });

  it("a past miss breaks current but not longest", () => {
    // done, done, MISS(no entry, past), done -> current from the last run.
    const entries = [e("2026-07-04"), e("2026-07-05"), e("2026-07-08")];
    const r = computeHabitStreaks({ habit: boolHabit, schedule: daily("2026-07-04"), entries, today: "2026-07-08" });
    expect(r.current).toBe(1); // only 07-08; 07-06/07-07 missing broke it
    expect(r.longest).toBe(2);
  });

  it("skipped days are neutral (bridge the streak)", () => {
    const entries = [e("2026-07-04"), e("2026-07-05", "skipped"), e("2026-07-06")];
    expect(computeHabitStreaks({ habit: boolHabit, schedule: daily("2026-07-04"), entries, today: "2026-07-06" }))
      .toEqual({ current: 2, longest: 2 });
  });

  it("today unlogged is pending, not a miss", () => {
    const entries = [e("2026-07-04"), e("2026-07-05")]; // nothing for today 07-06
    expect(computeHabitStreaks({ habit: boolHabit, schedule: daily("2026-07-04"), entries, today: "2026-07-06" }).current)
      .toBe(2);
  });

  it("numeric partial breaks the streak", () => {
    const entries = [e("2026-07-06", "done", 8), e("2026-07-07", "done", 10), e("2026-07-08", "done", 5)];
    const r = computeHabitStreaks({ habit: numHabit(8), schedule: daily("2026-07-06"), entries, today: "2026-07-08" });
    expect(r.current).toBe(0); // 07-08 is partial
    expect(r.longest).toBe(2);
  });
});

describe("computeHabitStreaks - schedule-aware (Mon/Wed/Fri)", () => {
  it("ignores unscheduled days (they are not misses)", () => {
    // Mon 07-06, Wed 07-08, Fri 07-10, Mon 07-13 all done; Tue/Thu/Sat/Sun ignored.
    const entries = [e("2026-07-06"), e("2026-07-08"), e("2026-07-10"), e("2026-07-13")];
    expect(computeHabitStreaks({ habit: boolHabit, schedule: mwf("2026-07-06"), entries, today: "2026-07-13" }))
      .toEqual({ current: 4, longest: 4 });
  });

  it("a missed SCHEDULED day breaks the streak", () => {
    // Missing Wed 07-08 (scheduled, past) breaks it.
    const entries = [e("2026-07-06"), e("2026-07-10"), e("2026-07-13")];
    const r = computeHabitStreaks({ habit: boolHabit, schedule: mwf("2026-07-06"), entries, today: "2026-07-13" });
    expect(r.current).toBe(2); // 07-10, 07-13
    expect(r.longest).toBe(2);
  });

  it("isDayScheduled respects the weekday set", () => {
    expect(isDayScheduled(mwf("2026-07-06"), "2026-07-06")).toBe(true); // Mon
    expect(isDayScheduled(mwf("2026-07-06"), "2026-07-07")).toBe(false); // Tue
    expect(isDayScheduled(mwf("2026-07-06"), "2026-07-08")).toBe(true); // Wed
  });
});

describe("computeHabitStreaks - Asia/Manila midnight boundary", () => {
  // Daily habit done through Sun 07-05; nothing logged for Mon 07-06.
  const entries = [e("2026-07-04"), e("2026-07-05")];
  const schedule = daily("2026-07-04");

  it("keeps the streak before the scheduled day (Mon) has ended in Manila", () => {
    // 15:59Z on 07-06 = 23:59 Manila on Mon 07-06 -> today is still 07-06 (pending).
    const today = manilaToday(new Date("2026-07-06T15:59:00.000Z"));
    expect(today).toBe("2026-07-06");
    expect(computeHabitStreaks({ habit: boolHabit, schedule, entries, today }).current).toBe(2);
  });

  it("breaks it once Manila midnight passes and the day became a miss", () => {
    // 16:00Z on 07-06 = 00:00 Manila on Tue 07-07 -> today rolls to 07-07;
    // Mon 07-06 is now a past scheduled day with no entry -> miss.
    const today = manilaToday(new Date("2026-07-06T16:00:00.000Z"));
    expect(today).toBe("2026-07-07");
    expect(computeHabitStreaks({ habit: boolHabit, schedule, entries, today }).current).toBe(0);
  });
});

describe("computeHabitStreaks - X times per week", () => {
  const schedule: ScheduleLike = {
    frequency: "weekly",
    daysOfWeek: null,
    timesPerPeriod: 3,
    startDate: "2026-06-29", // Monday
  };

  it("counts consecutive weeks that hit the target; current week pending is neutral", () => {
    const entries = [
      // Week of 06-29: 3 done -> success
      e("2026-06-29"), e("2026-07-01"), e("2026-07-03"),
      // Week of 07-06: 3 done -> success
      e("2026-07-06"), e("2026-07-08"), e("2026-07-10"),
      // Current week of 07-13: only 1 so far (pending, not yet 3)
      e("2026-07-13"),
    ];
    const r = computeHabitStreaks({ habit: boolHabit, schedule, entries, today: "2026-07-14" });
    expect(r.current).toBe(2);
    expect(r.longest).toBe(2);
  });

  it("a past week below target breaks the streak", () => {
    const entries = [
      e("2026-06-29"), e("2026-07-01"), e("2026-07-03"), // week 1 success
      e("2026-07-06"), // week 2: only 1 -> fail
      e("2026-07-13"), e("2026-07-15"), e("2026-07-17"), // week 3 success
    ];
    const r = computeHabitStreaks({ habit: boolHabit, schedule, entries, today: "2026-07-20" });
    expect(r.current).toBe(1); // only the most recent completed week
    expect(r.longest).toBe(1);
  });
});
