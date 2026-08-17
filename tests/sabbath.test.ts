import { describe, expect, it } from "vitest";

import { isSabbathDate, sabbathContext, SABBATH_MESSAGE } from "@/lib/sabbath";

/**
 * The rest day (automation Guide 07).
 *
 * Enforced once, server-side, so these seven cases are the whole gate. A wrong
 * answer here is either a work notification arriving on someone's rest day, or
 * a week of silence because every day matched.
 */

// 2026-08-16 is a Sunday; the week runs from there.
const WEEK = {
  0: "2026-08-16", // Sunday
  1: "2026-08-17",
  2: "2026-08-18",
  3: "2026-08-19",
  4: "2026-08-20",
  5: "2026-08-21",
  6: "2026-08-22", // Saturday
} as const;

describe("isSabbathDate", () => {
  it("matches each weekday, and only that weekday", () => {
    for (const [day, date] of Object.entries(WEEK)) {
      const sabbathDay = Number(day);
      expect(isSabbathDate(sabbathDay, date)).toBe(true);

      // Every other day of the same week must be a working day.
      for (const [otherDay, otherDate] of Object.entries(WEEK)) {
        if (otherDay === day) continue;
        expect(isSabbathDate(sabbathDay, otherDate)).toBe(false);
      }
    }
  });

  it("is off by default: null and undefined disable it entirely", () => {
    for (const date of Object.values(WEEK)) {
      expect(isSabbathDate(null, date)).toBe(false);
      expect(isSabbathDate(undefined, date)).toBe(false);
    }
  });

  it("refuses a value outside 0..6 rather than matching some day", () => {
    // A bad value must fail CLOSED (no rest day), never open onto an arbitrary
    // weekday, which would silence notifications on a day nobody chose.
    expect(isSabbathDate(7, WEEK[0])).toBe(false);
    expect(isSabbathDate(-1, WEEK[6])).toBe(false);
    expect(isSabbathDate(1.5, WEEK[1])).toBe(false);
    expect(isSabbathDate(Number.NaN, WEEK[1])).toBe(false);
  });

  it("holds across a year boundary", () => {
    // 2027-01-01 is a Friday.
    expect(isSabbathDate(5, "2027-01-01")).toBe(true);
    expect(isSabbathDate(6, "2027-01-01")).toBe(false);
  });
});

describe("sabbathContext", () => {
  it("carries the envelope every workflow branches on", () => {
    expect(
      sabbathContext({ sabbathDay: 6, localDate: WEEK[6], timezone: "Asia/Manila" }),
    ).toEqual({ localDate: WEEK[6], timezone: "Asia/Manila", isSabbath: true });

    expect(
      sabbathContext({ sabbathDay: 6, localDate: WEEK[5], timezone: "Asia/Manila" }),
    ).toEqual({ localDate: WEEK[5], timezone: "Asia/Manila", isSabbath: false });
  });

  it("decides from the LOCAL date, not from an instant", () => {
    // The caller resolves the local date in the owner's timezone before this
    // is reached. A Saturday in Manila is a Friday in UTC for eight hours, and
    // deciding from the instant would start the rest day at the wrong moment.
    const manilaSaturday = "2026-08-22";
    expect(sabbathContext({ sabbathDay: 6, localDate: manilaSaturday, timezone: "Asia/Manila" }).isSabbath).toBe(
      true,
    );
  });
});

describe("the rest message", () => {
  it("is a fixed sentence, not something generated", () => {
    // Guide 07, step 3.2: the same calm words every week. A model's variation
    // on "rest well" is exactly what this should not be.
    expect(SABBATH_MESSAGE).toBe(
      "Today is your Sabbath. No tasks, no scores, no catching up. Rest well.",
    );
  });
});
