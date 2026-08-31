import { describe, expect, it } from "vitest";

import { addHrefFor, addOptionsFor, type AddContext } from "@/lib/add-menu";

/**
 * The universal Add system: what each place offers, and whether the parents the
 * place already knows travel with the choice.
 */

const kinds = (context: AddContext) => addOptionsFor(context).map((o) => o.kind);

describe("what each context offers", () => {
  it("offers the whole chain from the shell, to-do first", () => {
    expect(kinds("root")).toEqual(["todo", "goal", "habit", "brain-dump"]);
  });

  it("leads with breaking the goal down when you are inside one", () => {
    expect(kinds("goal")).toEqual(["subgoal", "todo", "habit"]);
  });

  it("offers only a to-do inside a subgoal", () => {
    // A third goal level does not exist, so it is not offered and not disabled:
    // there is nothing to explain if it was never on the menu.
    expect(kinds("subgoal")).toEqual(["todo"]);
  });

  it("offers only a subtask inside a to-do", () => {
    expect(kinds("todo")).toEqual(["subtask"]);
  });

  it("never offers a subgoal without a goal in view", () => {
    for (const context of ["root", "life-area", "todo"] as const) {
      expect(kinds(context)).not.toContain("subgoal");
    }
  });

  it("never offers a subtask without a to-do in view", () => {
    for (const context of ["root", "life-area", "goal", "subgoal"] as const) {
      expect(kinds(context)).not.toContain("subtask");
    }
  });

  it("gives every option a label and a hint", () => {
    for (const context of ["root", "life-area", "goal", "subgoal", "todo"] as const) {
      for (const option of addOptionsFor(context)) {
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.hint.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("prefilled destinations", () => {
  it("always asks the destination to open its create form", () => {
    for (const kind of ["goal", "subgoal", "todo", "subtask", "habit", "brain-dump"] as const) {
      expect(new URL(addHrefFor(kind), "https://goha.test").searchParams.get("new")).toBe("1");
    }
  });

  it("carries the goal and life area onto a new to-do", () => {
    const url = new URL(
      addHrefFor("todo", { goalId: "g1", lifeAreaId: "a1" }),
      "https://goha.test",
    );
    expect(url.pathname).toBe("/tasks");
    expect(url.searchParams.get("goalId")).toBe("g1");
    expect(url.searchParams.get("lifeAreaId")).toBe("a1");
  });

  it("treats the goal you are standing in as the new subgoal's parent", () => {
    // The whole point of the contextual menu: "+ Add > Subgoal" from inside a
    // goal must not ask which goal.
    const url = new URL(addHrefFor("subgoal", { goalId: "g1" }), "https://goha.test");
    expect(url.pathname).toBe("/goals");
    expect(url.searchParams.get("parentGoalId")).toBe("g1");
  });

  it("prefers an explicit parentGoalId over the goal in view", () => {
    const url = new URL(
      addHrefFor("subgoal", { goalId: "g1", parentGoalId: "g2" }),
      "https://goha.test",
    );
    expect(url.searchParams.get("parentGoalId")).toBe("g2");
  });

  it("carries the parent to-do onto a new subtask", () => {
    const url = new URL(addHrefFor("subtask", { parentTaskId: "t1" }), "https://goha.test");
    expect(url.pathname).toBe("/tasks");
    expect(url.searchParams.get("parentTaskId")).toBe("t1");
  });

  it("omits an empty relationship rather than sending a blank one", () => {
    const url = new URL(
      addHrefFor("todo", { goalId: null, lifeAreaId: undefined }),
      "https://goha.test",
    );
    expect(url.searchParams.has("goalId")).toBe(false);
    expect(url.searchParams.has("lifeAreaId")).toBe(false);
  });

  it("sends each kind to the screen that owns it", () => {
    const path = (href: string) => new URL(href, "https://goha.test").pathname;
    expect(path(addHrefFor("goal"))).toBe("/goals");
    expect(path(addHrefFor("todo"))).toBe("/tasks");
    expect(path(addHrefFor("habit"))).toBe("/habits");
    expect(path(addHrefFor("brain-dump"))).toBe("/brain-dump");
  });
});
