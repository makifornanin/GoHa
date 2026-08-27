import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import type { Goal, LifeArea, Task } from "@/db";

/**
 * Adding a step to a task.
 *
 * The composer used to sit permanently open at the foot of the checklist with
 * its own Add button, which read as an unfinished row and competed with the
 * real steps above it. It is now revealed by "+ Add subtask": Enter saves and
 * stays open so several steps can be typed in a row, Escape cancels.
 *
 * The Escape case matters most. This lives inside a dismissible panel, so a key
 * that travelled on would close the whole task rather than the little input,
 * and the half-typed step would go with it.
 */

// jsdom has no matchMedia, and DetailPanel asks it whether to present as a
// bottom sheet or a side panel. Answering "not mobile" renders the side panel.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
});

afterEach(cleanup);

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    userId: "u1",
    goalId: null,
    lifeAreaId: null,
    parentTaskId: null,
    title: "Finish portfolio",
    description: null,
    status: "todo",
    priority: "medium",
    scheduledFor: null,
    scheduledTime: null,
    dueAt: null,
    completedAt: null,
    completionNote: null,
    estimateMinutes: null,
    sortOrder: 0,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...over,
  } as Task;
}

function setup(subtasks: Task[] = []) {
  const onAddSubtask = vi.fn(async () => ({ ok: true }));
  const onToggleSubtask = vi.fn();
  const handlers = {
    onAddSubtask,
    onToggleSubtask,
    onDeleteSubtask: vi.fn(),
    onUpdate: vi.fn(async () => ({ ok: true })),
    onToggleComplete: vi.fn(),
    onEditNote: vi.fn(),
  };
  const onClose = vi.fn();
  render(
    <TaskDetailPanel
      task={makeTask()}
      subtasks={subtasks}
      goals={[] as Goal[]}
      lifeAreas={[] as LifeArea[]}
      onClose={onClose}
      handlers={handlers as never}
    />,
  );
  return { onAddSubtask, onToggleSubtask, onClose };
}

const addTrigger = () => screen.getByRole("button", { name: /add subtask/i });
const composer = () => screen.queryByRole("textbox", { name: /add a subtask/i });

describe("revealing the composer", () => {
  it("stays out of the way until asked for", () => {
    setup();
    expect(addTrigger()).toBeTruthy();
    // Nothing but the checklist until you want to extend it.
    expect(composer()).toBeNull();
  });

  it("opens and focuses the input in one click", async () => {
    setup();
    await userEvent.click(addTrigger());
    const input = composer();
    expect(input).not.toBeNull();
    // One click, then type: no second click to reach the field.
    expect(document.activeElement).toBe(input);
  });
});

describe("saving", () => {
  it("saves on Enter", async () => {
    const { onAddSubtask } = setup();
    await userEvent.click(addTrigger());
    await userEvent.keyboard("Draft the case study{Enter}");
    expect(onAddSubtask).toHaveBeenCalledWith("t1", "Draft the case study");
  });

  it("clears but stays open, so steps can be typed in a row", async () => {
    const { onAddSubtask } = setup();
    await userEvent.click(addTrigger());
    await userEvent.keyboard("First step{Enter}");
    // Re-opening the composer between steps would put a click between each one.
    expect(composer()).not.toBeNull();
    expect((composer() as HTMLInputElement).value).toBe("");

    await userEvent.keyboard("Second step{Enter}");
    expect(onAddSubtask).toHaveBeenCalledTimes(2);
    expect(onAddSubtask).toHaveBeenLastCalledWith("t1", "Second step");
  });

  it("ignores an empty or whitespace-only step", async () => {
    const { onAddSubtask } = setup();
    await userEvent.click(addTrigger());
    await userEvent.keyboard("   {Enter}");
    expect(onAddSubtask).not.toHaveBeenCalled();
  });
});

describe("cancelling", () => {
  it("closes the composer on Escape without saving", async () => {
    const { onAddSubtask } = setup();
    await userEvent.click(addTrigger());
    await userEvent.keyboard("half a thought{Escape}");

    expect(composer()).toBeNull();
    expect(onAddSubtask).not.toHaveBeenCalled();
  });

  it("does not close the whole panel on Escape", async () => {
    const { onClose } = setup();
    await userEvent.click(addTrigger());
    await userEvent.keyboard("{Escape}");
    // Cancelling a step is not cancelling the task.
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("existing steps", () => {
  it("still lists and can complete them", async () => {
    const step = makeTask({ id: "s1", title: "Pick three projects", parentTaskId: "t1" });
    const { onToggleSubtask } = setup([step]);

    expect(screen.getByText("Pick three projects")).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: /complete pick three projects/i }));
    expect(onToggleSubtask).toHaveBeenCalledWith(step);
  });

  it("shows the checklist without forcing the composer open", () => {
    setup([makeTask({ id: "s1", title: "Pick three projects", parentTaskId: "t1" })]);
    expect(composer()).toBeNull();
    expect(addTrigger()).toBeTruthy();
  });
});

describe("Escape reaches only the nearest thing that wants it", () => {
  it("marks the key handled so an outer dismissible container leaves it alone", async () => {
    /*
     * Found in a real browser, not here.
     *
     * DetailPanel listens for Escape on `document`, so a React
     * `stopPropagation` inside the panel never reaches it: the composer
     * cancelled itself AND the panel closed the whole task on one keypress,
     * taking the half-typed step with it. The panel now ignores an Escape whose
     * `defaultPrevented` is already set, which is the signal that travels with
     * the event.
     *
     * jsdom cannot reproduce the document-level race, so this pins the half the
     * composer is responsible for: calling preventDefault when it handles the
     * key.
     */
    setup();
    await userEvent.click(addTrigger());
    const input = composer() as HTMLInputElement;

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("still closes the panel when nothing nearer has handled the key", async () => {
    // The other half of the fix: suppressing a HANDLED Escape must not make the
    // panel undismissable. With the composer shut, Escape still closes it.
    const { onClose } = setup();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
