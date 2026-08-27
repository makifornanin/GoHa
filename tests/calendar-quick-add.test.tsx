import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskCalendar } from "@/components/tasks/task-calendar";
import type { Task } from "@/db";

/**
 * Planning straight into a day.
 *
 * Two things have to stay true. The date that reaches the form must be the
 * exact day the user pointed at, with no round trip through a `Date` that could
 * land it a day off. And a click on a task must edit that task, never quietly
 * create a second one on the same day, which is the failure mode of stretching
 * a create target across a cell.
 */

afterEach(cleanup);

const TZ = "Asia/Manila";
const TODAY = "2026-08-27";

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
    scheduledFor: TODAY,
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

function setup(tasks: Task[] = []) {
  const onCreateOn = vi.fn();
  const onOpenTask = vi.fn();
  render(
    <TaskCalendar
      tasks={tasks}
      today={TODAY}
      timeZone={TZ}
      onOpenTask={onOpenTask}
      onCreateOn={onCreateOn}
    />,
  );
  return { onCreateOn, onOpenTask };
}

describe("quick add from a day", () => {
  it("passes the clicked day through exactly", async () => {
    const { onCreateOn } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Add a task on 2026-08-15" }));
    // The literal string, not a Date: anything that parsed and reformatted here
    // could land the task on the 14th or the 16th depending on the zone.
    expect(onCreateOn).toHaveBeenCalledWith("2026-08-15");
  });

  it("offers every day in the grid as a target, not just a hover affordance", () => {
    setup();
    // Six weeks of days, each individually addressable. The old `+` only
    // appeared on hover, so on a touch screen there was no way to reach it.
    expect(screen.getByRole("button", { name: `Add a task on ${TODAY}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a task on 2026-08-01" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a task on 2026-08-31" })).toBeTruthy();
  });

  it("is reachable by keyboard", async () => {
    const { onCreateOn } = setup();
    const cell = screen.getByRole("button", { name: "Add a task on 2026-08-15" });
    cell.focus();
    expect(document.activeElement).toBe(cell);
    await userEvent.keyboard("{Enter}");
    expect(onCreateOn).toHaveBeenCalledWith("2026-08-15");
  });

  it("carries the day across a month change", async () => {
    const { onCreateOn } = setup();
    await userEvent.click(screen.getByRole("button", { name: /next month/i }));
    await userEvent.click(screen.getByRole("button", { name: "Add a task on 2026-09-10" }));
    expect(onCreateOn).toHaveBeenCalledWith("2026-09-10");
  });
});

describe("existing tasks", () => {
  it("opens the task instead of creating another one", async () => {
    const task = makeTask();
    const { onOpenTask, onCreateOn } = setup([task]);
    await userEvent.click(screen.getByRole("button", { name: /finish portfolio/i }));

    expect(onOpenTask).toHaveBeenCalledWith(task);
    // The whole point of layering the chips above the cell target.
    expect(onCreateOn).not.toHaveBeenCalled();
  });

  it("still allows adding to a day that already has work on it", async () => {
    const { onCreateOn } = setup([makeTask()]);
    await userEvent.click(screen.getByRole("button", { name: `Add a task on ${TODAY}` }));
    expect(onCreateOn).toHaveBeenCalledWith(TODAY);
  });

  it("keeps the overflow control clickable above the cell target", async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      makeTask({ id: `t${i}`, title: `Task ${i}` }),
    );
    const { onCreateOn } = setup(many);
    const more = screen.getByRole("button", { name: /more$/i });
    await userEvent.click(more);
    // Expanding a busy day must not be read as "plan something new here".
    expect(onCreateOn).not.toHaveBeenCalled();
  });
});
