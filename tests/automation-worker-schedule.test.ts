import {
  smartReminderInstants,
  smartReminderWindow,
} from "@/lib/automation/smart-reminder";
import { describe, expect, it } from "vitest";

import {
  isJobDayCurrent,
  eveningWrapsPastMidnight,
  dueEveningSchedule,
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

/**
 * A day that ends after midnight.
 *
 * Reported by a real user: wake at 1pm, stop working at 2am. Both are genuine
 * rhythm times, but the original model compared them as minutes from the SAME
 * midnight, so 2am always meant this morning rather than tonight. The evening
 * landed before the morning, the window collapsed, and no reminder could ever
 * be placed. The evening summary was worse: it fired at 2am at the START of its
 * own day and reported nothing, every day, silently.
 *
 * These pin both halves: the wrapped day works, and an ordinary day is
 * unchanged to the minute.
 */
describe("a rhythm that wraps past midnight", () => {
  const TZ = "Asia/Manila";
  const DAY = "2026-09-03" as never;
  const USER = "b77a2f35-0000-4000-8000-000000000000";

  describe("the reminder window", () => {
    it("opens a real window for 1pm to 2am", () => {
      // 13:00 + 2h = 15:00, and 02:00 the next day - 2h = 24:00.
      const w = smartReminderWindow({ morningTime: "13:00:00", eveningTime: "02:00:00" });
      expect(w).not.toBeNull();
      expect(w?.startMinute).toBe(15 * 60);
      expect(w?.endMinute).toBe(24 * 60);
    });

    it("places four slots inside it", () => {
      const slots = smartReminderInstants({
        userId: USER, localDate: DAY, timezone: TZ,
        morningTime: "13:00:00", eveningTime: "02:00:00",
      });
      expect(slots).toHaveLength(4);
      for (const s of slots) {
        expect(s.minute).toBeGreaterThanOrEqual(15 * 60);
        expect(s.minute).toBeLessThanOrEqual(24 * 60);
      }
    });

    it("rolls a past-midnight slot onto the next calendar date", () => {
      // 13:00 to 06:00 closes at 04:00 the next day, so late slots pass 24:00.
      const slots = smartReminderInstants({
        userId: USER, localDate: DAY, timezone: TZ,
        morningTime: "13:00:00", eveningTime: "06:00:00",
      });
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) {
        const local = new Date(s.at.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
        // Every slot is a real instant on either the day or the one after it,
        // never an impossible "25:00" on the first.
        expect(["2026-09-03", "2026-09-04"]).toContain(local);
      }
      expect(slots.some((s) => s.minute >= 24 * 60)).toBe(true);
    });

    it("leaves an ordinary day byte-identical", () => {
      const w = smartReminderWindow({ morningTime: "06:00:00", eveningTime: "21:00:00" });
      expect(w).toEqual({ startMinute: 8 * 60, endMinute: 19 * 60 });
    });

    it("still refuses a rhythm with genuinely no room", () => {
      // 08:00/09:00 does not wrap and leaves nothing between +2h and -2h.
      expect(smartReminderWindow({ morningTime: "08:00:00", eveningTime: "09:00:00" })).toBeNull();
    });

    it("still refuses when a time is missing", () => {
      expect(smartReminderWindow({ morningTime: null, eveningTime: "21:00:00" })).toBeNull();
      expect(smartReminderWindow({ morningTime: "06:00:00", eveningTime: null })).toBeNull();
    });

    it("never produces a window longer than a day", () => {
      // The widest wrap is one minute short of 24h, minus both offsets.
      const w = smartReminderWindow({ morningTime: "13:00:00", eveningTime: "12:59:00" });
      expect(w!.endMinute - w!.startMinute).toBeLessThan(24 * 60);
    });
  });

  describe("which day the evening summary reports", () => {
    /** 02:00 local on the 4th, i.e. the night after the 3rd. */
    const at0200 = new Date("2026-09-03T18:00:00.000Z");

    it("reports YESTERDAY when the rhythm wraps", () => {
      const due = dueEveningSchedule({
        now: at0200, localDate: "2026-09-04" as never,
        morningTime: "13:00:00", eveningTime: "02:00:00", timezone: TZ,
      });
      expect(due).not.toBeNull();
      // Fires on the 4th, describes the 3rd: the day actually lived.
      expect(due?.summaryDate).toBe("2026-09-03");
      expect(due?.scheduledFor.toISOString()).toBe("2026-09-03T18:00:00.000Z");
    });

    it("reports today on an ordinary rhythm", () => {
      const at2100 = new Date("2026-09-03T13:00:00.000Z");
      const due = dueEveningSchedule({
        now: at2100, localDate: DAY,
        morningTime: "06:00:00", eveningTime: "21:00:00", timezone: TZ,
      });
      expect(due?.summaryDate).toBe("2026-09-03");
      expect(due?.scheduledFor.toISOString()).toBe("2026-09-03T13:00:00.000Z");
    });

    it("is not due before its time", () => {
      const noon = new Date("2026-09-03T04:00:00.000Z");
      expect(
        dueEveningSchedule({
          now: noon, localDate: DAY,
          morningTime: "06:00:00", eveningTime: "21:00:00", timezone: TZ,
        }),
      ).toBeNull();
    });

    it("is null when no evening time is set", () => {
      expect(
        dueEveningSchedule({
          now: at0200, localDate: DAY,
          morningTime: "13:00:00", eveningTime: null, timezone: TZ,
        }),
      ).toBeNull();
    });

    it("crosses a month boundary correctly", () => {
      // 02:00 on 1 October reports 30 September, not "0 October".
      const oct1 = new Date("2026-09-30T18:00:00.000Z");
      const due = dueEveningSchedule({
        now: oct1, localDate: "2026-10-01" as never,
        morningTime: "13:00:00", eveningTime: "02:00:00", timezone: TZ,
      });
      expect(due?.summaryDate).toBe("2026-09-30");
    });
  });

  describe("wrap detection", () => {
    it.each([
      ["13:00:00", "02:00:00", true],
      ["11:30:00", "01:00:00", true],
      ["06:00:00", "21:00:00", false],
      ["08:00:00", "09:00:00", false],
    ])("%s to %s wraps: %s", (m, e, expected) => {
      expect(eveningWrapsPastMidnight(m, e)).toBe(expected);
    });

    it("treats an equal pair as a wrap, not a zero-length day", () => {
      expect(eveningWrapsPastMidnight("13:00:00", "13:00:00")).toBe(true);
    });

    it("is false when either time is missing", () => {
      expect(eveningWrapsPastMidnight(null, "02:00:00")).toBe(false);
      expect(eveningWrapsPastMidnight("13:00:00", null)).toBe(false);
    });
  });

  describe("a wrapped job stays claimable after midnight", () => {
    /*
     * The trap this whole change had to avoid. Retries and staleness are scoped
     * to the job's own day; keying that to `localDate` would make the worker
     * discard a wrapped summary as stale at the very moment it became
     * claimable, and the fix would have looked correct while delivering nothing.
     */
    const wrapped = {
      localDate: "2026-09-03" as never,
      scheduledFor: new Date("2026-09-03T18:00:00.000Z"), // 02:00 on the 4th
      timezone: TZ,
    };

    it("is current at its delivery instant, on the following date", () => {
      expect(isJobDayCurrent(new Date("2026-09-03T18:00:30.000Z"), wrapped)).toBe(true);
    });

    it("is still current for a retry later that same night", () => {
      expect(isJobDayCurrent(new Date("2026-09-03T19:30:00.000Z"), wrapped)).toBe(true);
    });

    it("stops being current after the delivery day ends", () => {
      // 00:30 on the 5th, Manila.
      expect(isJobDayCurrent(new Date("2026-09-04T16:30:00.000Z"), wrapped)).toBe(false);
    });

    it("matches the old behaviour exactly for an ordinary job", () => {
      const ordinary = {
        localDate: "2026-09-03" as never,
        scheduledFor: new Date("2026-09-03T13:00:00.000Z"), // 21:00 the same day
        timezone: TZ,
      };
      expect(isJobDayCurrent(new Date("2026-09-03T13:05:00.000Z"), ordinary)).toBe(true);
      expect(isJobDayCurrent(new Date("2026-09-04T13:05:00.000Z"), ordinary)).toBe(false);
    });

    it("refuses rather than throwing on an unusable saved zone", () => {
      expect(
        isJobDayCurrent(new Date(), { ...wrapped, timezone: "Not/AZone" }),
      ).toBe(false);
    });
  });
});
