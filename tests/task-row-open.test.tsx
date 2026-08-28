import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DetailPanel } from "@/components/ui/detail-panel";
import { TaskChecklistItem } from "@/components/today/task-checklist-item";
import type { Task } from "@/db";

/**
 * Opening a task, and what opening it should NOT do.
 *
 * Two separate complaints with the same root: the app decided what the user
 * meant instead of doing the obvious thing. The row looked like one target but
 * only the name responded, and the panel that opened put a cursor in the name
 * field, so reading a task looked like being dropped into renaming it.
 */

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    userId: "user-a",
    title: "Finish Goha",
    description: null,
    status: "todo",
    priority: "high",
    scheduledFor: "2026-08-28",
    dueAt: null,
    goalId: null,
    lifeAreaId: null,
    parentTaskId: null,
    sortOrder: 0,
    completedAt: null,
    completionNote: null,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    ...overrides,
  } as Task;
}

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

describe("opening a task from a Today row", () => {
  it("opens when the row itself is clicked, not only the name", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskChecklistItem task={task()} onToggle={vi.fn()} onOpen={onOpen} />,
    );

    /*
     * The whole row is one control now. Before this, the button hugged the
     * text, so the empty space beside a short title, which is most of the row,
     * did nothing at all.
     */
    await user.click(screen.getByRole("button", { name: "Open Finish Goha" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens when the meta beside the title is clicked", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskChecklistItem
        task={task()}
        onToggle={vi.fn()}
        onOpen={onOpen}
        meta={<span>High</span>}
      />,
    );

    // The date and priority chip are the pixels people actually aim at when
    // they mean "show me this task". They must not be dead space.
    await user.click(screen.getByText("High"));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not open when the checkbox is ticked", async () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskChecklistItem task={task()} onToggle={onToggle} onOpen={onOpen} />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Complete Finish Goha" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not open when the row's remove control is used", async () => {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskChecklistItem
        task={task()}
        onToggle={vi.fn()}
        onOpen={onOpen}
        onRemove={onRemove}
        removeLabel="Unpin Finish Goha"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Unpin Finish Goha" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("stays inert when no open handler is supplied", () => {
    render(<TaskChecklistItem task={task()} onToggle={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Open Finish Goha" })).toBeNull();
    expect(screen.getByText("Finish Goha")).toBeInTheDocument();
  });
});

describe("what the detail panel focuses when it opens", () => {
  it("does not put the cursor in the first field", async () => {
    render(
      <DetailPanel open onClose={vi.fn()} title="Details for Finish Goha">
        <input aria-label="Task name" defaultValue="Finish Goha" />
        <button type="button">Mark done</button>
      </DetailPanel>,
    );

    const nameField = await screen.findByLabelText("Task name");

    /*
     * The regression this pins down: focusing the first focusable control put a
     * live caret and a focus ring on the task's name, so opening a task to look
     * at its subtasks read as "you are now renaming this". Editing the name is
     * a thing you choose by clicking the name.
     */
    expect(document.activeElement).not.toBe(nameField);
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Mark done" }),
    );
  });

  it("still moves focus into the dialog, so the keyboard stays trapped", async () => {
    render(
      <DetailPanel open onClose={vi.fn()} title="Details for Finish Goha">
        <input aria-label="Task name" defaultValue="Finish Goha" />
      </DetailPanel>,
    );

    const dialog = await screen.findByRole("dialog");

    // Focus belongs to the panel itself. Leaving it on whatever was focused
    // behind the panel would strand a screen reader outside the dialog and
    // break the Escape and Tab handling.
    expect(document.activeElement).toBe(dialog);
  });

  it("still closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DetailPanel open onClose={onClose} title="Details for Finish Goha">
        <input aria-label="Task name" defaultValue="Finish Goha" />
      </DetailPanel>,
    );

    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lets the name be edited once it is deliberately clicked", async () => {
    const user = userEvent.setup();
    render(
      <DetailPanel open onClose={vi.fn()} title="Details for Finish Goha">
        <input aria-label="Task name" defaultValue="Finish Goha" />
      </DetailPanel>,
    );

    const nameField = await screen.findByLabelText("Task name");
    await user.click(nameField);

    expect(document.activeElement).toBe(nameField);
  });
});
