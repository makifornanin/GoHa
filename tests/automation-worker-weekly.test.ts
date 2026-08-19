import { describe, expect, it } from "vitest";

import {
  dueWeeklySchedule,
  isPushJobKind,
  PUSH_JOB_KINDS,
} from "@/lib/automation/worker-schedule";

/**
 * The weekly digests (graveyard, review) and the rule that separates a phone
 * notification from an email one.
 *
 * These two decisions are what let a rest day defer a weekly run instead of
 * losing it, and what stops a user without a phone from silently never
 * receiving a digest that was always meant to be email.
 */

const TZ = "Asia/Manila";
/** 2026-08-23 is a Sunday: the last day of a Monday-start week. */
const ANCHOR = "2026-08-23";

function at(local: string): Date {
  // Manila is UTC+8 with no DST, so this is exact.
  return new Date(`${local}+08:00`);
}

describe("dueWeeklySchedule", () => {
  it("is not due before the anchor day", () => {
    expect(
      dueWeeklySchedule({
        now: at("2026-08-22T23:00:00"),
        localDate: "2026-08-22",
        anchor: ANCHOR,
        time: "20:00",
        timezone: TZ,
      }),
    ).toBeNull();
  });

  it("is not due on the anchor day before the chosen time", () => {
    expect(
      dueWeeklySchedule({
        now: at("2026-08-23T19:59:00"),
        localDate: ANCHOR,
        anchor: ANCHOR,
        time: "20:00",
        timezone: TZ,
      }),
    ).toBeNull();
  });

  it("becomes due on the anchor day once the time passes", () => {
    const due = dueWeeklySchedule({
      now: at("2026-08-23T20:00:00"),
      localDate: ANCHOR,
      anchor: ANCHOR,
      time: "20:00",
      timezone: TZ,
    });
    expect(due).not.toBeNull();
    expect(due!.toISOString()).toBe(at("2026-08-23T20:00:00").toISOString());
  });

  it("catches up the next day without waiting for the same clock time", () => {
    /*
     * This is the Sabbath deferral. The caller skips materializing on a rest
     * day; the following morning the week key is still unclaimed, and a
     * catch-up run must not sit idle until 20:00 again to deliver work that
     * was already late.
     */
    const due = dueWeeklySchedule({
      now: at("2026-08-24T07:00:00"),
      localDate: "2026-08-24",
      anchor: ANCHOR,
      time: "20:00",
      timezone: TZ,
    });
    expect(due).not.toBeNull();
  });

  it("does not schedule a daily run when no rhythm time is saved", () => {
    // On the anchor day itself an unset time means the user never said when,
    // so nothing fires; the catch-up path still works the following day.
    expect(
      dueWeeklySchedule({
        now: at("2026-08-23T20:00:00"),
        localDate: ANCHOR,
        anchor: ANCHOR,
        time: null,
        timezone: TZ,
      }),
    ).toBeNull();
  });
});

describe("push kinds versus email digests", () => {
  it("treats the phone notifications as push", () => {
    for (const kind of ["morning_brief", "sabbath", "evening_summary", "deadline", "focus_overrun"]) {
      expect(isPushJobKind(kind)).toBe(true);
    }
  });

  it("does NOT treat the weekly digests as push", () => {
    // Guides 05 and 06 deliver by email from the workflow. If these were push
    // kinds they would be gated on having a registered device, and a user who
    // never installs the PWA would silently never get a digest.
    expect(isPushJobKind("graveyard")).toBe(false);
    expect(isPushJobKind("review_draft")).toBe(false);
  });

  it("keeps streak_risk out of the active set while it is disabled", () => {
    // Flexible X-per-period habits have no correct daily denominator yet, so
    // this kind is deliberately not scheduled or delivered.
    expect(PUSH_JOB_KINDS.has("streak_risk")).toBe(false);
  });
});
