import { describe, expect, it } from "vitest";

import type { Task } from "@/db";
import {
  BUCKET_CAP,
  buildGraveyardPayload,
  countRepeats,
  isoWeek,
  LONG_OVERDUE_DAYS,
  RECENT_TOUCH_DAYS,
  STUCK_DAYS,
  ZOMBIE_DAYS,
} from "@/lib/automation/graveyard";

/**
 * The weekly sweep (automation Guide 05).
 *
 * The boundaries are exact on purpose: a task one day short of a threshold must
 * not appear, or the digest becomes a list of everything and stops being read.
 */

const TZ = "Asia/Manila";
const TODAY = "2026-08-18";
const NOW = new Date("2026-08-18T04:00:00.000Z");

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    userId: "u",
    goalId: null,
    lifeAreaId: null,
    parentTaskId: null,
    title: "Follow up",
    description: null,
    status: "todo",
    priority: "medium",
    scheduledFor: null,
    dueAt: null,
    completedAt: null,
    completionNote: null,
    estimateMinutes: null,
    sortOrder: 0,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(60),
    ...overrides,
  } as Task;
}

function build(tasks: Task[], repeats = new Map<string, number>()) {
  return buildGraveyardPayload({
    tasks,
    goalTitles: new Map(),
    repeats,
    today: TODAY,
    timeZone: TZ,
    isSabbath: false,
    now: NOW,
  });
}

describe("the three buckets", () => {
  it("catches in-progress work that has not moved", () => {
    const stuck = task({ status: "in_progress", updatedAt: daysAgo(STUCK_DAYS) });
    const moving = task({ id: "t2", status: "in_progress", updatedAt: daysAgo(STUCK_DAYS - 1) });

    const payload = build([stuck, moving]);
    expect(payload.stuck.items.map((item) => item.id)).toEqual(["t1"]);
    expect(payload.stuck.items[0].recommendation).toBe("Break it down.");
  });

  it("catches work long past its due date", () => {
    const rotten = task({ dueAt: daysAgo(LONG_OVERDUE_DAYS + 1) });
    const merelyLate = task({ id: "t2", dueAt: daysAgo(LONG_OVERDUE_DAYS) });

    const payload = build([rotten, merelyLate]);
    expect(payload.longOverdue.items.map((item) => item.id)).toEqual(["t1"]);
    expect(payload.longOverdue.items[0].overdueDays).toBe(LONG_OVERDUE_DAYS + 1);
    expect(payload.longOverdue.items[0].recommendation).toBe("Cancel or reschedule.");
  });

  it("catches undated, ungoaled work that has sat there", () => {
    const zombie = task({ createdAt: daysAgo(ZOMBIE_DAYS), updatedAt: daysAgo(ZOMBIE_DAYS) });
    const younger = task({
      id: "t2",
      createdAt: daysAgo(ZOMBIE_DAYS - 1),
      updatedAt: daysAgo(ZOMBIE_DAYS - 1),
    });

    const payload = build([zombie, younger]);
    expect(payload.zombieInbox.items.map((item) => item.id)).toEqual(["t1"]);
    expect(payload.zombieInbox.items[0].recommendation).toBe("Cancel, or link it to a goal.");
  });

  it("leaves a zombie alone when it was touched recently", () => {
    // Recent attention means it is not rotting, whatever its age says.
    const touched = task({
      createdAt: daysAgo(90),
      updatedAt: daysAgo(RECENT_TOUCH_DAYS - 1),
    });
    expect(build([touched]).zombieInbox.items).toHaveLength(0);
  });

  it("leaves a task with a goal out of the zombie bucket", () => {
    const linked = task({ goalId: "g1", createdAt: daysAgo(90), updatedAt: daysAgo(90) });
    expect(build([linked]).zombieInbox.items).toHaveLength(0);
  });

  it("ignores subtasks, because the parent represents them", () => {
    const subtask = task({ parentTaskId: "parent", status: "in_progress", updatedAt: daysAgo(60) });
    expect(build([subtask]).total).toBe(0);
  });

  it("ignores finished and cancelled work", () => {
    const done = task({ status: "completed", dueAt: daysAgo(90) });
    const dropped = task({ id: "t2", status: "cancelled", dueAt: daysAgo(90) });
    expect(build([done, dropped]).total).toBe(0);
  });
});

describe("caps", () => {
  it("caps each bucket but reports the true total", () => {
    const many = Array.from({ length: BUCKET_CAP + 5 }, (_, i) =>
      task({ id: `t${i}`, dueAt: daysAgo(LONG_OVERDUE_DAYS + 1 + i) }),
    );
    const payload = build(many);

    expect(payload.longOverdue.items).toHaveLength(BUCKET_CAP);
    // A badly rotted backlog stays readable without the digest lying about it.
    expect(payload.longOverdue.totalCount).toBe(BUCKET_CAP + 5);
    expect(payload.total).toBe(BUCKET_CAP + 5);
  });
});

describe("repeat detection", () => {
  it("counts appearances by task id, out of the stored payload", () => {
    const repeats = countRepeats([
      { taskIds: ["a", "b"] },
      { taskIds: ["a"] },
      { taskIds: ["a", "c"] },
    ]);
    expect(repeats.get("a")).toBe(3);
    expect(repeats.get("b")).toBe(1);
    expect(repeats.get("c")).toBe(1);
  });

  it("keeps two same-titled tasks apart", () => {
    // The whole reason this keys on id: two tasks called "Follow up" must not
    // share a history, and one of them being named three weeks running is a
    // real signal that must not be diluted by the other.
    const repeats = countRepeats([{ taskIds: ["id-one"] }, { taskIds: ["id-one"] }]);
    const first = task({ id: "id-one", title: "Follow up", dueAt: daysAgo(90) });
    const second = task({ id: "id-two", title: "Follow up", dueAt: daysAgo(90) });

    const payload = build([first, second], repeats);
    const byId = new Map(payload.longOverdue.items.map((item) => [item.id, item.repeatCount]));
    expect(byId.get("id-one")).toBe(2);
    expect(byId.get("id-two")).toBe(0);
  });

  it("counts a task named twice in one digest as one appearance", () => {
    expect(countRepeats([{ taskIds: ["a", "a"] }]).get("a")).toBe(1);
  });

  it("reads a payload written as buckets rather than a flat id list", () => {
    const repeats = countRepeats([{ stuck: [{ id: "a" }], longOverdue: [{ id: "b" }] }]);
    expect(repeats.get("a")).toBe(1);
    expect(repeats.get("b")).toBe(1);
  });

  it("survives a payload that is null or the wrong shape", () => {
    expect(countRepeats([null, undefined, "nonsense", 42]).size).toBe(0);
  });
});

describe("isoWeek", () => {
  it("gives one key per ISO week", () => {
    // 2026-08-17 is a Monday; the whole week shares its key.
    expect(isoWeek("2026-08-17")).toBe(isoWeek("2026-08-23"));
    expect(isoWeek("2026-08-17")).not.toBe(isoWeek("2026-08-24"));
  });

  it("attributes a new year's week by its Thursday", () => {
    // 2027-01-01 is a Friday, so it belongs to the final week of 2026.
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
});
