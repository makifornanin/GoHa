import { describe, expect, it } from "vitest";

import {
  MINUTES_IN_DAY,
  capacitySummary,
  categoryLoad,
  dayActuals,
  dayCapacity,
  entryTitle,
  formatDuration,
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
    color: null,
    icon: null,
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

  it("puts a life-area category's own work first, without hiding the rest", () => {
    /*
     * This used to be a hard filter, and the filter is what made the planner
     * feel controlling: a category could only ever be offered work that already
     * matched it, so the list was often empty and the reason was invisible.
     * Ranking says the same thing out loud and leaves the choice with the user.
     */
    const result = suggestionsFor({
      ...base,
      allocation: allocation({ kind: "life_area", lifeAreaId: "career", label: "Career" }),
      candidates: [
        task({ id: "health-task", lifeAreaId: "health" }),
        task({ id: "career-task", lifeAreaId: "career" }),
        task({ id: "loose-task" }),
      ],
    });
    expect(result[0]?.task.id).toBe("career-task");
    expect(result.map((s) => s.task.id).sort()).toEqual([
      "career-task",
      "health-task",
      "loose-task",
    ]);
  });

  it("lets a to-do inherit its goal's life area when ranking", () => {
    // A to-do filed only under a goal still belongs to that goal's area, which
    // is the normal case once the hierarchy is being used properly. It should
    // therefore outrank an identical to-do that belongs nowhere.
    const result = suggestionsFor({
      ...base,
      allocation: allocation({ kind: "life_area", lifeAreaId: "career", label: "Career" }),
      candidates: [task({ id: "unrelated" }), task({ id: "via-goal", goalId: "g1" })],
      goalLifeArea: new Map([["g1", "career"]]),
    });
    expect(result[0]?.task.id).toBe("via-goal");
  });

  it("offers a category the user invented every open to-do, not a subset", () => {
    /*
     * "Study" is not a life area and never will be, but the work someone wants
     * to put in it is usually filed under one. Excluding claimed work left that
     * category permanently empty, which read as a bug rather than as a rule.
     */
    const result = suggestionsFor({
      ...base,
      allocation: allocation({ label: "Study" }),
      candidates: [task({ id: "loose" }), task({ id: "claimed", lifeAreaId: "career" })],
    });
    expect(result.map((s) => s.task.id).sort()).toEqual(["claimed", "loose"]);
  });

  it("never silently places anything: every result is a suggestion only", () => {
    // The whole contract of this module. It returns a ranked LIST; writing an
    // entry is a separate, user-initiated Server Action.
    const result = suggestionsFor({
      ...base,
      allocation: allocation(),
      candidates: [task({ id: "t1" }), task({ id: "t2" })],
    });
    expect(result).toHaveLength(2);
    expect(result.every((s) => "score" in s && "reasons" in s)).toBe(true);
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

  it("still offers an unsized to-do, because the user may size it", () => {
    /*
     * Suggesting it is fine; PLACING it is not. The estimate prompt is the
     * gate, and it is in the UI where the person who knows the answer is.
     */
    const suggestions = suggestionsFor({
      allocation: allocation({ label: "Study" }),
      candidates: [task({ id: "unsized", estimateMinutes: null, priority: "urgent" })],
      acceptedTaskIds: new Set(),
      activeGoalIds: new Set(),
      goalLifeArea: new Map(),
      today: TODAY,
    });
    expect(suggestions.map((s) => s.task.id)).toEqual(["unsized"]);
    expect(suggestions[0]?.minutes).toBeNull();
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

/**
 * Planned vs actual.
 *
 * The link from a focus session to a planner category is deliberately
 * indirect: a session names a to-do, and a to-do reaches a category only by
 * having been put there in this day's plan. Nothing is attributed by guesswork,
 * and time that fits nowhere is reported rather than absorbed.
 */
describe("day actuals", () => {
  const allocations = [{ id: "work" }, { id: "health" }];

  it("counts focus on a planned to-do towards that to-do's category", () => {
    const result = dayActuals({
      allocations,
      entries: [
        { allocationId: "work", taskId: "t1", plannedMinutes: 120, actualMinutes: null },
        { allocationId: "health", taskId: "t2", plannedMinutes: 60, actualMinutes: null },
      ],
      focus: [
        { taskId: "t1", seconds: 90 * 60, sessions: 2 },
        { taskId: "t2", seconds: 30 * 60, sessions: 1 },
      ],
    });
    expect(result.byAllocation.get("work")).toMatchObject({
      plannedMinutes: 120,
      actualMinutes: 90,
      sessions: 2,
    });
    expect(result.byAllocation.get("health")).toMatchObject({
      plannedMinutes: 60,
      actualMinutes: 30,
      sessions: 1,
    });
    expect(result.unassignedMinutes).toBe(0);
  });

  it("adds up several sessions on the same to-do", () => {
    const result = dayActuals({
      allocations,
      entries: [{ allocationId: "work", taskId: "t1", plannedMinutes: 120, actualMinutes: null }],
      focus: [{ taskId: "t1", seconds: 3 * 25 * 60, sessions: 3 }],
    });
    expect(result.byAllocation.get("work")?.actualMinutes).toBe(75);
  });

  it("reports focus with no to-do as unassigned rather than inventing a home", () => {
    // The rule the redesign is built on: GoHa does not place anything the user
    // did not place. An open focus session belongs to no category, and saying
    // so is more useful than quietly padding whichever bar looked plausible.
    const result = dayActuals({
      allocations,
      entries: [{ allocationId: "work", taskId: "t1", plannedMinutes: 120, actualMinutes: null }],
      focus: [{ taskId: null, seconds: 45 * 60, sessions: 1 }],
    });
    expect(result.unassignedMinutes).toBe(45);
    expect(result.unassignedSessions).toBe(1);
    expect(result.byAllocation.get("work")?.actualMinutes).toBe(0);
  });

  it("treats focus on an unplanned to-do as unassigned too", () => {
    const result = dayActuals({
      allocations,
      entries: [{ allocationId: "work", taskId: "t1", plannedMinutes: 120, actualMinutes: null }],
      focus: [{ taskId: "not-in-the-plan", seconds: 20 * 60, sessions: 1 }],
    });
    expect(result.unassignedMinutes).toBe(20);
    expect(result.byAllocation.get("work")?.actualMinutes).toBe(0);
  });

  it("never counts a freeform entry as focus, since nothing tracks it", () => {
    // A freeform line has no to-do, so no focus session can point at it. Its
    // planned minutes still count; its actual is honestly zero.
    const result = dayActuals({
      allocations,
      entries: [
        { allocationId: "work", taskId: null, plannedMinutes: 60, actualMinutes: null },
        { allocationId: "work", taskId: "t1", plannedMinutes: 60, actualMinutes: null },
      ],
      focus: [{ taskId: "t1", seconds: 60 * 60, sessions: 1 }],
    });
    expect(result.byAllocation.get("work")).toMatchObject({
      plannedMinutes: 120,
      focusMinutes: 60,
      manualMinutes: 0,
      actualMinutes: 60,
    });
  });

  it("gives every category a row, so a card never reads undefined", () => {
    const result = dayActuals({ allocations, entries: [], focus: [] });
    expect(result.byAllocation.get("work")).toMatchObject({
      plannedMinutes: 0,
      focusMinutes: 0,
      manualMinutes: 0,
      actualMinutes: 0,
      sessions: 0,
    });
    expect(result.byAllocation.get("health")).toBeDefined();
  });

  it("rounds once at the end, so short sessions do not lose a minute each", () => {
    // Two 90-second sessions are three minutes, not two.
    const result = dayActuals({
      allocations,
      entries: [{ allocationId: "work", taskId: "t1", plannedMinutes: 60, actualMinutes: null }],
      focus: [{ taskId: "t1", seconds: 180, sessions: 2 }],
    });
    expect(result.byAllocation.get("work")?.actualMinutes).toBe(3);
  });

  it("totals all recorded focus, assigned or not", () => {
    const result = dayActuals({
      allocations,
      entries: [{ allocationId: "work", taskId: "t1", plannedMinutes: 60, actualMinutes: null }],
      focus: [
        { taskId: "t1", seconds: 30 * 60, sessions: 1 },
        { taskId: null, seconds: 15 * 60, sessions: 1 },
      ],
    });
    expect(result.focusedMinutes).toBe(45);
    expect(result.trackedMinutes).toBe(45);
  });
});

/**
 * Entries: a linked to-do, or the user's own words.
 *
 * Reserved time is deliberately not a third kind of row. A category with hours
 * and no entries already means "these hours are spoken for", and an empty row
 * saying the same thing would be a line nobody can name or complete.
 */
describe("plan entries", () => {
  const titles = new Map([["t1", "Finish the resume"]]);

  it("names a linked entry from its to-do, so a rename follows the to-do", () => {
    expect(entryTitle({ taskId: "t1", label: null }, titles)).toBe("Finish the resume");
  });

  it("names a freeform entry from its own text", () => {
    expect(entryTitle({ taskId: null, label: "Client work" }, titles)).toBe("Client work");
  });

  it("does not fall back to the label when a linked to-do is gone", () => {
    // The row is a pointer at a to-do that no longer exists. Saying so beats
    // showing a name from a column that a linked row is not allowed to fill.
    expect(entryTitle({ taskId: "deleted", label: null }, titles)).toBe("To-do");
  });
});

/**
 * Manual actuals for freeform activities.
 *
 * The rule that makes the two sources safe to add together: a linked entry
 * takes its actual from focus sessions and a freeform entry takes it from a
 * number the user typed, and no row can ever be both. The database enforces
 * that (`day_plan_items_actual_manual_only`, `day_plan_items_task_or_label`),
 * so these check the arithmetic on top of it.
 */
describe("manual actuals", () => {
  const allocations = [{ id: "health" }, { id: "work" }];

  it("counts a logged freeform activity towards its category", () => {
    const result = dayActuals({
      allocations,
      entries: [
        { allocationId: "health", taskId: null, plannedMinutes: 90, actualMinutes: 60 },
        { allocationId: "health", taskId: null, plannedMinutes: 30, actualMinutes: 40 },
      ],
      focus: [],
    });
    expect(result.byAllocation.get("health")).toMatchObject({
      plannedMinutes: 120,
      focusMinutes: 0,
      manualMinutes: 100,
      actualMinutes: 100,
    });
  });

  it("adds focus and manual time in one category without double counting", () => {
    /*
     * The example from the brief: a category holding both a linked to-do that
     * was focused on and a freeform activity that was logged. 100 + 45 = 145,
     * and the focus minutes must appear exactly once.
     */
    const result = dayActuals({
      allocations,
      entries: [
        { allocationId: "work", taskId: "resume", plannedMinutes: 120, actualMinutes: null },
        { allocationId: "work", taskId: null, plannedMinutes: 60, actualMinutes: 45 },
      ],
      focus: [{ taskId: "resume", seconds: 100 * 60, sessions: 2 }],
    });
    expect(result.byAllocation.get("work")).toMatchObject({
      plannedMinutes: 180,
      focusMinutes: 100,
      manualMinutes: 45,
      actualMinutes: 145,
      sessions: 2,
    });
  });

  it("keeps Focused as focus alone while Tracked carries both", () => {
    // The day summary distinction: a measurement and an estimate must not be
    // presented as one number, so Tracked is the sum and Focused is not.
    const result = dayActuals({
      allocations,
      entries: [
        { allocationId: "work", taskId: "resume", plannedMinutes: 120, actualMinutes: null },
        { allocationId: "health", taskId: null, plannedMinutes: 60, actualMinutes: 45 },
      ],
      focus: [{ taskId: "resume", seconds: 100 * 60, sessions: 1 }],
    });
    expect(result.focusedMinutes).toBe(100);
    expect(result.manualMinutes).toBe(45);
    expect(result.trackedMinutes).toBe(145);
  });

  it("treats null as not recorded and zero as recorded", () => {
    // Different statements: "I have not said yet" and "I did none of it".
    const unrecorded = dayActuals({
      allocations,
      entries: [{ allocationId: "health", taskId: null, plannedMinutes: 60, actualMinutes: null }],
      focus: [],
    });
    expect(unrecorded.byAllocation.get("health")?.manualMinutes).toBe(0);
    expect(unrecorded.trackedMinutes).toBe(0);

    const zero = dayActuals({
      allocations,
      entries: [{ allocationId: "health", taskId: null, plannedMinutes: 60, actualMinutes: 0 }],
      focus: [],
    });
    expect(zero.byAllocation.get("health")?.manualMinutes).toBe(0);
    expect(zero.trackedMinutes).toBe(0);
  });

  it("ignores a manual value that somehow sits on a linked entry", () => {
    /*
     * Unstorable: the check constraint refuses it. Belt and braces, because the
     * one thing this must never do is count a to-do's time twice, once from its
     * focus sessions and once from a stale column.
     */
    const result = dayActuals({
      allocations,
      entries: [
        { allocationId: "work", taskId: "resume", plannedMinutes: 120, actualMinutes: 999 },
      ],
      focus: [{ taskId: "resume", seconds: 60 * 60, sessions: 1 }],
    });
    expect(result.byAllocation.get("work")?.manualMinutes).toBe(0);
    expect(result.byAllocation.get("work")?.actualMinutes).toBe(60);
    expect(result.trackedMinutes).toBe(60);
  });

  it("does not let manual time leak into another category", () => {
    const result = dayActuals({
      allocations,
      entries: [{ allocationId: "health", taskId: null, plannedMinutes: 60, actualMinutes: 45 }],
      focus: [],
    });
    expect(result.byAllocation.get("health")?.manualMinutes).toBe(45);
    expect(result.byAllocation.get("work")?.manualMinutes).toBe(0);
  });

  it("never counts manual time as a focus session", () => {
    const result = dayActuals({
      allocations,
      entries: [{ allocationId: "health", taskId: null, plannedMinutes: 60, actualMinutes: 45 }],
      focus: [],
    });
    expect(result.byAllocation.get("health")?.sessions).toBe(0);
    expect(result.focusedMinutes).toBe(0);
  });

  it("keeps unassigned focus out of both category totals", () => {
    const result = dayActuals({
      allocations,
      entries: [{ allocationId: "health", taskId: null, plannedMinutes: 60, actualMinutes: 30 }],
      focus: [{ taskId: null, seconds: 20 * 60, sessions: 1 }],
    });
    expect(result.unassignedMinutes).toBe(20);
    expect(result.byAllocation.get("health")?.actualMinutes).toBe(30);
    // Unassigned focus is still real time that was spent, so the day totals it.
    expect(result.focusedMinutes).toBe(20);
    expect(result.trackedMinutes).toBe(50);
  });
});

/**
 * Free time inside one category.
 *
 * Reported as a bug: "Meals reserved 1h, add a 30-minute entry, and it shows 0m
 * free". The arithmetic below was correct and stayed correct under test; what
 * actually produced that symptom was the composer committing its 1h default
 * when the name field was submitted with Enter, so the stored entry really was
 * 60 minutes. These pin the calculation so a future change cannot make the
 * reported behaviour real.
 *
 * The distinction that matters: free time is reserved MINUS PLANNED. Actual
 * tracked time is a different measurement and must never consume capacity.
 */
describe("remaining free time", () => {
  const meals = { id: "meals", minutes: 60 };

  it("60 reserved - 30 planned = 30 free", () => {
    const load = categoryLoad(meals, [{ plannedMinutes: 30 }]);
    expect(load.plannedMinutes).toBe(30);
    expect(load.freeMinutes).toBe(30);
    expect(load.overMinutes).toBe(0);
  });

  it("60 reserved - 60 planned = 0 free", () => {
    const load = categoryLoad(meals, [{ plannedMinutes: 60 }]);
    expect(load.freeMinutes).toBe(0);
    expect(load.overMinutes).toBe(0);
  });

  it("60 reserved - 90 planned = 0 free, and says how far over", () => {
    // Clamped at zero rather than going negative, and the overage is reported
    // separately so the UI can say "30m over" instead of "-30m free".
    const load = categoryLoad(meals, [{ plannedMinutes: 90 }]);
    expect(load.freeMinutes).toBe(0);
    expect(load.overMinutes).toBe(30);
  });

  it("120 reserved - entries totalling 75 = 45 free", () => {
    const load = categoryLoad({ id: "work", minutes: 120 }, [
      { plannedMinutes: 30 },
      { plannedMinutes: 25 },
      { plannedMinutes: 20 },
    ]);
    expect(load.plannedMinutes).toBe(75);
    expect(load.freeMinutes).toBe(45);
  });

  it("an empty category has all of its time free", () => {
    expect(categoryLoad(meals, []).freeMinutes).toBe(60);
  });

  it("actual tracked time never consumes planned capacity", () => {
    /*
     * The explicit distinction from the report: 60 reserved, 30 planned, 20
     * actually spent still leaves 30 free, because 30 of the 60 were ALLOCATED.
     * `categoryLoad` reads only plannedMinutes; actuals are computed separately
     * by `dayActuals` and never feed back into capacity.
     */
    const load = categoryLoad(meals, [{ plannedMinutes: 30 }]);
    const actuals = dayActuals({
      allocations: [meals],
      entries: [{ allocationId: "meals", taskId: null, plannedMinutes: 30, actualMinutes: 20 }],
      focus: [],
    });
    expect(load.freeMinutes).toBe(30);
    expect(actuals.byAllocation.get("meals")?.actualMinutes).toBe(20);
    // Recomputing the load with the same entries is unchanged by the actual.
    expect(categoryLoad(meals, [{ plannedMinutes: 30 }]).freeMinutes).toBe(30);
  });

  it("ignores a negative planned duration rather than crediting time back", () => {
    // Not reachable through the UI, but a stored oddity must not invent capacity.
    expect(categoryLoad(meals, [{ plannedMinutes: -30 }]).freeMinutes).toBe(60);
  });
});
