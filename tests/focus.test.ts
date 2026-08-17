import { describe, expect, it } from "vitest";

import {
  ABANDON_MAX_SECONDS,
  aggregateFocus,
  autoEndCountdownSeconds,
  countedFocusSeconds,
  FOCUS_AUTO_END_GRACE_SECONDS,
  focusElapsedSeconds,
  focusOvertimeSeconds,
  formatClock,
  formatDurationHm,
  isStaleFocusSession,
  resolvePausedSeconds,
  shouldAutoEndFocusSession,
} from "@/lib/focus";

const T0 = new Date("2026-07-08T00:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe("focusElapsedSeconds", () => {
  it("is the full window when there are no pauses", () => {
    expect(
      focusElapsedSeconds({ startedAt: T0, endedAt: at(900), pausedSeconds: 0, pausedAt: null }),
    ).toBe(900);
  });

  it("subtracts resolved paused time (a pause and resume case)", () => {
    // Paused from t0+300 to t0+500 => 200s paused; ended at t0+900 => 700 focused.
    const pausedSeconds = resolvePausedSeconds(0, at(300), at(500));
    expect(pausedSeconds).toBe(200);
    expect(
      focusElapsedSeconds({ startedAt: T0, endedAt: at(900), pausedSeconds, pausedAt: null }),
    ).toBe(700);
  });

  it("accumulates multiple pauses", () => {
    // First pause 300->500 (200s), second pause 700->760 (60s) => 260 paused.
    let paused = resolvePausedSeconds(0, at(300), at(500));
    paused = resolvePausedSeconds(paused, at(700), at(760));
    expect(paused).toBe(260);
    expect(
      focusElapsedSeconds({ startedAt: T0, endedAt: at(1000), pausedSeconds: paused, pausedAt: null }),
    ).toBe(740);
  });

  it("freezes while currently paused (in-progress)", () => {
    // Running, paused since t0+300; now t0+500 => focused only 0..300 = 300.
    expect(
      focusElapsedSeconds(
        { startedAt: T0, endedAt: null, pausedSeconds: 0, pausedAt: at(300) },
        at(500),
      ),
    ).toBe(300);
  });

  it("counts up while running (in-progress, not paused)", () => {
    expect(
      focusElapsedSeconds({ startedAt: T0, endedAt: null, pausedSeconds: 0, pausedAt: null }, at(600)),
    ).toBe(600);
  });

  it("combines a prior pause with an ongoing pause", () => {
    // 100s already paused, currently paused since t0+400, now t0+600 => paused 300 => 300 focused.
    expect(
      focusElapsedSeconds(
        { startedAt: T0, endedAt: null, pausedSeconds: 100, pausedAt: at(400) },
        at(600),
      ),
    ).toBe(300);
  });

  it("never returns a negative or impossible duration", () => {
    // Ended before it started.
    expect(
      focusElapsedSeconds({ startedAt: at(500), endedAt: at(100), pausedSeconds: 0, pausedAt: null }),
    ).toBe(0);
    // Paused longer than the window.
    expect(
      focusElapsedSeconds({ startedAt: T0, endedAt: at(300), pausedSeconds: 9999, pausedAt: null }),
    ).toBe(0);
  });
});

describe("countedFocusSeconds", () => {
  it("caps counted time at the planned duration", () => {
    expect(countedFocusSeconds(1800, 1500)).toBe(1500); // over the 25m plan -> capped
    expect(countedFocusSeconds(1000, 1500)).toBe(1000); // under the plan -> as-is
  });

  it("caps at ABANDON_MAX when there is no plan", () => {
    expect(countedFocusSeconds(5000, null)).toBe(5000);
    expect(countedFocusSeconds(ABANDON_MAX_SECONDS + 10_000, null)).toBe(ABANDON_MAX_SECONDS);
  });

  it("never counts negative time", () => {
    expect(countedFocusSeconds(-100, 1500)).toBe(0);
  });
});

describe("isStaleFocusSession", () => {
  it("is true only after the abandon threshold", () => {
    expect(isStaleFocusSession(at(0), at(60 * 60))).toBe(false); // 1h
    expect(isStaleFocusSession(at(0), at(13 * 60 * 60))).toBe(true); // 13h
  });
});

describe("formatting", () => {
  it("formats a clock", () => {
    expect(formatClock(1500)).toBe("25:00");
    expect(formatClock(255)).toBe("04:15");
    expect(formatClock(3660)).toBe("1:01:00");
    expect(formatClock(-5)).toBe("00:00");
  });

  it("formats a human duration", () => {
    expect(formatDurationHm(1500)).toBe("25m");
    expect(formatDurationHm(4800)).toBe("1h 20m");
    expect(formatDurationHm(3600)).toBe("1h");
    // Sub-minute sessions report seconds, so a real session never reads "0m".
    expect(formatDurationHm(0)).toBe("0s");
    expect(formatDurationHm(45)).toBe("45s");
    expect(formatDurationHm(59)).toBe("59s");
    expect(formatDurationHm(60)).toBe("1m");
  });
});

describe("aggregateFocus", () => {
  it("totals today/week and breaks down by task, goal, and life area", () => {
    const tasksById = new Map([
      ["t1", { title: "Write", goalId: "g1", lifeAreaId: "a1" }],
      ["t2", { title: "Design", goalId: "g1", lifeAreaId: "a2" }],
    ]);
    const result = aggregateFocus({
      today: "2026-07-08",
      sessions: [
        { taskId: "t1", sessionDate: "2026-07-08", durationSeconds: 1500 },
        { taskId: "t2", sessionDate: "2026-07-07", durationSeconds: 900 },
        { taskId: null, sessionDate: "2026-07-08", durationSeconds: 600 },
      ],
      tasksById,
      goalsById: new Map([["g1", "Launch"]]),
      lifeAreasById: new Map([["a1", "Career"], ["a2", "Growth"]]),
    });
    expect(result.todaySeconds).toBe(2100); // 1500 + 600
    expect(result.weekSeconds).toBe(3000); // 1500 + 900 + 600
    expect(result.byTask[0]).toEqual({ id: "t1", label: "Write", seconds: 1500 });
    expect(result.byGoal).toEqual([{ id: "g1", label: "Launch", seconds: 2400 }]);
    expect(result.byLifeArea.find((b) => b.id === "a1")?.seconds).toBe(1500);
  });
});

describe("unattended overtime (audit R-17)", () => {
  it("has no overtime before the plan is reached, or without a plan", () => {
    expect(focusOvertimeSeconds(1400, 1500)).toBe(0);
    expect(focusOvertimeSeconds(1500, 1500)).toBe(0);
    expect(focusOvertimeSeconds(9999, null)).toBe(0);
    expect(focusOvertimeSeconds(9999, 0)).toBe(0);
  });

  it("counts seconds run past the plan", () => {
    expect(focusOvertimeSeconds(1560, 1500)).toBe(60);
    expect(focusOvertimeSeconds(1500 + FOCUS_AUTO_END_GRACE_SECONDS, 1500)).toBe(
      FOCUS_AUTO_END_GRACE_SECONDS,
    );
  });

  it("counts the grace period down from the moment the plan is reached", () => {
    expect(autoEndCountdownSeconds(1500, 1500)).toBe(FOCUS_AUTO_END_GRACE_SECONDS);
    expect(autoEndCountdownSeconds(1560, 1500)).toBe(FOCUS_AUTO_END_GRACE_SECONDS - 60);
    // Never negative: the countdown bottoms out rather than reading backwards.
    expect(autoEndCountdownSeconds(9999, 1500)).toBe(0);
  });

  it("does not apply auto-end to a session with no planned duration", () => {
    expect(autoEndCountdownSeconds(99999, null)).toBeNull();
    expect(shouldAutoEndFocusSession(99999, null)).toBe(false);
  });

  it("ends only once the whole grace period has passed", () => {
    const planned = 1500;
    expect(shouldAutoEndFocusSession(planned, planned)).toBe(false);
    expect(shouldAutoEndFocusSession(planned + FOCUS_AUTO_END_GRACE_SECONDS - 1, planned)).toBe(false);
    expect(shouldAutoEndFocusSession(planned + FOCUS_AUTO_END_GRACE_SECONDS, planned)).toBe(true);
  });

  it("credits only the planned time when a session auto-ends, never the overtime", () => {
    const planned = 1500;
    const elapsed = planned + FOCUS_AUTO_END_GRACE_SECONDS;
    expect(shouldAutoEndFocusSession(elapsed, planned)).toBe(true);
    expect(countedFocusSeconds(elapsed, planned)).toBe(planned);
  });

  it("extending pushes the plan out and restarts the countdown", () => {
    const elapsed = 1560; // one minute into overtime on a 25 minute plan
    expect(autoEndCountdownSeconds(elapsed, 1500)).toBe(FOCUS_AUTO_END_GRACE_SECONDS - 60);
    // "+5 min" extends the plan to 1800; the session is no longer overtime.
    expect(focusOvertimeSeconds(elapsed, 1800)).toBe(0);
    expect(autoEndCountdownSeconds(elapsed, 1800)).toBe(FOCUS_AUTO_END_GRACE_SECONDS);
    expect(shouldAutoEndFocusSession(elapsed, 1800)).toBe(false);
  });
});
