/**
 * What "+ Add" offers, and where each choice leads.
 *
 * The rule the old shell broke: a single global "New Task" button meant the one
 * thing you could start from anywhere was the LAST link in the chain. Someone
 * who had just read a goal and wanted to break it down had to leave, find the
 * goals board, open a form and re-select the goal they had been looking at.
 *
 * So the menu is a function of WHERE you are, and every entry carries the
 * relationships that context already established. Two rules follow from that
 * and are enforced here rather than at each call site:
 *
 *   1. Never offer something impossible. A subgoal cannot hold a subgoal, so
 *      that entry does not exist inside one; there is nothing to explain and
 *      nothing to disable.
 *   2. Order by what the place is FOR. Inside a goal, breaking it down comes
 *      first. On the dashboard, capturing a to-do does.
 *
 * Pure and free of React so the ordering and the prefilled links are testable
 * as data, which is what the acceptance tests actually care about.
 */

/** Where the menu was opened from. */
export type AddContext = "root" | "life-area" | "goal" | "subgoal" | "todo";

/** What can be created. Matches the canonical vocabulary in docs/TERMINOLOGY.md. */
export type AddKind = "goal" | "subgoal" | "todo" | "subtask" | "habit" | "brain-dump";

/** The relationships the current place already knows. */
export type AddPrefill = {
  goalId?: string | null;
  lifeAreaId?: string | null;
  parentGoalId?: string | null;
  parentTaskId?: string | null;
};

export type AddOption = {
  kind: AddKind;
  label: string;
  /** One line under the label, for the places that have room for it. */
  hint: string;
};

const OPTION: Record<AddKind, AddOption> = {
  goal: { kind: "goal", label: "Goal", hint: "An outcome worth working toward" },
  subgoal: { kind: "subgoal", label: "Subgoal", hint: "A milestone on the way there" },
  todo: { kind: "todo", label: "To-do", hint: "Something you can actually do" },
  subtask: { kind: "subtask", label: "Subtask", hint: "A step inside this to-do" },
  habit: { kind: "habit", label: "Habit", hint: "Something you repeat" },
  "brain-dump": { kind: "brain-dump", label: "Brain dump", hint: "Get it out of your head" },
};

/**
 * The menu for a context, in the order it should be read.
 *
 * `root` is everywhere with no parent in view: the sidebar, the mobile tab bar,
 * Today. A to-do leads because that is what people reach for most, and a goal
 * sits second so the chain is still visible from the place people start.
 */
const MENUS: Record<AddContext, AddKind[]> = {
  root: ["todo", "goal", "habit", "brain-dump"],
  "life-area": ["goal", "todo", "habit"],
  goal: ["subgoal", "todo", "habit"],
  subgoal: ["todo"],
  todo: ["subtask"],
};

export function addOptionsFor(context: AddContext): AddOption[] {
  return MENUS[context].map((kind) => OPTION[kind]);
}

/**
 * Where a choice goes, with the parents already filled in.
 *
 * `?new=1` is the existing convention for "open this screen's create form", and
 * it is reused rather than replaced: every list page already knows how to spend
 * that signal once and clear it from the URL.
 *
 * Ownership of every id here is re-checked in the Server Action that receives
 * the form. A URL is user input, so what these produce is a convenience, never
 * an authorization.
 */
export function addHrefFor(kind: AddKind, prefill: AddPrefill = {}): string {
  const params = new URLSearchParams({ new: "1" });
  const add = (key: string, value: string | null | undefined) => {
    if (value) params.set(key, value);
  };

  switch (kind) {
    case "goal":
      add("lifeAreaId", prefill.lifeAreaId);
      return `/goals?${params}`;
    case "subgoal":
      add("parentGoalId", prefill.parentGoalId ?? prefill.goalId);
      add("lifeAreaId", prefill.lifeAreaId);
      return `/goals?${params}`;
    case "todo":
      add("goalId", prefill.goalId);
      add("lifeAreaId", prefill.lifeAreaId);
      return `/tasks?${params}`;
    case "subtask":
      add("parentTaskId", prefill.parentTaskId);
      return `/tasks?${params}`;
    case "habit":
      add("goalId", prefill.goalId);
      add("lifeAreaId", prefill.lifeAreaId);
      return `/habits?${params}`;
    case "brain-dump":
      return `/brain-dump?${params}`;
  }
}
