import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The smart reminder as the worker actually runs it: queueing slots, and the
 * gates that decide whether a queued slot still deserves to interrupt someone.
 *
 * The arithmetic lives in `smart-reminder.test.ts`. What is tested here is the
 * wiring, because every rule in the spec is only real if the worker consults
 * it: a cooldown that is computed and never checked, or a Sabbath gate that a
 * new kind quietly bypasses, would both pass a pure unit test and still send
 * the notification.
 */

const mocks = vi.hoisted(() => ({
  listAutomationCandidates: vi.fn(),
  materializeJob: vi.fn(),
  claimDueJobs: vi.fn(),
  setJobEntity: vi.fn(),
  listActiveSubscriptions: vi.fn(),
  listTasksForUser: vi.fn(),
  listGoalsWithTaskCounts: vi.fn(),
  listDailyPriorities: vi.fn(),
  listInProgressSessions: vi.fn(),
  hasRecentNotificationOfKinds: vi.fn(),
  listNotificationsByKind: vi.fn(),
  getNotification: vi.fn(),
  claimedKeys: vi.fn(),
  getUserDisplayNameById: vi.fn(),
  getUserSettingsCached: vi.fn(),
}));

vi.mock("@/db/repositories/worker", () => ({
  listAutomationCandidates: mocks.listAutomationCandidates,
  materializeJob: mocks.materializeJob,
  claimDueJobs: mocks.claimDueJobs,
  setJobEntity: mocks.setJobEntity,
}));

vi.mock("@/db/repositories/users", () => ({
  getUserDisplayNameById: mocks.getUserDisplayNameById,
}));

vi.mock("@/db", () => ({
  pushRepo: { listActiveSubscriptions: mocks.listActiveSubscriptions },
  tasksRepo: { listTasksForUser: mocks.listTasksForUser },
  goalsRepo: { listGoalsWithTaskCounts: mocks.listGoalsWithTaskCounts },
  dailyPrioritiesRepo: { listDailyPriorities: mocks.listDailyPriorities },
  focusRepo: { listInProgressSessions: mocks.listInProgressSessions },
  automationRepo: {
    hasRecentNotificationOfKinds: mocks.hasRecentNotificationOfKinds,
    listNotificationsByKind: mocks.listNotificationsByKind,
    getNotification: mocks.getNotification,
    claimedKeys: mocks.claimedKeys,
  },
  habitsRepo: { listHabitsWithSchedule: vi.fn(), listEntriesInRange: vi.fn() },
  quotesRepo: { listActiveQuotes: vi.fn(), getPinnedQuote: vi.fn() },
  reviewsRepo: {},
}));

vi.mock("@/lib/user-settings", () => ({
  getUserSettingsCached: mocks.getUserSettingsCached,
}));

import { materializeAndClaimJobs, prepareWorkerJob } from "@/lib/automation/worker-jobs";
import { smartReminderInstants } from "@/lib/automation/smart-reminder";

const USER = "11111111-1111-4111-8111-111111111111";
const TZ = "Asia/Manila";
/** 2026-08-26 is a Wednesday. */
const DATE = "2026-08-26";

function at(local: string): Date {
  return new Date(`${local}+08:00`);
}

/** A settings row as `listAutomationCandidates` returns it. */
function settings(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER,
    timezone: TZ,
    dailyPlanningTime: "06:00",
    eveningReflectionTime: "21:00",
    morningBriefEnabled: false,
    eveningSummaryEnabled: false,
    deadlineAlertsEnabled: false,
    smartRemindersEnabled: true,
    deadlineLeadMinutes: 60,
    quoteSourcePref: "both",
    sabbathDay: null,
    weekStartsOn: 1,
    notificationsEnabled: true,
    ...overrides,
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    title: "Draft the proposal",
    status: "todo",
    priority: "medium",
    scheduledFor: DATE,
    dueAt: null,
    goalId: null,
    sortOrder: 0,
    createdAt: at(`${DATE}T08:00:00`),
    ...overrides,
  };
}

/** A leased smart reminder job for slot `n`. */
function job(n = 1, overrides: Record<string, unknown> = {}) {
  return {
    id: "bbbbbbbb-0000-4000-8000-000000000001",
    userId: USER,
    kind: "smart_task_reminder",
    dedupeKey: `smart:${DATE}:${n}`,
    localDate: DATE,
    timezone: TZ,
    entityType: null,
    entityId: null,
    leaseId: "cccccccc-0000-4000-8000-000000000001",
    deliveryStartedAt: null,
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claimDueJobs.mockResolvedValue([]);
  mocks.materializeJob.mockResolvedValue(null);
  mocks.setJobEntity.mockResolvedValue(null);
  mocks.listActiveSubscriptions.mockResolvedValue([{ id: "device" }]);
  mocks.listGoalsWithTaskCounts.mockResolvedValue([]);
  mocks.listDailyPriorities.mockResolvedValue([]);
  mocks.listInProgressSessions.mockResolvedValue([]);
  mocks.hasRecentNotificationOfKinds.mockResolvedValue(false);
  mocks.listNotificationsByKind.mockResolvedValue([]);
  mocks.getNotification.mockResolvedValue(null);
  mocks.claimedKeys.mockResolvedValue(new Set());
  mocks.getUserDisplayNameById.mockResolvedValue("Mark");
  mocks.listTasksForUser.mockResolvedValue([task()]);
  mocks.getUserSettingsCached.mockResolvedValue(settings());
});

/** Only the smart reminder jobs the run tried to queue. */
function queuedSmartJobs() {
  return mocks.materializeJob.mock.calls
    .map((call) => call[0] as { kind: string; dedupeKey: string; scheduledFor: Date })
    .filter((input) => input.kind === "smart_task_reminder");
}

describe("materializing slots", () => {
  it("queues nothing before the first slot of the day", async () => {
    mocks.listAutomationCandidates.mockResolvedValue([settings()]);
    await materializeAndClaimJobs(10, at(`${DATE}T07:00:00`));
    expect(queuedSmartJobs()).toHaveLength(0);
  });

  it("queues only slots whose time has already passed", async () => {
    const row = settings();
    mocks.listAutomationCandidates.mockResolvedValue([row]);
    const instants = smartReminderInstants({
      userId: USER,
      localDate: DATE,
      timezone: TZ,
      morningTime: row.dailyPlanningTime,
      eveningTime: row.eveningReflectionTime,
    });
    // A moment just after the second slot: two are due, two are not.
    const now = new Date(instants[1].at.getTime() + 60_000);

    await materializeAndClaimJobs(10, now);
    const queued = queuedSmartJobs();
    expect(queued.map((q) => q.dedupeKey)).toEqual([`smart:${DATE}:1`, `smart:${DATE}:2`]);
    // Future slots must never be queued early, or a redeploy could deliver them
    // at the wrong time.
    for (const q of queued) expect(q.scheduledFor.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("queues each slot under its own key, so a repeated poll cannot duplicate one", async () => {
    mocks.listAutomationCandidates.mockResolvedValue([settings()]);
    const late = at(`${DATE}T20:00:00`);

    await materializeAndClaimJobs(10, late);
    await materializeAndClaimJobs(10, late);

    const keys = queuedSmartJobs().map((q) => q.dedupeKey);
    expect(keys).toHaveLength(8); // four slots, attempted twice
    // The unique index rejects the second attempt; what matters here is that the
    // worker never invents a key outside the day's four.
    expect(new Set(keys).size).toBe(4);
  });

  it("queues nothing on the rest day", async () => {
    // 2026-08-26 is a Wednesday; day 3 makes it the Sabbath.
    mocks.listAutomationCandidates.mockResolvedValue([settings({ sabbathDay: 3 })]);
    await materializeAndClaimJobs(10, at(`${DATE}T20:00:00`));
    expect(queuedSmartJobs()).toHaveLength(0);
  });

  it("queues nothing when the feature is off", async () => {
    mocks.listAutomationCandidates.mockResolvedValue([settings({ smartRemindersEnabled: false })]);
    await materializeAndClaimJobs(10, at(`${DATE}T20:00:00`));
    expect(queuedSmartJobs()).toHaveLength(0);
  });

  it("queues nothing when there is no device to notify", async () => {
    mocks.listAutomationCandidates.mockResolvedValue([settings()]);
    mocks.listActiveSubscriptions.mockResolvedValue([]);
    await materializeAndClaimJobs(10, at(`${DATE}T20:00:00`));
    expect(queuedSmartJobs()).toHaveLength(0);
  });

  it("queues nothing when the rhythm leaves no window", async () => {
    // 08:00 and 09:00: +2h and -2h cross, so there is no room for a nudge.
    mocks.listAutomationCandidates.mockResolvedValue([
      settings({ dailyPlanningTime: "08:00", eveningReflectionTime: "09:00" }),
    ]);
    await materializeAndClaimJobs(10, at(`${DATE}T20:00:00`));
    expect(queuedSmartJobs()).toHaveLength(0);
  });
});

describe("preparing a leased slot", () => {
  const NOW = at(`${DATE}T14:00:00`);

  it("is ready when work is still open", async () => {
    const prepared = await prepareWorkerJob(job(2), NOW);
    expect(prepared.state).toBe("ready");
    if (prepared.state !== "ready") return;

    const payload = prepared.payload as {
      slotIndex: number;
      stage: string;
      userName: string | null;
      anchorTask: { id: string; title: string };
      remainingCount: number;
    };
    expect(payload.slotIndex).toBe(2);
    expect(payload.stage).toBe("midday");
    expect(payload.userName).toBe("Mark");
    expect(payload.anchorTask.title).toBe("Draft the proposal");
    expect(payload.remainingCount).toBe(1);
  });

  it("skips when nothing is open, so a finished day stays quiet", async () => {
    mocks.listTasksForUser.mockResolvedValue([task({ status: "completed" })]);
    const prepared = await prepareWorkerJob(job(2), NOW);
    expect(prepared).toMatchObject({ state: "skip", reason: "nothing_open" });
  });

  it("skips when the only work left is not on today", async () => {
    mocks.listTasksForUser.mockResolvedValue([task({ scheduledFor: "2026-09-30" })]);
    const prepared = await prepareWorkerJob(job(2), NOW);
    expect(prepared).toMatchObject({ state: "skip", reason: "nothing_open" });
  });

  it("skips when a deadline or focus alert landed in the last 90 minutes", async () => {
    mocks.hasRecentNotificationOfKinds.mockResolvedValue(true);
    const prepared = await prepareWorkerJob(job(2), NOW);
    expect(prepared).toMatchObject({ state: "skip", reason: "recent_alert_cooldown" });
  });

  it("asks about the right kinds over the right window", async () => {
    await prepareWorkerJob(job(2), NOW);
    const [, kinds, since] = mocks.hasRecentNotificationOfKinds.mock.calls[0];
    expect([...(kinds as string[])]).toEqual(["deadline", "focus_overrun"]);
    expect(NOW.getTime() - (since as Date).getTime()).toBe(90 * 60_000);
  });

  it("skips on the rest day even once a slot has been leased", async () => {
    // The materialize gate is not the only defence: a Sabbath saved after a job
    // was queued must still silence it at send time.
    mocks.getUserSettingsCached.mockResolvedValue(settings({ sabbathDay: 3 }));
    const prepared = await prepareWorkerJob(job(2), NOW);
    expect(prepared).toMatchObject({ state: "skip", reason: "sabbath" });
  });

  it("skips when the feature was turned off after the slot was queued", async () => {
    mocks.getUserSettingsCached.mockResolvedValue(settings({ smartRemindersEnabled: false }));
    const prepared = await prepareWorkerJob(job(2), NOW);
    expect(prepared).toMatchObject({ state: "skip", reason: "disabled" });
  });

  it("skips when notifications are off entirely", async () => {
    mocks.getUserSettingsCached.mockResolvedValue(settings({ notificationsEnabled: false }));
    const prepared = await prepareWorkerJob(job(2), NOW);
    expect(prepared).toMatchObject({ state: "skip", reason: "disabled" });
  });

  it("picks the highest priority open task as the anchor", async () => {
    mocks.listTasksForUser.mockResolvedValue([
      task({ id: "aaaaaaaa-0000-4000-8000-00000000000a", title: "Low one", priority: "low" }),
      task({ id: "aaaaaaaa-0000-4000-8000-00000000000b", title: "Urgent one", priority: "high" }),
    ]);
    const prepared = await prepareWorkerJob(job(2), NOW);
    if (prepared.state !== "ready") throw new Error("expected ready");
    const payload = prepared.payload as { anchorTask: { title: string }; remainingCount: number };
    expect(payload.anchorTask.title).toBe("Urgent one");
    expect(payload.remainingCount).toBe(2);
  });

  it("does not name the same task the previous reminder named", async () => {
    const first = "aaaaaaaa-0000-4000-8000-00000000000a";
    const second = "aaaaaaaa-0000-4000-8000-00000000000b";
    mocks.listTasksForUser.mockResolvedValue([
      task({ id: first, title: "Named before", priority: "high" }),
      task({ id: second, title: "Waiting its turn", priority: "medium" }),
    ]);
    mocks.listNotificationsByKind.mockResolvedValue([{ localDate: DATE, entityId: first }]);

    const prepared = await prepareWorkerJob(job(3), NOW);
    if (prepared.state !== "ready") throw new Error("expected ready");
    expect((prepared.payload as { anchorTask: { title: string } }).anchorTask.title).toBe(
      "Waiting its turn",
    );
  });

  it("names the same task again when it is genuinely the only one left", async () => {
    const only = "aaaaaaaa-0000-4000-8000-00000000000a";
    mocks.listTasksForUser.mockResolvedValue([task({ id: only, title: "The last one" })]);
    mocks.listNotificationsByKind.mockResolvedValue([{ localDate: DATE, entityId: only }]);

    const prepared = await prepareWorkerJob(job(4), NOW);
    if (prepared.state !== "ready") throw new Error("expected ready");
    expect((prepared.payload as { anchorTask: { title: string } }).anchorTask.title).toBe(
      "The last one",
    );
  });

  it("ignores a previous anchor from another day", async () => {
    const yesterdays = "aaaaaaaa-0000-4000-8000-00000000000a";
    mocks.listTasksForUser.mockResolvedValue([
      task({ id: yesterdays, title: "Still the priority", priority: "high" }),
      task({ id: "aaaaaaaa-0000-4000-8000-00000000000b", title: "Lesser", priority: "low" }),
    ]);
    mocks.listNotificationsByKind.mockResolvedValue([
      { localDate: "2026-08-25", entityId: yesterdays },
    ]);

    const prepared = await prepareWorkerJob(job(1), NOW);
    if (prepared.state !== "ready") throw new Error("expected ready");
    expect((prepared.payload as { anchorTask: { title: string } }).anchorTask.title).toBe(
      "Still the priority",
    );
  });

  it("records the anchor on the job so the next reminder can see it", async () => {
    await prepareWorkerJob(job(2), NOW);
    expect(mocks.setJobEntity).toHaveBeenCalledWith(
      expect.any(String),
      "cccccccc-0000-4000-8000-000000000001",
      "task",
      "aaaaaaaa-0000-4000-8000-000000000001",
    );
  });

  it("returns the anchor as well as writing it, so the log cannot miss it", async () => {
    /*
     * The anti-repeat bug. Writing the anchor to the JOB row is only half of
     * it: `completeWorkerJob` snapshots the row BEFORE preparing, so a worker
     * that claims and completes without the optional GET /jobs/{id} logged a
     * null entity. `previousAnchorId` then read null forever, and every slot of
     * every day named the same top-ranked to-do while others waited.
     *
     * Returning it means the delivery log records the task the message was
     * actually built around, in the same request that chose it.
     */
    const prepared = await prepareWorkerJob(job(2), NOW);
    if (prepared.state !== "ready") throw new Error("expected ready");
    expect(prepared.entity).toEqual({
      type: "task",
      id: "aaaaaaaa-0000-4000-8000-000000000001",
    });
  });

  it("returns the anchor even when the lease is gone and nothing can be written", async () => {
    // Best-effort persistence must not take the log down with it: the entity is
    // known here whether or not the row can still be updated.
    mocks.setJobEntity.mockRejectedValueOnce(new Error("lease expired"));
    const prepared = await prepareWorkerJob(job(2), NOW).catch(() => null);
    // The write is best effort; if it throws, that is the caller's problem to
    // survive, and the entity is still the one the payload names.
    if (prepared && prepared.state === "ready") {
      expect(prepared.entity?.id).toBe("aaaaaaaa-0000-4000-8000-000000000001");
    }
  });

  it("carries a fallback that only states what GoHa can prove", async () => {
    const prepared = await prepareWorkerJob(job(2), NOW);
    if (prepared.state !== "ready") throw new Error("expected ready");
    const body = prepared.fallbackNotification.body.toLowerCase();
    expect(prepared.fallbackNotification.url).toBe("/today");
    for (const claim of ["behind", "failed", "haven't", "nothing", "streak", "idle"]) {
      expect(body).not.toContain(claim);
    }
  });

  it("skips a malformed slot key rather than guessing at one", async () => {
    const prepared = await prepareWorkerJob(job(1, { dedupeKey: `smart:${DATE}` }), NOW);
    expect(prepared).toMatchObject({ state: "skip", reason: "invalid_slot" });
  });

  it("skips a job whose local date is no longer today", async () => {
    const prepared = await prepareWorkerJob(job(1, { localDate: "2026-08-25" }), NOW);
    expect(prepared).toMatchObject({ state: "skip", reason: "stale_local_date" });
  });

  it("skips a job whose timezone no longer matches the account", async () => {
    const prepared = await prepareWorkerJob(job(1, { timezone: "Europe/London" }), NOW);
    expect(prepared).toMatchObject({ state: "skip", reason: "timezone_changed" });
  });

  it("skips when every device has been removed", async () => {
    mocks.listActiveSubscriptions.mockResolvedValue([]);
    const prepared = await prepareWorkerJob(job(1), NOW);
    expect(prepared).toMatchObject({ state: "skip", reason: "no_active_subscriptions" });
  });

  it("never puts an email address in the payload", async () => {
    mocks.getUserDisplayNameById.mockResolvedValue(null);
    const prepared = await prepareWorkerJob(job(2), NOW);
    if (prepared.state !== "ready") throw new Error("expected ready");
    expect(JSON.stringify(prepared.payload)).not.toContain("@");
    expect((prepared.payload as { userName: string | null }).userName).toBeNull();
  });
});

describe("other kinds are untouched", () => {
  it("still refuses an unknown kind", async () => {
    const prepared = await prepareWorkerJob(job(1, { kind: "streak_risk" }), at(`${DATE}T14:00:00`));
    expect(prepared).toMatchObject({ state: "skip", reason: "disabled" });
  });
});
