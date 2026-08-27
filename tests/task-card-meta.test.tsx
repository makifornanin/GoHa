import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskCard } from "@/components/tasks/task-card";
import type { Task } from "@/db";

/**
 * What the task row says, and how loudly.
 *
 * The row had become a wall of same-sized pills: priority, goal and status were
 * all chips at footnote size, dates were rendered in `font-mono` with a full
 * year, and priority and goal shared the same flag icon. Nothing led, so the
 * title did not read as the most important thing on the row.
 *
 * These tests pin the editorial decisions rather than the styling: which facts
 * appear at all, and which are allowed to raise their voice.
 */

afterEach(cleanup);

const TZ = "Asia/Manila";

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

const handlers = {
  onToggleComplete: vi.fn(),
  onEdit: vi.fn(),
  onCancel: vi.fn(),
  onDelete: vi.fn(),
  onEditNote: vi.fn(),
};

function renderCard(task: Task, extra: Record<string, unknown> = {}) {
  return render(<TaskCard task={task} timeZone={TZ} {...handlers} {...extra} />);
}

describe("what the row shows", () => {
  it("leads with the title", () => {
    renderCard(makeTask());
    expect(screen.getByText("Finish portfolio")).toBeTruthy();
  });

  it("stays quiet about ordinary priority", () => {
    // Most work is medium. Labelling it on every row says nothing and competes
    // with the title for attention.
    renderCard(makeTask({ priority: "medium" }));
    expect(screen.queryByText("Medium")).toBeNull();
    cleanup();
    renderCard(makeTask({ priority: "low" }));
    expect(screen.queryByText("Low")).toBeNull();
  });

  it("speaks up for high and urgent", () => {
    renderCard(makeTask({ priority: "high" }));
    expect(screen.getByText("High")).toBeTruthy();
    cleanup();
    renderCard(makeTask({ priority: "urgent" }));
    expect(screen.getByText("Urgent")).toBeTruthy();
  });

  it("does not label a plain open task 'To Do'", () => {
    // Every open row carrying the same badge is noise, not status.
    renderCard(makeTask({ status: "todo" }));
    expect(screen.queryByText("To Do")).toBeNull();
  });

  it("still reports a status that means something", () => {
    renderCard(makeTask({ status: "in_progress" }));
    expect(screen.getByText(/in progress/i)).toBeTruthy();
  });

  it("shows the goal and the life area as separate, distinguishable things", () => {
    renderCard(makeTask(), {
      goalTitle: "Find work",
      lifeArea: { id: "a1", name: "Career", color: "blue", icon: null },
    });
    expect(screen.getByText("Find work")).toBeTruthy();
    expect(screen.getByText("Career")).toBeTruthy();
  });
});

describe("dates read as language", () => {
  it("says Today rather than a formatted date", () => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    renderCard(makeTask({ scheduledFor: today }));
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("marks a past due date as overdue", () => {
    renderCard(makeTask({ dueAt: new Date("2020-01-01T12:00:00Z") }));
    // The one date worth colouring: it is a problem, not a plan.
    expect(screen.getByText(/Overdue/)).toBeTruthy();
  });

  it("does not call a completed task overdue", () => {
    renderCard(
      makeTask({ dueAt: new Date("2020-01-01T12:00:00Z"), status: "completed" }),
    );
    expect(screen.queryByText(/Overdue/)).toBeNull();
    expect(screen.getByText(/Due/)).toBeTruthy();
  });

  it("hides the end-of-day hour a date-only due date implies", () => {
    // 23:59 Manila is what the date picker stores for "due on this day"; showing
    // "at 11:59 PM" on every row would be noise.
    renderCard(makeTask({ dueAt: new Date("2026-12-25T15:59:00Z") }));
    expect(screen.queryByText(/11:59/)).toBeNull();
  });

  it("keeps a meaningful hour that a real time carries", () => {
    // 2026-12-25T06:30Z is 2:30 PM in Manila: a deliberate time, so it shows.
    renderCard(makeTask({ dueAt: new Date("2026-12-25T06:30:00Z") }));
    expect(screen.getByText(/2:30 PM/)).toBeTruthy();
  });
});

describe("subtask progress", () => {
  it("shows progress as a proportion, not just a fraction", () => {
    const { container } = renderCard(makeTask(), { subtaskCount: { done: 1, total: 4 } });
    expect(screen.getByText("1/4")).toBeTruthy();
    // A filled track: "1/4" alone makes the reader do the arithmetic.
    const bar = container.querySelector('[style*="width"]');
    expect(bar).not.toBeNull();
    expect((bar as HTMLElement).style.width).toBe("25%");
  });

  it("shows nothing when a task has no steps", () => {
    renderCard(makeTask(), { subtaskCount: { done: 0, total: 0 } });
    expect(screen.queryByText("0/0")).toBeNull();
  });
});
