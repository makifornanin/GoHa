import { describe, expect, it } from "vitest";

import {
  addDays,
  manilaBucketRange,
  manilaDayRangeUtc,
  manilaToday,
  startOfManilaDayUtc,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  toManilaDate,
  weekdayOf,
} from "@/lib/date";

/**
 * These tests pin the Asia/Manila date rules (CLAUDE.md section 6). Manila is a
 * fixed +08:00 zone, so all expectations are exact instants and calendar dates.
 */

describe("toManilaDate", () => {
  it("resolves the local calendar date, not the UTC date", () => {
    // 16:30Z is 00:30 the next day in Manila -> belongs to the later local date.
    const instant = new Date("2026-07-06T16:30:00.000Z");
    expect(toManilaDate(instant)).toBe("2026-07-07");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-07-06"); // UTC date differs
  });

  it("keeps late-evening Manila time on the same local date", () => {
    // 15:59:59Z = 23:59:59 Manila on 07-06.
    expect(toManilaDate(new Date("2026-07-06T15:59:59.000Z"))).toBe("2026-07-06");
  });

  it("rolls to the next local date exactly at Manila midnight (16:00Z)", () => {
    expect(toManilaDate(new Date("2026-07-06T15:59:59.999Z"))).toBe("2026-07-06");
    expect(toManilaDate(new Date("2026-07-06T16:00:00.000Z"))).toBe("2026-07-07");
  });

  it("treats UTC midnight as still the same Manila morning", () => {
    // 00:00Z = 08:00 Manila same day.
    expect(toManilaDate(new Date("2026-07-06T00:00:00.000Z"))).toBe("2026-07-06");
  });

  it("handles a habit logged at 12:30 AM Manila (CLAUDE.md example)", () => {
    // 00:30 Manila on 07-07 is 16:30Z on 07-06.
    const start = startOfManilaDayUtc("2026-07-07");
    const at1230am = new Date(start.getTime() + 30 * 60 * 1000);
    expect(toManilaDate(at1230am)).toBe("2026-07-07");
    // Naive UTC truncation would wrongly bucket it on 07-06.
    expect(at1230am.toISOString().slice(0, 10)).toBe("2026-07-06");
  });
});

describe("startOfManilaDayUtc / manilaDayRangeUtc", () => {
  it("maps 00:00 Manila to 16:00Z the previous day", () => {
    expect(startOfManilaDayUtc("2026-07-07").toISOString()).toBe("2026-07-06T16:00:00.000Z");
  });

  it("produces a half-open [start, nextDay) UTC range", () => {
    const { start, endExclusive } = manilaDayRangeUtc("2026-07-07");
    expect(start.toISOString()).toBe("2026-07-06T16:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-07-07T16:00:00.000Z");
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles leap-year February", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01"); // 2026 is not a leap year
  });
});

describe("week / month / quarter / year starts", () => {
  it("knows 2026-07-06 is a Monday", () => {
    expect(weekdayOf("2026-07-06")).toBe(1);
  });

  it("computes start of week for both Monday and Sunday starts", () => {
    expect(startOfWeek("2026-07-08", 1)).toBe("2026-07-06"); // Wed -> Mon
    expect(startOfWeek("2026-07-06", 1)).toBe("2026-07-06"); // Mon -> Mon
    expect(startOfWeek("2026-07-06", 0)).toBe("2026-07-05"); // Mon -> prev Sun
  });

  it("computes month, quarter, and year starts", () => {
    expect(startOfMonth("2026-07-06")).toBe("2026-07-01");
    expect(startOfQuarter("2026-07-06")).toBe("2026-07-01");
    expect(startOfQuarter("2026-05-15")).toBe("2026-04-01");
    expect(startOfQuarter("2026-02-01")).toBe("2026-01-01");
    expect(startOfQuarter("2026-11-30")).toBe("2026-10-01");
    expect(startOfYear("2026-07-06")).toBe("2026-01-01");
  });
});

describe("manilaBucketRange", () => {
  // Noon Manila on 2026-07-06 (a Monday): 04:00Z.
  const noon = new Date("2026-07-06T04:00:00.000Z");

  it("derives today's date in Manila from the instant", () => {
    expect(manilaToday(noon)).toBe("2026-07-06");
  });

  it("produces half-open ranges for each bucket", () => {
    expect(manilaBucketRange("today", noon)).toEqual({
      start: "2026-07-06",
      endExclusive: "2026-07-07",
    });
    expect(manilaBucketRange("this_week", noon, 1)).toEqual({
      start: "2026-07-06",
      endExclusive: "2026-07-13",
    });
    expect(manilaBucketRange("this_month", noon)).toEqual({
      start: "2026-07-01",
      endExclusive: "2026-08-01",
    });
    expect(manilaBucketRange("this_quarter", noon)).toEqual({
      start: "2026-07-01",
      endExclusive: "2026-10-01",
    });
    expect(manilaBucketRange("this_year", noon)).toEqual({
      start: "2026-01-01",
      endExclusive: "2027-01-01",
    });
  });

  it("rolls the 'today' bucket at Manila midnight, not UTC midnight", () => {
    // 23:30 Manila on 07-06 (15:30Z) is still 07-06.
    expect(manilaBucketRange("today", new Date("2026-07-06T15:30:00.000Z"))).toEqual({
      start: "2026-07-06",
      endExclusive: "2026-07-07",
    });
    // 00:00 Manila on 07-07 (16:00Z) has already rolled to 07-07.
    expect(manilaBucketRange("today", new Date("2026-07-06T16:00:00.000Z"))).toEqual({
      start: "2026-07-07",
      endExclusive: "2026-07-08",
    });
  });

  it("rolls month, quarter, and year at the correct end-of-year boundary", () => {
    const decNoon = new Date("2026-12-31T04:00:00.000Z"); // 2026-12-31 noon Manila
    expect(manilaBucketRange("this_month", decNoon)).toEqual({
      start: "2026-12-01",
      endExclusive: "2027-01-01",
    });
    expect(manilaBucketRange("this_quarter", decNoon)).toEqual({
      start: "2026-10-01",
      endExclusive: "2027-01-01",
    });
  });
});
