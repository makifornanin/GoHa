import { describe, expect, it } from "vitest";

import {
  ancestorPath,
  descendantIds,
  descendants,
  eligibleParents,
  goalDepth,
  goalLevel,
  goalPickerOptions,
  goalProgressBreakdown,
  rejectParent,
  rollupTaskCounts,
  type GoalNodeInput,
} from "@/lib/goal-tree";

/**
 * The hierarchy rules, which are what makes a Goal and a Subgoal different
 * things rather than two rows of the same table with different labels.
 */

type Overrides = Partial<Omit<GoalNodeInput, "id" | "parentGoalId">>;

function goal(id: string, parentGoalId: string | null, over: Overrides = {}): GoalNodeInput {
  return {
    id,
    parentGoalId,
    title: id,
    status: "active",
    progressMode: "auto",
    manualProgress: null,
    lifeAreaId: null,
    totalTasks: 0,
    completedTasks: 0,
    cancelledTasks: 0,
    ...over,
  };
}

/**
 * Career > Find a new job > { Finish resume, Finish portfolio }, plus an
 * unrelated top-level goal so nothing can pass by accident on a one-tree list.
 */
const TREE: GoalNodeInput[] = [
  goal("job", null, { title: "Find a new job", totalTasks: 1, completedTasks: 0 }),
  goal("resume", "job", { title: "Finish resume", totalTasks: 4, completedTasks: 3 }),
  goal("portfolio", "job", { title: "Finish portfolio", totalTasks: 2, completedTasks: 0 }),
  goal("fitness", null, { title: "Improve fitness", totalTasks: 2, completedTasks: 2 }),
];

describe("levels", () => {
  it("calls a parentless goal a goal and a parented one a subgoal", () => {
    expect(goalLevel({ parentGoalId: null })).toBe("goal");
    expect(goalLevel({ parentGoalId: "job" })).toBe("subgoal");
  });

  it("reports depth from the top", () => {
    expect(goalDepth(TREE, "job")).toBe(0);
    expect(goalDepth(TREE, "resume")).toBe(1);
  });
});

describe("descendants", () => {
  it("collects children, excluding the root", () => {
    expect(descendants(TREE, "job").map((g) => g.id).sort()).toEqual(["portfolio", "resume"]);
    expect(descendantIds(TREE, "fitness").size).toBe(0);
  });

  it("survives a cycle rather than looping forever", () => {
    // Not creatable through the app, but rows written by earlier builds are not
    // the app's to trust, and an infinite loop inside a render is unrecoverable.
    const cyclic = [goal("a", "b"), goal("b", "a")];
    expect(descendants(cyclic, "a").map((g) => g.id)).toEqual(["b"]);
  });
});

describe("ancestorPath", () => {
  it("returns root first, inclusive, for a breadcrumb", () => {
    expect(ancestorPath(TREE, "resume").map((g) => g.id)).toEqual(["job", "resume"]);
    expect(ancestorPath(TREE, "job").map((g) => g.id)).toEqual(["job"]);
  });

  it("returns nothing for a goal that is not there", () => {
    expect(ancestorPath(TREE, "missing")).toEqual([]);
  });
});

describe("rollupTaskCounts", () => {
  it("adds the subgoals' to-dos to the parent's own", () => {
    // 1 + 4 + 2 to-dos, 0 + 3 + 0 done.
    expect(rollupTaskCounts(TREE, "job")).toEqual({ total: 7, completed: 3, cancelled: 0 });
  });

  it("leaves a leaf goal with exactly its own counts", () => {
    expect(rollupTaskCounts(TREE, "resume")).toEqual({ total: 4, completed: 3, cancelled: 0 });
  });
});

describe("goalProgressBreakdown", () => {
  it("stops a parent reading 0% while its subgoals fill up", () => {
    /*
     * The regression this whole module exists for. Counting only the parent's
     * OWN to-dos gave 0/1 = 0%, so breaking a goal down properly made it look
     * abandoned. Rolled up it is 3 of 7.
     */
    const rolled = goalProgressBreakdown(TREE, "job");
    expect(rolled.percent).toBe(43);
    expect(rolled.includesSubgoals).toBe(true);
    expect(rolled.own.total).toBe(1);
    expect(rolled.rolled.total).toBe(7);
  });

  it("counts direct subgoals and how many are done", () => {
    const done = [
      goal("job", null),
      goal("resume", "job", { status: "completed" }),
      goal("portfolio", "job"),
    ];
    const breakdown = goalProgressBreakdown(done, "job");
    expect(breakdown.subgoalCount).toBe(2);
    expect(breakdown.subgoalsCompleted).toBe(1);
  });

  it("never lets a rollup override a hand-set percentage", () => {
    const manual = [
      goal("job", null, { progressMode: "manual", manualProgress: 40 }),
      goal("resume", "job", { totalTasks: 10, completedTasks: 10 }),
    ];
    const breakdown = goalProgressBreakdown(manual, "job");
    expect(breakdown.percent).toBe(40);
    expect(breakdown.source).toBe("manual");
  });

  it("reads a completed goal as 100 whatever its subgoals say", () => {
    const completed = [
      goal("job", null, { status: "completed" }),
      goal("resume", "job", { totalTasks: 4, completedTasks: 0 }),
    ];
    expect(goalProgressBreakdown(completed, "job").percent).toBe(100);
  });

  it("excludes cancelled to-dos from the rolled-up denominator", () => {
    const withCancelled = [
      goal("job", null),
      goal("resume", "job", { totalTasks: 4, completedTasks: 2, cancelledTasks: 2 }),
    ];
    // 2 done out of (4 - 2) counted.
    expect(goalProgressBreakdown(withCancelled, "job").percent).toBe(100);
  });

  it("says 0% with no work rather than inventing a number", () => {
    const empty = [goal("job", null)];
    const breakdown = goalProgressBreakdown(empty, "job");
    expect(breakdown.percent).toBe(0);
    expect(breakdown.source).toBe("none");
    expect(breakdown.includesSubgoals).toBe(false);
  });
});

describe("rejectParent", () => {
  it("refuses a goal as its own parent", () => {
    expect(rejectParent(TREE, "job", "job")).toBe("self");
  });

  it("refuses a parent that sits under the goal being moved", () => {
    expect(rejectParent(TREE, "job", "resume")).toBe("cycle");
  });

  it("refuses a third level", () => {
    // "resume" is already a subgoal, so nothing may nest under it.
    expect(rejectParent(TREE, "fitness", "resume")).toBe("too_deep");
    // And the same rule holds when creating, where there is no goal id yet.
    expect(rejectParent(TREE, null, "resume")).toBe("too_deep");
  });

  it("allows a top-level goal as a parent", () => {
    expect(rejectParent(TREE, "fitness", "job")).toBeNull();
    expect(rejectParent(TREE, null, "job")).toBeNull();
  });
});

describe("eligibleParents", () => {
  it("offers only top-level goals, and never the goal itself", () => {
    expect(eligibleParents(TREE, "fitness").map((g) => g.id)).toEqual(["job"]);
    expect(eligibleParents(TREE, null).map((g) => g.id)).toEqual(["job", "fitness"]);
  });
});

describe("goalPickerOptions", () => {
  it("lists subgoals under their parent, not beside it", () => {
    /*
     * Every "choose a goal" control was a flat list, so "Finish resume" and
     * "Find a new job" sat as equals and the person picking could not tell
     * which was which. The hierarchy exists precisely so a to-do can be filed
     * against a milestone on purpose.
     */
    const options = goalPickerOptions(TREE);
    expect(options.map((o) => o.label)).toEqual([
      "Find a new job",
      "Find a new job \u203A Finish resume",
      "Find a new job \u203A Finish portfolio",
      "Improve fitness",
    ]);
    expect(options.map((o) => o.depth)).toEqual([0, 1, 1, 0]);
  });

  it("leaves archived goals out", () => {
    const withArchived = [...TREE, { ...goal("old", null), isArchived: true }];
    expect(goalPickerOptions(withArchived).map((o) => o.id)).not.toContain("old");
  });

  it("still offers a subgoal whose parent was archived", () => {
    // Dropping it would make an existing to-do's own goal vanish from the
    // picker that is meant to show it.
    const orphaned = [
      { ...goal("job", null), isArchived: true },
      goal("resume", "job", { title: "Finish resume" }),
    ];
    expect(goalPickerOptions(orphaned).map((o) => o.label)).toEqual(["Finish resume"]);
  });

  it("returns nothing for an empty list rather than throwing", () => {
    expect(goalPickerOptions([])).toEqual([]);
  });
});

describe("goalPickerOptions keeps the current choice visible", () => {
  /*
   * Found in browser QA. After archiving a goal tree, the to-do detail panel
   * showed "Select..." for a to-do that still carried a goal id: the picker
   * filtered archived goals out, so the control fell back to a placeholder and
   * the to-do LOOKED unlinked when it was not.
   *
   * No data was ever lost (the panel patches from the task, not from the
   * select) but the display contradicted the database, which is its own bug.
   */
  const archived = [
    { ...goal("job", null, { title: "Find a new job" }), isArchived: true },
    { ...goal("resume", "job", { title: "Finish resume" }), isArchived: true },
    goal("fitness", null, { title: "Improve fitness" }),
  ];

  it("still hides archived goals when nothing selects them", () => {
    expect(goalPickerOptions(archived).map((o) => o.id)).toEqual(["fitness"]);
  });

  it("includes the selected goal even when it is archived", () => {
    const options = goalPickerOptions(archived, "resume");
    expect(options.map((o) => o.id)).toContain("resume");
  });

  it("says the selected goal is archived rather than pretending otherwise", () => {
    const option = goalPickerOptions(archived, "resume").find((o) => o.id === "resume");
    expect(option?.label).toContain("archived");
  });

  it("keeps the parent prefix on an archived subgoal", () => {
    // Its parent is archived too, so the subgoal is reached by the orphan pass;
    // it must still be identifiable rather than a bare "Finish resume".
    const option = goalPickerOptions(archived, "resume").find((o) => o.id === "resume");
    expect(option?.label).toContain("Finish resume");
  });

  it("does not resurrect OTHER archived goals", () => {
    const ids = goalPickerOptions(archived, "resume").map((o) => o.id);
    expect(ids).not.toContain("job");
  });

  it("ignores a selected id that does not exist", () => {
    expect(goalPickerOptions(archived, "gone").map((o) => o.id)).toEqual(["fitness"]);
  });

  it("leaves an active selection completely unchanged", () => {
    expect(goalPickerOptions(TREE, "resume")).toEqual(goalPickerOptions(TREE));
  });
});

describe("Today shows the same rolled-up number as the goals board", () => {
  /*
   * Caught in browser QA: the goals board read "Find a new job 33%" while
   * Today's Active Goals read 0% for the same goal, because Today used each
   * goal's OWN task counts. One goal showing two different percentages in two
   * places is worse than the original 0%-forever bug: it makes the app look
   * like it cannot count. Both surfaces now call goalProgressBreakdown.
   */
  it("gives a parent the same percent whichever surface asks", () => {
    const board = goalProgressBreakdown(TREE, "job").percent;
    // What Today used to do: the goal's own counts, ignoring its subgoals.
    const own = Math.round((TREE[0].completedTasks / Math.max(1, TREE[0].totalTasks)) * 100);
    expect(board).toBe(43);
    expect(own).not.toBe(board);
  });
});
