import { describe, expect, it } from "vitest";

import {
  dueDailySchedule,
  isSameJobLocalDate,
  retryAt,
  scheduledLocalInstant,
} from "@/lib/automation/worker-schedule";

describe("automation worker daily scheduling", () => {
  it("evaluates the saved time in each user's timezone", () => {
    const now = new Date("2026-08-18T00:00:00.000Z"); // 08:00 Manila, 20:00 previous day New York

    expect(
      dueDailySchedule({
        now,
        date: "2026-08-18",
        time: "07:30:00",
        timezone: "Asia/Manila",
      })?.toISOString(),
    ).toBe("2026-08-17T23:30:00.000Z");

    // It is not yet August 18 in New York, so that user's August 18 job is not due.
    expect(
      dueDailySchedule({
        now,
        date: "2026-08-18",
        time: "07:30:00",
        timezone: "America/New_York",
      }),
    ).toBeNull();
  });

  it("does not invent a rhythm time when none was saved", () => {
    expect(
      dueDailySchedule({
        now: new Date("2026-08-18T12:00:00.000Z"),
        date: "2026-08-18",
        time: null,
        timezone: "Asia/Manila",
      }),
    ).toBeNull();
  });

  it("never emits a prior-day daily job after local midnight", () => {
    const now = new Date("2026-08-18T16:05:00.000Z"); // Aug 19 00:05 Manila
    expect(
      dueDailySchedule({
        now,
        date: "2026-08-18",
        time: "20:00:00",
        timezone: "Asia/Manila",
      }),
    ).toBeNull();
    expect(isSameJobLocalDate(now, "2026-08-18", "Asia/Manila")).toBe(false);
  });

  it("rejects an invalid zone and a wall time skipped by DST", () => {
    expect(
      scheduledLocalInstant({
        date: "2026-08-18",
        time: "07:30",
        timezone: "Not/A_Zone",
      }),
    ).toBeNull();
    // America/New_York jumps from 01:59:59 to 03:00 on this date.
    expect(
      scheduledLocalInstant({
        date: "2026-03-08",
        time: "02:30",
        timezone: "America/New_York",
      }),
    ).toBeNull();
  });
});

describe("automation worker retries", () => {
  it("uses bounded deterministic backoff", () => {
    const now = new Date("2026-08-18T00:00:00.000Z");
    expect(retryAt(now, 1).toISOString()).toBe("2026-08-18T00:01:00.000Z");
    expect(retryAt(now, 2).toISOString()).toBe("2026-08-18T00:05:00.000Z");
    expect(retryAt(now, 3).toISOString()).toBe("2026-08-18T00:15:00.000Z");
    expect(retryAt(now, 99).toISOString()).toBe("2026-08-18T01:00:00.000Z");
  });
});
