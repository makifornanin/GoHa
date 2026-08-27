import { describe, expect, it } from "vitest";

import {
  SMART_REMINDER_COOLDOWN_KINDS,
  SMART_REMINDER_COOLDOWN_MINUTES,
  SMART_REMINDER_SLOTS,
  SMART_REMINDER_TARGET_GAP_MINUTES,
  selectAnchorTask,
  smartReminderFallback,
  smartReminderInstants,
  smartReminderKey,
  smartReminderSlots,
  smartReminderStage,
  smartReminderWindow,
  type SmartReminderCandidate,
} from "@/lib/automation/smart-reminder";

/**
 * The rules behind a smart task reminder.
 *
 * GoHa owns every one of these decisions: when the window is, which four
 * moments sit inside it, which task is named, and what is said if the workflow
 * cannot narrate. n8n receives the answers, so anything it could get wrong is
 * pinned here instead.
 *
 * The times are DERIVED rather than stored, which makes stability the property
 * most worth testing: a restart, a redeploy or a poll five minutes later must
 * not move a reminder the user is already waiting for.
 */

const TZ = "Asia/Manila";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const DATE = "2026-08-26";

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

describe("the daily window", () => {
  it("opens two hours after the brief and closes two before the summary", () => {
    const w = smartReminderWindow({ morningTime: "08:00", eveningTime: "21:00" });
    expect(w).not.toBeNull();
    expect(hhmm(w!.startMinute)).toBe("10:00");
    expect(hhmm(w!.endMinute)).toBe("19:00");
  });

  it("has no window when either rhythm time is unset", () => {
    // An empty rhythm time already means "do not send that message". Inheriting
    // that silence is the consistent reading.
    expect(smartReminderWindow({ morningTime: null, eveningTime: "21:00" })).toBeNull();
    expect(smartReminderWindow({ morningTime: "08:00", eveningTime: null })).toBeNull();
    expect(smartReminderWindow({ morningTime: "", eveningTime: "" })).toBeNull();
  });

  it("has no window when the two times leave nothing between them", () => {
    // 08:00 and 09:00 means the day is not shaped for midday nudges at all.
    expect(smartReminderWindow({ morningTime: "08:00", eveningTime: "09:00" })).toBeNull();
    expect(smartReminderWindow({ morningTime: "20:00", eveningTime: "08:00" })).toBeNull();
  });

  it("rejects a malformed saved time rather than guessing", () => {
    expect(smartReminderWindow({ morningTime: "8am", eveningTime: "21:00" })).toBeNull();
    expect(smartReminderWindow({ morningTime: "08:00", eveningTime: "25:00" })).toBeNull();
  });
});

describe("the four opportunities", () => {
  const window = smartReminderWindow({ morningTime: "08:00", eveningTime: "21:00" })!;
  const slotsFor = (userId: string, localDate: string) =>
    smartReminderSlots({ userId, localDate, window });

  it("produces exactly four", () => {
    expect(slotsFor(USER, "2026-08-27")).toHaveLength(SMART_REMINDER_SLOTS);
  });

  it("returns the same four for the same user and date, every time", () => {
    /*
     * The property the whole design rests on. The dispatcher polls every few
     * minutes, and a restart must not hand the user a different afternoon.
     */
    const first = slotsFor(USER, "2026-08-27");
    for (let i = 0; i < 25; i++) {
      expect(slotsFor(USER, "2026-08-27")).toEqual(first);
    }
  });

  it("may differ on the next local date", () => {
    const today = slotsFor(USER, "2026-08-27");
    const tomorrow = slotsFor(USER, "2026-08-28");
    expect(tomorrow).toHaveLength(SMART_REMINDER_SLOTS);
    expect(tomorrow).not.toEqual(today);
  });

  it("differs between users on the same date", () => {
    expect(slotsFor(OTHER_USER, "2026-08-27")).not.toEqual(slotsFor(USER, "2026-08-27"));
  });

  it("keeps every time inside the window", () => {
    // Never before morning+2h, never after evening-2h. Checked across a month
    // rather than one lucky day.
    for (let d = 1; d <= 28; d++) {
      const date = `2026-09-${String(d).padStart(2, "0")}`;
      for (const minute of slotsFor(USER, date)) {
        expect(minute).toBeGreaterThanOrEqual(window.startMinute);
        expect(minute).toBeLessThanOrEqual(window.endMinute);
      }
    }
  });

  it("keeps them in ascending order and never on top of each other", () => {
    for (let d = 1; d <= 28; d++) {
      const minutes = slotsFor(USER, `2026-09-${String(d).padStart(2, "0")}`);
      for (let i = 1; i < minutes.length; i++) {
        expect(minutes[i]).toBeGreaterThan(minutes[i - 1]);
      }
    }
  });

  it("spaces them about 90 minutes apart in a normal day", () => {
    // A 9-hour window has room for the target gap, so it should hold.
    for (let d = 1; d <= 28; d++) {
      const minutes = slotsFor(USER, `2026-09-${String(d).padStart(2, "0")}`);
      for (let i = 1; i < minutes.length; i++) {
        expect(minutes[i] - minutes[i - 1]).toBeGreaterThanOrEqual(
          SMART_REMINDER_TARGET_GAP_MINUTES,
        );
      }
    }
  });
});

describe("a narrow window", () => {
  // 11:00 to 14:00 after the offsets: three hours for four reminders, so the
  // target spacing cannot hold and the window boundaries must win.
  const window = smartReminderWindow({ morningTime: "09:00", eveningTime: "16:00" })!;

  it("still produces four, inside the allowed interval", () => {
    expect(hhmm(window.startMinute)).toBe("11:00");
    expect(hhmm(window.endMinute)).toBe("14:00");
    for (let d = 1; d <= 20; d++) {
      const minutes = smartReminderSlots({
        userId: USER,
        localDate: `2026-10-${String(d).padStart(2, "0")}`,
        window,
      });
      expect(minutes).toHaveLength(SMART_REMINDER_SLOTS);
      for (const minute of minutes) {
        expect(minute).toBeGreaterThanOrEqual(window.startMinute);
        expect(minute).toBeLessThanOrEqual(window.endMinute);
      }
    }
  });

  it("reduces the spacing rather than spilling past the boundaries", () => {
    const minutes = smartReminderSlots({ userId: USER, localDate: "2026-10-01", window });
    const gaps = minutes.slice(1).map((m, i) => m - minutes[i]);
    // Squeezed below the target, which is the point of the test.
    expect(Math.min(...gaps)).toBeLessThan(SMART_REMINDER_TARGET_GAP_MINUTES);
    // But still spread, not clustered at one end.
    expect(Math.min(...gaps)).toBeGreaterThan(20);
  });
});

describe("resolving to real instants", () => {
  it("resolves each slot in the user's saved zone", () => {
    const slots = smartReminderInstants({
      userId: USER,
      localDate: "2026-08-27",
      timezone: TZ,
      morningTime: "08:00",
      eveningTime: "21:00",
    });
    expect(slots).toHaveLength(SMART_REMINDER_SLOTS);
    for (const slot of slots) {
      // Manila is UTC+8 with no DST, so the local hour is exact.
      const localHour = new Date(slot.at.getTime() + 8 * 3600_000).getUTCHours();
      expect(localHour).toBeGreaterThanOrEqual(10);
      expect(localHour).toBeLessThan(19);
    }
  });

  it("numbers the slots 1 to 4 in time order", () => {
    const slots = smartReminderInstants({
      userId: USER,
      localDate: "2026-08-27",
      timezone: TZ,
      morningTime: "08:00",
      eveningTime: "21:00",
    });
    expect(slots.map((s) => s.slotIndex)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].at.getTime()).toBeGreaterThan(slots[i - 1].at.getTime());
    }
  });

  it("resolves the same local clock time to different instants across zones", () => {
    const manila = smartReminderInstants({
      userId: USER, localDate: "2026-08-27", timezone: TZ,
      morningTime: "08:00", eveningTime: "21:00",
    });
    const london = smartReminderInstants({
      userId: USER, localDate: "2026-08-27", timezone: "Europe/London",
      morningTime: "08:00", eveningTime: "21:00",
    });
    // Same minutes-from-midnight, different points in time.
    expect(london.map((s) => s.minute)).toEqual(manila.map((s) => s.minute));
    expect(london[0].at.getTime()).not.toBe(manila[0].at.getTime());
  });

  it("survives a DST zone without inventing a time that did not happen", () => {
    // New York springs forward on 2026-03-08. Every slot that survives must
    // resolve back to the exact local clock time it claims.
    const slots = smartReminderInstants({
      userId: USER, localDate: "2026-03-08", timezone: "America/New_York",
      morningTime: "08:00", eveningTime: "21:00",
    });
    for (const slot of slots) {
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(slot.at);
      expect(local).toBe(hhmm(slot.minute));
    }
  });

  it("returns nothing when there is no window", () => {
    expect(
      smartReminderInstants({
        userId: USER, localDate: "2026-08-27", timezone: TZ,
        morningTime: null, eveningTime: "21:00",
      }),
    ).toEqual([]);
  });
});

describe("slot identity", () => {
  it("names a stage from the slot index alone", () => {
    expect(smartReminderStage(1)).toBe("early");
    expect(smartReminderStage(2)).toBe("midday");
    expect(smartReminderStage(3)).toBe("late");
    expect(smartReminderStage(4)).toBe("final");
  });

  it("clamps an out-of-range index rather than returning undefined", () => {
    expect(smartReminderStage(0)).toBe("early");
    expect(smartReminderStage(99)).toBe("final");
  });

  it("builds a dedupe key that is unique per day and slot", () => {
    expect(smartReminderKey("2026-08-27", 2)).toBe("smart:2026-08-27:2");
    expect(smartReminderKey("2026-08-27", 3)).not.toBe(smartReminderKey("2026-08-27", 2));
    expect(smartReminderKey("2026-08-28", 2)).not.toBe(smartReminderKey("2026-08-27", 2));
  });
});

describe("choosing the anchor task", () => {
  const task = (over: Partial<SmartReminderCandidate>): SmartReminderCandidate => ({
    id: "t1", title: "A task", priority: "medium", goalId: null,
    sortOrder: 0, createdAt: new Date("2026-08-01T00:00:00Z"), ...over,
  });

  it("returns null when nothing is left", () => {
    expect(selectAnchorTask([])).toBeNull();
  });

  it("prefers the highest priority, using GoHa's own enum", () => {
    const chosen = selectAnchorTask([
      task({ id: "low", priority: "low" }),
      task({ id: "urgent", priority: "urgent" }),
      task({ id: "medium", priority: "medium" }),
      task({ id: "high", priority: "high" }),
    ]);
    expect(chosen?.id).toBe("urgent");
  });

  it("falls to medium before low", () => {
    const chosen = selectAnchorTask([
      task({ id: "low", priority: "low" }),
      task({ id: "medium", priority: "medium" }),
    ]);
    expect(chosen?.id).toBe("medium");
  });

  it("breaks ties on the list's own order, so the choice is repeatable", () => {
    const pool = [
      task({ id: "b", sortOrder: 2 }),
      task({ id: "a", sortOrder: 1 }),
      task({ id: "c", sortOrder: 3 }),
    ];
    expect(selectAnchorTask(pool)?.id).toBe("a");
    expect(selectAnchorTask([...pool].reverse())?.id).toBe("a");
  });

  it("avoids repeating the previous anchor when something else is open", () => {
    const chosen = selectAnchorTask(
      [task({ id: "first", priority: "high" }), task({ id: "second", priority: "high", sortOrder: 1 })],
      "first",
    );
    expect(chosen?.id).toBe("second");
  });

  it("names the same task again when it is the only one left", () => {
    // Repetition is the honest answer here, not a bug to design around.
    const only = [task({ id: "only" })];
    expect(selectAnchorTask(only, "only")?.id).toBe("only");
  });

  it("prefers a lower-priority alternative over repeating the last anchor", () => {
    const chosen = selectAnchorTask(
      [task({ id: "urgent", priority: "urgent" }), task({ id: "low", priority: "low" })],
      "urgent",
    );
    expect(chosen?.id).toBe("low");
  });
});

describe("the fallback notification", () => {
  it("anchors on one task and says only what GoHa knows", () => {
    const fb = smartReminderFallback({
      anchorTitle: "Finish GoHa", remainingCount: 1, stage: "midday",
    });
    expect(fb.body).toContain("Finish GoHa");
    expect(fb.body).toContain("still on today's list");
    expect(fb.url).toBe("/today");
  });

  it("acknowledges the others without listing them", () => {
    const fb = smartReminderFallback({
      anchorTitle: "Finish GoHa", remainingCount: 3, stage: "early",
    });
    expect(fb.body).toContain("Finish GoHa");
    expect(fb.body).toContain("2 others");
  });

  it("says one other, not 1 others", () => {
    const fb = smartReminderFallback({
      anchorTitle: "Ship it", remainingCount: 2, stage: "late",
    });
    expect(fb.body).toContain("1 other still open");
  });

  it("never shames, blames or claims the task was untouched", () => {
    for (const remaining of [1, 2, 7]) {
      for (const stage of ["early", "midday", "late", "final"] as const) {
        const fb = smartReminderFallback({ anchorTitle: "A task", remainingCount: remaining, stage });
        const text = `${fb.title} ${fb.body}`.toLowerCase();
        for (const forbidden of [
          "failed", "behind", "untouched", "nothing", "haven't", "did not",
          "no progress", "slacking", "lazy", "disappointed",
        ]) {
          expect(text, `"${forbidden}" in "${text}"`).not.toContain(forbidden);
        }
      }
    }
  });

  it("stays short enough for a push", () => {
    const fb = smartReminderFallback({
      anchorTitle: "Finish the quarterly planning document for the team",
      remainingCount: 4, stage: "final",
    });
    expect(fb.title.length).toBeLessThanOrEqual(40);
    expect(fb.body.length).toBeLessThanOrEqual(160);
  });

  it("marks the last slot of the day differently", () => {
    const mid = smartReminderFallback({ anchorTitle: "X", remainingCount: 1, stage: "midday" });
    const last = smartReminderFallback({ anchorTitle: "X", remainingCount: 1, stage: "final" });
    expect(last.title).not.toBe(mid.title);
  });
});

describe("cooldown constants", () => {
  it("is 90 minutes after a deadline or focus nudge", () => {
    expect(SMART_REMINDER_COOLDOWN_MINUTES).toBe(90);
    expect([...SMART_REMINDER_COOLDOWN_KINDS]).toEqual(["deadline", "focus_overrun"]);
  });
});

describe("the window gate suppresses only an impossible window", () => {
  /*
   * The rule this pins down, because it is easy to get backwards: a window is
   * refused ONLY when Evening-2h does not come after Morning+2h. Being too
   * narrow for the 90-minute target is NOT a reason to go quiet. Reminders
   * still fire, spaced as widely as the day allows.
   */
  it("refuses a window that is zero or inverted", () => {
    // 08:00 + 2h == 12:00 - 2h exactly: no interval at all.
    expect(smartReminderWindow({ morningTime: "08:00", eveningTime: "12:00" })).toBeNull();
    expect(smartReminderWindow({ morningTime: "08:00", eveningTime: "09:00" })).toBeNull();
    expect(smartReminderWindow({ morningTime: "20:00", eveningTime: "21:00" })).toBeNull();
  });

  it("refuses a window only when a rhythm time is missing entirely", () => {
    expect(smartReminderWindow({ morningTime: null, eveningTime: "21:00" })).toBeNull();
    expect(smartReminderWindow({ morningTime: "06:00", eveningTime: null })).toBeNull();
  });

  it("accepts every positive window, however narrow", () => {
    for (const [morning, evening] of [
      ["08:00", "12:01"],
      ["08:00", "12:05"],
      ["08:00", "12:30"],
      ["08:00", "13:00"],
      ["08:00", "14:00"],
    ] as const) {
      const window = smartReminderWindow({ morningTime: morning, eveningTime: evening });
      expect(window, `${morning}/${evening} must not be suppressed`).not.toBeNull();
      expect(window!.endMinute).toBeGreaterThan(window!.startMinute);
    }
  });

  it("still produces four opportunities in a window far too narrow for the target", () => {
    // Five minutes wide. The target spacing is impossible; four reminders are
    // not, so four is what the day gets.
    const window = smartReminderWindow({ morningTime: "08:00", eveningTime: "12:05" })!;
    const minutes = smartReminderSlots({ userId: USER, localDate: DATE, window });
    expect(minutes).toHaveLength(SMART_REMINDER_SLOTS);
    expect(minutes[0]).toBeGreaterThanOrEqual(window.startMinute);
    expect(minutes[minutes.length - 1]).toBeLessThanOrEqual(window.endMinute);
  });

  it("gives every slot its own minute, never two notifications at one time", () => {
    /*
     * Rounding four centres into a very narrow window used to collapse them:
     * a 1-minute window produced 10:00, 10:00, 10:01, 10:01, which would have
     * fired two pairs of push notifications simultaneously. A window that
     * narrow cannot hold four distinct minutes, so it now yields as many as it
     * genuinely can, still ordered and still inside the boundaries.
     */
    for (let evening = 1; evening <= 90; evening++) {
      const hh = String(12 + Math.floor(evening / 60)).padStart(2, "0");
      const mm = String(evening % 60).padStart(2, "0");
      const window = smartReminderWindow({ morningTime: "08:00", eveningTime: `${hh}:${mm}` })!;
      expect(window).not.toBeNull();

      for (let d = 1; d <= 6; d++) {
        const minutes = smartReminderSlots({
          userId: USER,
          localDate: `2026-11-0${d}`,
          window,
        });
        expect(minutes.length).toBeGreaterThan(0);
        expect(minutes.length).toBeLessThanOrEqual(SMART_REMINDER_SLOTS);
        expect(new Set(minutes).size, `duplicate minute at span ${evening}`).toBe(minutes.length);
        for (let i = 1; i < minutes.length; i++) {
          expect(minutes[i]).toBeGreaterThan(minutes[i - 1]);
        }
        for (const minute of minutes) {
          expect(minute).toBeGreaterThanOrEqual(window.startMinute);
          expect(minute).toBeLessThanOrEqual(window.endMinute);
        }
      }
    }
  });

  it("produces four whenever the window can hold four distinct minutes", () => {
    // Three minutes is the smallest span with four minutes in it.
    const window = smartReminderWindow({ morningTime: "08:00", eveningTime: "12:03" })!;
    expect(smartReminderSlots({ userId: USER, localDate: DATE, window })).toHaveLength(
      SMART_REMINDER_SLOTS,
    );
  });
});
