import { describe, expect, it } from "vitest";

import {
  ALLOCATION_MIN_MINUTES,
  MINUTES_IN_DAY,
  autoFill,
  capacitySummary,
  categoryLoad,
  dayCapacity,
  formatDuration,
  isActionable,
  needsEstimate,
  scoreCandidate,
  STARTER_CATEGORIES,
  suggestionsFor,
  type Allocation,
  type PlannerCandidate,
} from "@/lib/planner";

/**
 * The Day Planner's arithmetic and its recommendation rules.
 *
 * The two invariants everything else hangs off: the totals must be right, and
 * GoHa must never invent a duration.
 */

const TODAY = "2026-08-31";

function allocation(over: Partial<Allocation> = {}): Allocation {
  return {
    id: "a1",
    kind: "planner",
    lifeAreaId: null,
    label: "Work",
    minutes: 8 * 60,
    sortOrder: 0,
    ...over,
  };
}

function task(over: Partial<PlannerCandidate> = {}): PlannerCandidate {
  return {
    id: "t1",
    title: "A to-do",
    status: "todo",
    priority: "medium",
    lifeAreaId: null,
    goalId: null,
    scheduledFor: null,
    dueDate: null,
    estimateMinutes: 60,
    sortOrder: 0,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...over,
  };
}

describe("day capacity", () => {
  it("reports the room left when a day is under 24 hours", () => {
    const capacity = dayCapacity([{ minutes: 8 * 60 }, { minutes: 8 * 60 }, { minutes: 4 * 60 }]);
    expect(capacity.allocatedMinutes).toBe(20 * 60);
    expect(capacity.remainingMinutes).toBe(4 * 60);
    expect(capacity.overMinutes).toBe(0);
    expect(capacity.status).toBe("under");
  });

  it("recognises exactly 24 hours", () => {
    const capacity = dayCapacity([{ minutes: 12 * 60 }, { minutes: 12 * 60 }]);
    expect(capacity.status).toBe("exact");
    expect(capacity.remainingMinutes).toBe(0);
    expect(capacity.overMinutes).toBe(0);
  });

  it("reports the overage as a positive number when a day is over 24 hours", () => {
    const capacity = dayCapacity([{ minutes: 20 * 60 }, { minutes: 5 * 60 }]);
    expect(capacity.status).toBe("over");
    expect(capacity.overMinutes).toBe(60);
    expect(capacity.remainingMinutes).toBe(0);
  });

  it("treats an empty day as fully unplanned rather than as an error", () => {
    expect(dayCapacity([])).toEqual({
      allocatedMinutes: 0,
      remainingMinutes: MINUTES_IN_DAY,
      overMinutes: 0,
      status: "under",
    });
  });

  it("ships a starter day that adds up to exactly 24 hours", () => {
    // A new user's first sight of the planner is this set. If it did not total
    // 24 the feature would open by contradicting its own headline.
    expect(dayCapacity(STARTER_CATEGORIES).status).toBe("exact");
  });

  it("states the overage without scolding", () => {
    const over = capacitySummary(dayCapacity([{ minutes: 25 * 60 }]));
    expect(over).toContain("Over by 1h");
    for (const word of ["failed", "wasted", "should", "too much"]) {
      expect(over.toLowerCase()).not.toContain(word);
    }
  });
});

describe("category load", () => {
  it("adds up what is planned and what is left", () => {
    const load = categoryLoad(allocation({ minutes: 240 }), [
      { plannedMinutes: 60 },
      { plannedMinutes: 90 },
    ]);
    expect(load.plannedMinutes).toBe(150);
    expect(load.freeMinutes).toBe(90);
    expect(load.overMinutes).toBe(0);
  });

  it("reports an overbooked category rather than clamping it", () => {
    const load = categoryLoad(allocation({ minutes: 60 }), [{ plannedMinutes: 120 }]);
    expect(load.overMinutes).toBe(60);
    expect(load.freeMinutes).toBe(0);
  });
});

describe("non-actionable categories", () => {
  it("does not offer work for sleep, commute or free time", () => {
    for (const label of ["Sleep", "commute", "Free time", "Meals"]) {
      expect(isActionable({ kind: "planner", label })).toBe(false);
      expect(
        suggestionsFor({
          allocation: allocation({ label }),
          candidates: [task()],
          acceptedTaskIds: new Set(),
          activeGoalIds: new Set(),
          goalLifeArea: new Map(),
          today: TODAY,
        }),
      ).toEqual([]);
    }
  });

  it("always treats a life-area category as actionable", () => {
    // Even one named "Rest": the user filed goals under it, so it holds work.
    expect(isActionable({ kind: "life_area", label: "Rest" })).toBe(true);
  });

  it("treats an invented category like Study as actionable", () => {
    expect(isActionable({ kind: "planner", label: "Study" })).toBe(true);
  });
});

describe("suggestions", () => {
  const base = {
    acceptedTaskIds: new Set<string>(),
    activeGoalIds: new Set<string>(),
    goalLifeArea: new Map<string, string | null>(),
    today: TODAY,
  };

  it("never offers completed or cancelled work", () => {
    const result = suggestionsFor({
      ...base,
      allocation: allocation(),
      candidates: [
        task({ id: "done", status: "completed" }),
        task({ id: "gone", status: "cancelled" }),
        task({ id: "open" }),
      ],
    });
    expect(result.map((s) => s.task.id)).toEqual(["open"]);
  });

  it("never offers work already accepted into the plan", () => {
    const result = suggestionsFor({
      ...base,
      allocation: allocation(),
      candidates: [task({ id: "t1" }), task({ id: "t2" })],
      acceptedTaskIds: new Set(["t1"]),
    });
    expect(result.map((s) => s.task.id)).toEqual(["t2"]);
  });

  it("matches a life-area category to that area's work", () => {
    const result = suggestionsFor({
      ...base,
      allocation: allocation({ kind: "life_area", lifeAreaId: "career", label: "Career" }),
      candidates: [
        task({ id: "career-task", lifeAreaId: "career" }),
        task({ id: "health-task", lifeAreaId: "health" }),
        task({ id: "loose-task" }),
      ],
    });
    expect(result.map((s) => s.task.id)).toEqual(["career-task"]);
  });

  it("lets a to-do inherit its goal's life area", () => {
    // A to-do filed only under a goal still belongs to that goal's area, which
    // is the normal case once the hierarchy is being used properly.
    const result = suggestionsFor({
      ...base,
      allocation: allocation({ kind: "life_area", lifeAreaId: "career", label: "Career" }),
      candidates: [task({ id: "via-goal", goalId: "g1" })],
      goalLifeArea: new Map([["g1", "career"]]),
    });
    expect(result.map((s) => s.task.id)).toEqual(["via-goal"]);
  });

  it("gives a planner-only category the work no life area claims", () => {
    const result = suggestionsFor({
      ...base,
      allocation: allocation({ label: "Study" }),
      candidates: [task({ id: "loose" }), task({ id: "claimed", lifeAreaId: "career" })],
    });
    expect(result.map((s) => s.task.id)).toEqual(["loose"]);
  });

  it("puts overdue work first, then work due soon, then priority", () => {
    const result = suggestionsFor({
      ...base,
      allocation: allocation({ label: "Study" }),
      candidates: [
        task({ id: "normal", priority: "low" }),
        task({ id: "urgent", priority: "urgent" }),
        task({ id: "due-today", dueDate: TODAY }),
        task({ id: "overdue", scheduledFor: "2026-08-20" }),
      ],
    });
    expect(result.map((s) => s.task.id)).toEqual(["overdue", "due-today", "urgent", "normal"]);
  });

  it("cannot let priority alone outrank something overdue", () => {
    const overdue = scoreCandidate(task({ priority: "low", scheduledFor: "2026-08-01" }), {
      today: TODAY,
      activeGoalIds: new Set(),
    });
    const urgent = scoreCandidate(task({ priority: "urgent" }), {
      today: TODAY,
      activeGoalIds: new Set(),
    });
    expect(overdue.score).toBeGreaterThan(urgent.score);
  });

  it("prefers work that moves an active goal, all else equal", () => {
    const aligned = scoreCandidate(task({ goalId: "g1" }), {
      today: TODAY,
      activeGoalIds: new Set(["g1"]),
    });
    const loose = scoreCandidate(task(), { today: TODAY, activeGoalIds: new Set() });
    expect(aligned.score).toBeGreaterThan(loose.score);
    expect(aligned.reasons).toContain("goal");
  });

  it("explains itself, so a suggestion is never unaccountable", () => {
    const [suggestion] = suggestionsFor({
      ...base,
      allocation: allocation({ label: "Study" }),
      candidates: [task({ scheduledFor: "2026-08-01", priority: "high" })],
    });
    expect(suggestion.reasons).toEqual(["overdue", "priority"]);
  });

  it("is deterministic: the same day and data give the same order", () => {
    const candidates = [task({ id: "a" }), task({ id: "b" }), task({ id: "c" })];
    const once = suggestionsFor({ ...base, allocation: allocation({ label: "Study" }), candidates });
    const twice = suggestionsFor({
      ...base,
      allocation: allocation({ label: "Study" }),
      candidates: [...candidates].reverse(),
    });
    expect(once.map((s) => s.task.id)).toEqual(twice.map((s) => s.task.id));
  });
});

describe("estimates are never invented", () => {
  it("reports a missing estimate as null rather than a default", () => {
    const [suggestion] = suggestionsFor({
      allocation: allocation({ label: "Study" }),
      candidates: [task({ estimateMinutes: null })],
      acceptedTaskIds: new Set(),
      activeGoalIds: new Set(),
      goalLifeArea: new Map(),
      today: TODAY,
    });
    expect(suggestion.minutes).toBeNull();
  });

  it("names the ones that still need sizing", () => {
    const suggestions = suggestionsFor({
      allocation: allocation({ label: "Study" }),
      candidates: [task({ id: "sized" }), task({ id: "unsized", estimateMinutes: null })],
      acceptedTaskIds: new Set(),
      activeGoalIds: new Set(),
      goalLifeArea: new Map(),
      today: TODAY,
    });
    expect(needsEstimate(suggestions).map((s) => s.task.id)).toEqual(["unsized"]);
  });

  it("never auto-fills with an unsized to-do", () => {
    const suggestions = suggestionsFor({
      allocation: allocation({ label: "Study" }),
      candidates: [task({ id: "unsized", estimateMinutes: null, priority: "urgent" })],
      acceptedTaskIds: new Set(),
      activeGoalIds: new Set(),
      goalLifeArea: new Map(),
      today: TODAY,
    });
    expect(autoFill({ suggestions, freeMinutes: 480 })).toEqual([]);
  });
});

describe("autoFill", () => {
  const suggestions = (...minutes: (number | null)[]) =>
    minutes.map((m, i) => ({
      task: task({ id: `t${i}`, estimateMinutes: m }),
      reasons: [],
      score: 100 - i,
      minutes: m,
    }));

  it("takes work in rank order while it fits", () => {
    const chosen = autoFill({ suggestions: suggestions(180, 120, 120), freeMinutes: 300 });
    expect(chosen.map((s) => s.minutes)).toEqual([180, 120]);
  });

  it("never exceeds the category's free time", () => {
    const chosen = autoFill({ suggestions: suggestions(240, 240), freeMinutes: 300 });
    expect(chosen.reduce((sum, s) => sum + (s.minutes ?? 0), 0)).toBeLessThanOrEqual(300);
  });

  it("stops once the leftover is too small to hold anything", () => {
    const chosen = autoFill({ suggestions: suggestions(60, 15, 15), freeMinutes: 70 });
    // 60 fits; 10 minutes left is under the floor, so it stops rather than
    // hunting for a 10-minute job that does not exist.
    expect(chosen).toHaveLength(1);
    expect(70 - 60).toBeLessThan(ALLOCATION_MIN_MINUTES);
  });

  it("adds nothing when there is no room", () => {
    expect(autoFill({ suggestions: suggestions(60), freeMinutes: 0 })).toEqual([]);
  });
});

describe("formatDuration", () => {
  it("talks in hours and minutes, never three-digit minutes", () => {
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(480)).toBe("8h");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(0)).toBe("0m");
  });
});
