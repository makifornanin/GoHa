import "server-only";

import {
  automationRepo,
  dailyPrioritiesRepo,
  focusRepo,
  goalsRepo,
  habitsRepo,
  pushRepo,
  quotesRepo,
  reviewsRepo,
  tasksRepo,
} from "@/db";
import * as workerRepo from "@/db/repositories/worker";
import * as usersRepo from "@/db/repositories/users";
import type { AutomationJob } from "@/db/repositories/worker";
import { toMorningPayload } from "@/lib/automation/brief";
import {
  buildDuePayload,
  deadlineKey,
  focusOverrunKey,
} from "@/lib/automation/due";
import { workerDeliveryDisposition } from "@/lib/automation/worker-delivery";
import { toEveningPayload } from "@/lib/automation/evening";
import { workerErrorName } from "@/lib/automation/worker-auth";
import {
  validateWorkerNotification,
  workerFallbackNotification,
  type WorkerNotification,
} from "@/lib/automation/worker-notification";
import {
  AUTOMATION_JOB_LEASE_MS,
  AUTOMATION_JOB_MAX_ATTEMPTS,
  dueDailySchedule,
  dueWeeklySchedule,
  isPushJobKind,
  dueEveningSchedule,
  isJobDayCurrent,
  retryAt,
} from "@/lib/automation/worker-schedule";
import {
  buildGraveyardPayload,
  countRepeats,
  graveyardKey,
} from "@/lib/automation/graveyard";
import { pickDailyQuote, sourcesFor } from "@/lib/daily-quote";
import { getDailyInspiration } from "@/lib/inspiration/daily";
import { resolveRestDayQuote } from "@/lib/inspiration/rest-quote";
import { toInspirationPayload } from "@/lib/inspiration/resolve";
import { deriveReviewStats, weekBounds } from "@/lib/review";
import { addDays, getZonedParts, startOfWeek, zonedToday, type Weekday } from "@/lib/date";
import { sendNotificationToUser, VapidConfigurationError } from "@/lib/push/web-push";
import { SABBATH_MESSAGE, sabbathContext } from "@/lib/sabbath";
import {
  SMART_REMINDER_COOLDOWN_KINDS,
  SMART_REMINDER_COOLDOWN_MINUTES,
  selectAnchorTask,
  smartReminderFallback,
  smartReminderInstants,
  smartReminderKey,
  smartReminderStage,
  toSmartReminderPayload,
} from "@/lib/automation/smart-reminder";
import { deriveTodayData } from "@/lib/today";
import { deriveDaySignal } from "@/lib/today-brain";
import { getUserSettingsCached } from "@/lib/user-settings";

export const WORKER_CLAIM_LIMIT_MAX = 25;

export { validateWorkerNotification } from "@/lib/automation/worker-notification";
export type { WorkerNotification } from "@/lib/automation/worker-notification";

type WorkerEmailDelivery = {
  channel: "email";
  email: string;
};

export type PreparedWorkerJob =
  | {
      state: "ready";
      job: AutomationJob;
      payload: unknown;
      delivery?: WorkerEmailDelivery;
      fallbackNotification: WorkerNotification;
      /**
       * The subject this payload was actually built around, when preparing is
       * what decides it.
       *
       * Only the smart reminder needs this: its anchor task is CHOSEN at
       * prepare time, whereas a deadline or focus job is materialized with its
       * entity already fixed. Carrying it back means the delivery log records
       * the task the message was about, rather than whatever the job row
       * happened to hold when it was read. See `completeWorkerJob`.
       */
      entity?: { type: string; id: string };
    }
  | { state: "skip"; job: AutomationJob; reason: string };

export type CompleteWorkerInput =
  | { outcome: "use_fallback" }
  | { outcome: "deliver"; notification: WorkerNotification }
  /** The workflow delivered it itself (email digests). Claim, do not push. */
  | { outcome: "acknowledge"; taskIds?: string[] };

type CompletionResult = {
  status: "completed" | "skipped" | "retrying" | "failed" | "conflict";
  reason?: string;
  attempted?: number;
  succeeded?: number;
  permanentFailures?: number;
  transientFailures?: number;
  availableAt?: string;
};

function fallback(title: string, body: string, url: string): WorkerNotification {
  return workerFallbackNotification(title, body, url);
}

function activeSettingsForKind(job: AutomationJob, settings: Awaited<ReturnType<typeof getUserSettingsCached>>) {
  if (!settings.notificationsEnabled) return false;
  if (job.kind === "morning_brief" || job.kind === "sabbath") {
    return settings.morningBriefEnabled;
  }
  if (job.kind === "evening_summary") return settings.eveningSummaryEnabled;
  if (job.kind === "deadline" || job.kind === "focus_overrun") {
    return settings.deadlineAlertsEnabled;
  }
  if (job.kind === "smart_task_reminder") return settings.smartRemindersEnabled;
  return false;
}

/** Materialize all verified job kinds, then lease a bounded batch. */
export async function materializeAndClaimJobs(
  requestedLimit: number,
  now: Date = new Date(),
): Promise<AutomationJob[]> {
  const limit = Math.min(WORKER_CLAIM_LIMIT_MAX, Math.max(1, Math.trunc(requestedLimit)));
  const candidates = await workerRepo.listAutomationCandidates();

  for (const settings of candidates) {
    try {
      const subscriptions = await pushRepo.listActiveSubscriptions(settings.userId);
      const hasDevice = subscriptions.length > 0;

      const localDate = zonedToday(now, settings.timezone);
      const context = sabbathContext({
        sabbathDay: settings.sabbathDay,
        localDate,
        timezone: settings.timezone,
      });

      if (settings.morningBriefEnabled && hasDevice) {
        const scheduledFor = dueDailySchedule({
          now,
          date: localDate,
          time: settings.dailyPlanningTime,
          timezone: settings.timezone,
        });
        if (scheduledFor) {
          await workerRepo.materializeJob({
            userId: settings.userId,
            kind: context.isSabbath ? "sabbath" : "morning_brief",
            dedupeKey: context.isSabbath
              ? `sabbath:${localDate}`
              : `brief:morning:${localDate}`,
            localDate,
            timezone: settings.timezone,
            scheduledFor,
          });
        }
      }

      if (settings.eveningSummaryEnabled && hasDevice && !context.isSabbath) {
        /*
         * `summaryDate` is the day being reported and `scheduledFor` is when it
         * goes out. They differ by one for a rhythm that ends after midnight, so
         * a 2am summary describes the day that just finished rather than the
         * four minutes of the new one. Storing the summary date as `localDate`
         * keeps every date-scoped read in `prepareEvening` correct without
         * touching it.
         */
        const evening = dueEveningSchedule({
          now,
          localDate,
          morningTime: settings.dailyPlanningTime,
          eveningTime: settings.eveningReflectionTime,
          timezone: settings.timezone,
        });
        if (evening) {
          await workerRepo.materializeJob({
            userId: settings.userId,
            kind: "evening_summary",
            dedupeKey: `brief:evening:${evening.summaryDate}`,
            localDate: evening.summaryDate,
            timezone: settings.timezone,
            scheduledFor: evening.scheduledFor,
          });
        }
      }

      if (settings.deadlineAlertsEnabled && hasDevice && !context.isSabbath) {
        await materializeDueJobs(settings, localDate, now);
      }

      if (settings.smartRemindersEnabled && hasDevice && !context.isSabbath) {
        await materializeSmartReminders(settings, localDate, now);
      }

      // Weekly digests. Delivered as email by the workflow, so no device is
      // required, and skipped on the rest day: the week-scoped dedupe key means
      // the next working day picks them up untouched.
      if (!context.isSabbath) {
        await materializeWeeklyJobs(settings, localDate, now);
      }
    } catch (error) {
      // One bad account or invalid saved zone must not prevent every other
      // user's due work from being leased. No domain payload or secret is logged.
      console.error("automation worker could not materialize one account", {
        errorName: workerErrorName(error),
      });
    }
  }

  return workerRepo.claimDueJobs(limit, now, AUTOMATION_JOB_LEASE_MS);
}

async function materializeDueJobs(
  settings: Awaited<ReturnType<typeof workerRepo.listAutomationCandidates>>[number],
  localDate: string,
  now: Date,
): Promise<void> {
  const [tasks, activeSessions] = await Promise.all([
    tasksRepo.listTasksForUser(settings.userId),
    focusRepo.listInProgressSessions(settings.userId),
  ]);
  const candidateKeys = [
    ...tasks.filter((task) => task.dueAt).map((task) => deadlineKey(task)),
    ...activeSessions.map((session) => focusOverrunKey(session.id)),
  ];
  const claimed = await automationRepo.claimedKeys(settings.userId, candidateKeys);
  const payload = buildDuePayload({
    tasks,
    activeSessions,
    taskTitles: new Map(tasks.map((task) => [task.id, task.title])),
    habitViews: [], // Disabled until the R-06 schedule semantics are complete.
    claimed,
    windowMinutes: settings.deadlineLeadMinutes,
    evening: false,
    today: localDate,
    timeZone: settings.timezone,
    isSabbath: false,
    now,
  });

  for (const item of [...payload.due, ...payload.overdueToday]) {
    const dueAt = item.dueAt ? new Date(item.dueAt) : now;
    const scheduledFor = new Date(dueAt.getTime() - settings.deadlineLeadMinutes * 60_000);
    await workerRepo.materializeJob({
      userId: settings.userId,
      kind: "deadline",
      dedupeKey: item.dedupeKey,
      localDate,
      timezone: settings.timezone,
      entityType: "task",
      entityId: item.id,
      scheduledFor,
      availableAt: now,
    });
  }

  for (const item of payload.focusOverrun) {
    await workerRepo.materializeJob({
      userId: settings.userId,
      kind: "focus_overrun",
      dedupeKey: item.dedupeKey,
      localDate,
      timezone: settings.timezone,
      entityType: "focus_session",
      entityId: item.sessionId,
      scheduledFor: now,
      availableAt: now,
    });
  }
}

/**
 * Queue any smart reminder slot whose time has arrived today.
 *
 * The four times are recomputed here rather than read back, so a redeploy
 * between two slots cannot shift the remaining ones. Each slot claims its own
 * dedupe key, which is what stops the five-minute poll from queueing the same
 * opportunity twelve times: the first materialize wins the unique index and
 * every later one is a no-op.
 *
 * Eligibility is checked again at prepare time, deliberately. What is true when
 * a job is queued may not be true a few minutes later when it is leased, and
 * the last word on "is there still anything to nudge about" has to belong to
 * the moment of sending.
 */
async function materializeSmartReminders(
  settings: Awaited<ReturnType<typeof workerRepo.listAutomationCandidates>>[number],
  localDate: string,
  now: Date,
): Promise<void> {
  const instants = smartReminderInstants({
    userId: settings.userId,
    localDate,
    timezone: settings.timezone,
    morningTime: settings.dailyPlanningTime,
    eveningTime: settings.eveningReflectionTime,
  });

  for (const slot of instants) {
    // Not yet due. Tomorrow's slots are never queued today.
    if (slot.at.getTime() > now.getTime()) continue;
    await workerRepo.materializeJob({
      userId: settings.userId,
      kind: "smart_task_reminder",
      dedupeKey: smartReminderKey(localDate, slot.slotIndex),
      localDate,
      timezone: settings.timezone,
      scheduledFor: slot.at,
      availableAt: slot.at,
    });
  }
}

/** Build a leased job's data through the existing canonical derivations. */
export async function prepareWorkerJob(
  job: AutomationJob,
  now: Date = new Date(),
): Promise<PreparedWorkerJob> {
  const settings = await getUserSettingsCached(job.userId);
  if (!activeSettingsForKind(job, settings)) return { state: "skip", job, reason: "disabled" };
  if (settings.timezone !== job.timezone) {
    return { state: "skip", job, reason: "timezone_changed" };
  }
  // Keyed to the date the job FIRES on, which is `localDate` for everything
  // except a wrapped evening summary. See `isJobDayCurrent`.
  if (!isJobDayCurrent(now, job)) {
    return { state: "skip", job, reason: "stale_local_date" };
  }
  if (
    isPushJobKind(job.kind) &&
    (await pushRepo.listActiveSubscriptions(job.userId)).length === 0
  ) {
    return { state: "skip", job, reason: "no_active_subscriptions" };
  }

  const context = sabbathContext({
    sabbathDay: settings.sabbathDay,
    localDate: job.localDate,
    timezone: settings.timezone,
  });
  if (job.kind !== "sabbath" && context.isSabbath) {
    return { state: "skip", job, reason: "sabbath" };
  }
  if (job.kind === "sabbath" && !context.isSabbath) {
    return { state: "skip", job, reason: "sabbath_changed" };
  }

  if (job.kind === "sabbath") return prepareSabbath(job, settings);
  if (job.kind === "morning_brief") return prepareMorning(job, settings, now);
  if (job.kind === "evening_summary") return prepareEvening(job, settings, now);
  if (job.kind === "deadline" || job.kind === "focus_overrun") {
    return prepareDueItem(job, settings, now);
  }
  if (job.kind === "smart_task_reminder") return prepareSmartReminder(job, settings, now);
  if (job.kind === "graveyard") return prepareGraveyard(job, settings, now);
  if (job.kind === "review_draft") return prepareReview(job, settings);
  return { state: "skip", job, reason: "kind_not_active" };
}

async function prepareSabbath(
  job: AutomationJob,
  settings: Awaited<ReturnType<typeof getUserSettingsCached>>,
): Promise<PreparedWorkerJob> {
  /*
   * Through the shared resolver, so the rest day picks the same quote the Today
   * page shows. This used to select here: it hardcoded a verse-only fallback
   * pool, ignoring the saved preference, and never looked for a quote pinned to
   * this date. Both are fixed by not choosing twice.
   */
  const quote = await resolveRestDayQuote(job.userId, job.localDate, settings.quoteSourcePref);
  const payload = {
    localDate: job.localDate,
    timezone: job.timezone,
    isSabbath: true,
    message: SABBATH_MESSAGE,
    quote: quote
      ? { text: quote.text, attribution: quote.attribution, translation: quote.translation }
      : null,
  };
  return {
    state: "ready",
    job,
    payload,
    fallbackNotification: fallback("A day to rest", SABBATH_MESSAGE, "/today"),
  };
}

async function prepareMorning(
  job: AutomationJob,
  settings: Awaited<ReturnType<typeof getUserSettingsCached>>,
  now: Date,
): Promise<PreparedWorkerJob> {
  const [tasks, goals, priorities, habits, habitEntries, quotes, pinnedQuote, delivered] =
    await Promise.all([
      tasksRepo.listTasksForUser(job.userId),
      goalsRepo.listGoalsWithTaskCounts(job.userId),
      dailyPrioritiesRepo.listDailyPriorities(job.userId, job.localDate),
      habitsRepo.listHabitsWithSchedule(job.userId),
      habitsRepo.listEntriesInRange(job.userId, {
        from: addDays(job.localDate, -400),
        to: job.localDate,
      }),
      quotesRepo.listActiveQuotes(job.userId, sourcesFor(settings.quoteSourcePref)),
      quotesRepo.getPinnedQuote(job.userId, job.localDate),
      automationRepo.getNotification(job.userId, job.dedupeKey),
    ]);

  const signal = deriveDaySignal({
    tasks,
    goals,
    priorities,
    habits,
    habitEntries,
    today: job.localDate,
    timeZone: settings.timezone,
    hour: getZonedParts(now, settings.timezone).hour,
  });
  /*
   * The same canonical record the Today card reads.
   *
   * `job.localDate` is the user's local date, already resolved when the job was
   * materialized, so a job that runs at 06:00 Manila and a page opened at 09:00
   * Manila resolve the identical row. Whichever of the two arrives first on a
   * new day decides it; the other reads it.
   *
   * Failure here must not lose the morning: a brief without an inspiration is
   * far better than no brief, so this degrades to null rather than throwing the
   * job into its fail route.
   */
  let dailyInspiration = null;
  try {
    dailyInspiration = toInspirationPayload(await getDailyInspiration(job.userId, job.localDate));
  } catch (error) {
    console.warn("[daily-inspiration] morning job could not resolve", error);
  }

  const payload = toMorningPayload({
    signal,
    tasks,
    goals,
    habits,
    habitEntries,
    quote: pinnedQuote ?? pickDailyQuote(quotes, job.localDate),
    dailyInspiration,
    alreadyDelivered: Boolean(delivered),
    today: job.localDate,
    timeZone: settings.timezone,
    weekStartsOn: (settings.weekStartsOn as Weekday) ?? 1,
    isSabbath: false,
    now,
  });
  if (payload.quiet) return { state: "skip", job, reason: "quiet" };
  return {
    state: "ready",
    job,
    payload,
    fallbackNotification: fallback(
      "Your GoHa morning brief",
      payload.recommendation || `${payload.counts.totalToday} items are on your day.`,
      "/today",
    ),
  };
}

async function prepareEvening(
  job: AutomationJob,
  settings: Awaited<ReturnType<typeof getUserSettingsCached>>,
  now: Date,
): Promise<PreparedWorkerJob> {
  const [tasks, goals, priorities, habits, habitEntries, focusSessions, delivered] =
    await Promise.all([
      tasksRepo.listTasksForUser(job.userId),
      goalsRepo.listGoalsWithTaskCounts(job.userId),
      dailyPrioritiesRepo.listDailyPriorities(job.userId, job.localDate),
      habitsRepo.listHabitsWithSchedule(job.userId),
      habitsRepo.listEntriesInRange(job.userId, {
        from: addDays(job.localDate, -400),
        to: job.localDate,
      }),
      focusRepo.listCompletedSessionsInRange(job.userId, {
        from: addDays(job.localDate, -6),
        to: job.localDate,
      }),
      automationRepo.getNotification(job.userId, job.dedupeKey),
    ]);
  const payload = toEveningPayload({
    tasks,
    goals,
    priorities,
    habits,
    habitEntries,
    focusSessions,
    today: job.localDate,
    timeZone: settings.timezone,
    weekStartsOn: (settings.weekStartsOn as Weekday) ?? 1,
    isSabbath: false,
    alreadyDelivered: Boolean(delivered),
    now,
  });
  const quiet =
    payload.tasksCompleted.length === 0 &&
    payload.tasksPlannedNotDone.length === 0 &&
    payload.habitOutcomes.length === 0 &&
    payload.focusMinutes === 0 &&
    payload.top3Result.pinned === 0;
  if (quiet) return { state: "skip", job, reason: "quiet" };
  return {
    state: "ready",
    job,
    payload,
    fallbackNotification: fallback(
      "Your GoHa evening summary",
      `${payload.tasksCompleted.length} completed | ${payload.tasksPlannedNotDone.length} still open | ${payload.focusMinutes} focus minutes`,
      "/today",
    ),
  };
}

async function prepareDueItem(
  job: AutomationJob,
  settings: Awaited<ReturnType<typeof getUserSettingsCached>>,
  now: Date,
): Promise<PreparedWorkerJob> {
  const [tasks, activeSessions, existing] = await Promise.all([
    tasksRepo.listTasksForUser(job.userId),
    focusRepo.listInProgressSessions(job.userId),
    automationRepo.getNotification(job.userId, job.dedupeKey),
  ]);
  const candidateKeys = [
    ...tasks.filter((task) => task.dueAt).map((task) => deadlineKey(task)),
    ...activeSessions.map((session) => focusOverrunKey(session.id)),
  ];
  const claimed = await automationRepo.claimedKeys(job.userId, candidateKeys);
  if (
    existing?.payload &&
    (existing.payload as Record<string, unknown>).automationJobId === job.id
  ) {
    claimed.delete(job.dedupeKey);
  }
  const payload = buildDuePayload({
    tasks,
    activeSessions,
    taskTitles: new Map(tasks.map((task) => [task.id, task.title])),
    habitViews: [],
    claimed,
    windowMinutes: settings.deadlineLeadMinutes,
    evening: false,
    today: job.localDate,
    timeZone: settings.timezone,
    isSabbath: false,
    now,
  });

  if (job.kind === "deadline") {
    const item = [...payload.due, ...payload.overdueToday].find(
      (candidate) => candidate.dedupeKey === job.dedupeKey,
    );
    if (!item || item.id !== job.entityId) {
      return { state: "skip", job, reason: "stale_entity" };
    }
    const body =
      item.minutesUntil !== null && item.minutesUntil > 0
        ? `${item.title} is due in ${item.minutesUntil} minutes.`
        : `${item.title} is overdue today.`;
    return {
      state: "ready",
      job,
      payload: { ...item, localDate: job.localDate, timezone: job.timezone },
      fallbackNotification: fallback("GoHa deadline", body, `/focus?taskId=${item.id}`),
    };
  }

  const item = payload.focusOverrun.find((candidate) => candidate.dedupeKey === job.dedupeKey);
  if (!item || item.sessionId !== job.entityId) {
    return { state: "skip", job, reason: "stale_entity" };
  }
  return {
    state: "ready",
    job,
    payload: { ...item, localDate: job.localDate, timezone: job.timezone },
    fallbackNotification: fallback(
      "Focus timer still running",
      item.taskTitle
        ? `${item.taskTitle} is ${item.minutesOver} minutes over its plan.`
        : `Your focus timer is ${item.minutesOver} minutes over its plan.`,
      "/focus",
    ),
  };
}

export async function completeWorkerJob(
  job: AutomationJob,
  leaseId: string,
  input: CompleteWorkerInput,
  now: Date = new Date(),
): Promise<CompletionResult> {
  const current = await workerRepo.getLeasedJob(job.id, leaseId, now);
  if (!current) return { status: "conflict", reason: "invalid_or_expired_lease" };
  const prepared = await prepareWorkerJob(current, now);
  if (prepared.state === "skip") {
    const skipped = await workerRepo.skipUndeliveredJob(
      current.id,
      leaseId,
      prepared.reason,
      now,
    );
    if (!skipped) return { status: "conflict", reason: "job_state_changed" };
    return { status: "skipped", reason: prepared.reason };
  }

  /*
   * "acknowledge" is for the digests the workflow delivers itself, by email.
   *
   * It still claims the dedupe key, so a repeated weekly run cannot send a
   * second email, and it still closes the job. What it does not do is push:
   * there is no phone in this path, and inventing a notification to satisfy
   * the delivery machinery would put a duplicate on the user's lock screen.
   */
  const acknowledgeOnly = input.outcome === "acknowledge";
  if (acknowledgeOnly && isPushJobKind(current.kind)) {
    return { status: "conflict", reason: "invalid_notification" };
  }

  const notification = acknowledgeOnly
    ? null
    : input.outcome === "use_fallback"
      ? prepared.fallbackNotification
      : validateWorkerNotification(input.notification);
  if (!acknowledgeOnly && !notification) {
    return { status: "conflict", reason: "invalid_notification" };
  }

  /*
   * Log the subject the PAYLOAD was built around, not the one the job row held
   * when it was read.
   *
   * `current` is a snapshot taken before `prepareWorkerJob` ran, and preparing
   * a smart reminder is what CHOOSES its anchor task and writes it to the row.
   * Reading `current.entityId` therefore recorded whatever was there
   * beforehand, which for a smart reminder is null unless the worker happened
   * to have called GET /jobs/{id} first. That request is optional: a worker
   * that claims and then completes with `use_fallback` never makes it.
   *
   * The consequence was quiet and total. `notification_log.entity_id` stayed
   * null, so `previousAnchorId` in the next slot always read null, so
   * `selectAnchorTask` was never given anything to avoid and returned the
   * top-ranked task every time. All four of a day's reminders named the SAME
   * to-do while others sat waiting, which is precisely the behaviour that
   * function exists to prevent.
   */
  const claimed = await automationRepo.claimNotification(current.userId, {
    kind: current.kind,
    dedupeKey: current.dedupeKey,
    localDate: current.localDate,
    entityType: prepared.entity?.type ?? current.entityType,
    entityId: prepared.entity?.id ?? current.entityId,
    payload: {
      automationJobId: current.id,
      ...(notification ? { notification } : { deliveredBy: "workflow" }),
      // Repeat detection reads this back by task id, never by title.
      ...(current.kind === "graveyard" && input.outcome === "acknowledge" && input.taskIds
        ? { taskIds: input.taskIds }
        : {}),
    },
  });
  let notificationId = claimed?.id ?? null;
  if (!claimed) {
    const winner = await automationRepo.getNotification(current.userId, current.dedupeKey);
    const winnerJobId =
      winner?.payload && (winner.payload as Record<string, unknown>).automationJobId;
    if (winnerJobId !== current.id || current.deliveryStartedAt) {
      const skipped = await workerRepo.skipUndeliveredJob(
        current.id,
        leaseId,
        "duplicate",
        now,
      );
      if (!skipped) return { status: "conflict", reason: "job_state_changed" };
      return { status: "skipped", reason: "duplicate" };
    }
    notificationId = winner?.id ?? null;
  }
  if (!notificationId) {
    await workerRepo.failUndeliveredJob(
      current.id,
      leaseId,
      "notification_claim_missing",
      now,
    );
    return { status: "failed", reason: "notification_claim_missing" };
  }

  if (!(await workerRepo.markDeliveryStarted(current.id, leaseId, now))) {
    return { status: "conflict", reason: "invalid_or_expired_lease" };
  }

  if (acknowledgeOnly) {
    if (!(await workerRepo.completeJob(current.id, leaseId, now))) {
      return { status: "conflict", reason: "job_state_changed" };
    }
    return { status: "completed", attempted: 0, succeeded: 0, permanentFailures: 0, transientFailures: 0 };
  }

  let result: Awaited<ReturnType<typeof sendNotificationToUser>>;
  try {
    result = await sendNotificationToUser({
      userId: current.userId,
      notificationId,
      payload: { ...notification!, tag: `${current.kind}:${current.id}` },
    });
  } catch (error) {
    if (error instanceof VapidConfigurationError) {
      if (
        current.attemptCount < AUTOMATION_JOB_MAX_ATTEMPTS &&
        isJobDayCurrent(now, current)
      ) {
        const availableAt = retryAt(now, current.attemptCount);
        await workerRepo.retryJob(current.id, leaseId, "push_not_configured", availableAt);
        return {
          status: "retrying",
          reason: "push_not_configured",
          availableAt: availableAt.toISOString(),
        };
      }
      await workerRepo.failJob(current.id, leaseId, "push_not_configured", now);
      return { status: "failed", reason: "push_not_configured" };
    }
    console.error("automation worker push delivery failed ambiguously", {
      errorName: workerErrorName(error),
    });
    await workerRepo.failJob(current.id, leaseId, "ambiguous_push_error", now);
    return { status: "failed", reason: "ambiguous_push_error" };
  }

  const deliveryCounts = {
    attempted: result.attempted,
    succeeded: result.succeeded,
    permanentFailures: result.permanentFailures,
    transientFailures: result.transientFailures,
  };

  const disposition = workerDeliveryDisposition(
    deliveryCounts,
    current.attemptCount < AUTOMATION_JOB_MAX_ATTEMPTS && isJobDayCurrent(now, current),
  );
  if (disposition.action === "complete") {
    if (!(await workerRepo.completeJob(current.id, leaseId, now))) {
      return { status: "conflict", reason: "job_state_changed" };
    }
    return { status: "completed", ...deliveryCounts };
  }
  if (disposition.action === "skip") {
    await workerRepo.skipJob(current.id, leaseId, disposition.reason, now);
    return { status: "skipped", reason: disposition.reason, ...deliveryCounts };
  }
  if (disposition.action === "retry") {
    const availableAt = retryAt(now, current.attemptCount);
    await workerRepo.retryJob(current.id, leaseId, disposition.reason, availableAt);
    return {
      status: "retrying",
      reason: disposition.reason,
      availableAt: availableAt.toISOString(),
      ...deliveryCounts,
    };
  }
  await workerRepo.failJob(current.id, leaseId, disposition.reason, now);
  return { status: "failed", reason: disposition.reason, ...deliveryCounts };
}

export async function failWorkerJob(
  job: AutomationJob,
  leaseId: string,
  code: string,
  now: Date = new Date(),
): Promise<CompletionResult> {
  const current = await workerRepo.getLeasedJob(job.id, leaseId, now);
  if (!current) return { status: "conflict", reason: "invalid_or_expired_lease" };
  const safeCode = /^[a-z0-9][a-z0-9_:-]{0,63}$/.test(code) ? code : "worker_failure";
  if (
    current.attemptCount < AUTOMATION_JOB_MAX_ATTEMPTS &&
    isJobDayCurrent(now, current)
  ) {
    const availableAt = retryAt(now, current.attemptCount);
    const retried = await workerRepo.retryUndeliveredJob(
      current.id,
      leaseId,
      safeCode,
      availableAt,
    );
    if (!retried) return { status: "conflict", reason: "job_state_changed" };
    return { status: "retrying", reason: safeCode, availableAt: availableAt.toISOString() };
  }
  const failed = await workerRepo.failUndeliveredJob(current.id, leaseId, safeCode, now);
  if (!failed) return { status: "conflict", reason: "job_state_changed" };
  return { status: "failed", reason: safeCode };
}

/**
 * The weekly digests: graveyard and review pre-fill.
 *
 * Both are keyed to the week (`graveyard:{isoWeek}`, `review:{weekStart}`), so
 * materializing is idempotent across every poll of that week and the Sabbath
 * skip in the caller becomes a deferral rather than a lost run.
 */
async function materializeWeeklyJobs(
  settings: Awaited<ReturnType<typeof workerRepo.listAutomationCandidates>>[number],
  localDate: string,
  now: Date,
): Promise<void> {
  const weekStartsOn = (settings.weekStartsOn as Weekday) ?? 1;
  const weekStart = startOfWeek(localDate, weekStartsOn);
  // The last day of the user's own week, so the sweep and the review land when
  // the week is actually over rather than on a weekday chosen for them.
  const anchor = addDays(weekStart, 6);

  const graveyardAt = dueWeeklySchedule({
    now,
    localDate,
    anchor,
    time: settings.dailyPlanningTime,
    timezone: settings.timezone,
  });
  if (graveyardAt) {
    await workerRepo.materializeJob({
      userId: settings.userId,
      kind: "graveyard",
      dedupeKey: graveyardKey(localDate),
      localDate,
      timezone: settings.timezone,
      scheduledFor: graveyardAt,
    });
  }

  const reviewAt = dueWeeklySchedule({
    now,
    localDate,
    anchor,
    time: settings.eveningReflectionTime,
    timezone: settings.timezone,
  });
  if (reviewAt) {
    await workerRepo.materializeJob({
      userId: settings.userId,
      kind: "review_draft",
      dedupeKey: `review:${weekStart}`,
      localDate,
      // The week being reviewed, which is not the day the job runs on. This is
      // the column that keeps a catch-up run pointed at the right week.
      targetDate: weekStart,
      timezone: settings.timezone,
      scheduledFor: reviewAt,
    });
  }
}

/** Stale work, for the weekly email digest. */
/**
 * Decide whether this slot still deserves to interrupt someone, and about what.
 *
 * Every gate here is re-evaluated now rather than trusted from materialize
 * time. A slot queued at 14:00 might be leased at 14:04, and in those four
 * minutes the user may have finished the last task, been sent a deadline alert,
 * or turned the whole feature off. Sending anyway would be GoHa reporting a
 * state that no longer exists.
 *
 * The Sabbath gate, the enabled gate, the timezone gate and the stale-date gate
 * all ran in `prepareWorkerJob` before this was called, so they are not
 * repeated here.
 */
async function prepareSmartReminder(
  job: AutomationJob,
  settings: Awaited<ReturnType<typeof getUserSettingsCached>>,
  now: Date,
): Promise<PreparedWorkerJob> {
  const slotIndex = Number(job.dedupeKey.split(":")[2]);
  if (!Number.isInteger(slotIndex) || slotIndex < 1) {
    return { state: "skip", job, reason: "invalid_slot" };
  }

  /*
   * Do not stack on a louder message.
   *
   * A deadline alert or a focus nudge in the last ninety minutes has already
   * pointed the user at their work. Following it with "this is still on your
   * list" adds no information and reads as nagging, which is the failure mode
   * that gets a notification permission revoked.
   */
  const cooldownSince = new Date(now.getTime() - SMART_REMINDER_COOLDOWN_MINUTES * 60_000);
  const [tasks, goals, priorities, recentlyInterrupted, priorReminders, userName] =
    await Promise.all([
      tasksRepo.listTasksForUser(job.userId),
      goalsRepo.listGoalsWithTaskCounts(job.userId),
      dailyPrioritiesRepo.listDailyPriorities(job.userId, job.localDate),
      automationRepo.hasRecentNotificationOfKinds(
        job.userId,
        SMART_REMINDER_COOLDOWN_KINDS,
        cooldownSince,
      ),
      automationRepo.listNotificationsByKind(job.userId, "smart_task_reminder", 8),
      usersRepo.getUserDisplayNameById(job.userId),
    ]);

  if (recentlyInterrupted) return { state: "skip", job, reason: "recent_alert_cooldown" };

  /*
   * The same Today the user sees, through the same derivation.
   *
   * Not a bespoke query: if this counted "today" its own way it would eventually
   * disagree with the Today page, and a notification about a task the user
   * cannot find on their list is worse than silence (CLAUDE.md section 7).
   */
  const today = deriveTodayData({
    today: job.localDate,
    tasks,
    goals,
    priorities,
    timeZone: settings.timezone,
  });

  const open = today.todayTasks.filter(
    (task) => task.status === "todo" || task.status === "in_progress",
  );
  // Nothing left to nudge about. A finished day gets its silence.
  if (open.length === 0) return { state: "skip", job, reason: "nothing_open" };

  /*
   * Avoid naming the same task twice running, when there is anything else to
   * name. Read from the delivery log rather than kept in memory, because the
   * worker is stateless between polls and may not be the same process.
   */
  const previousAnchorId =
    priorReminders.find((entry) => entry.localDate === job.localDate)?.entityId ?? null;

  const anchor = selectAnchorTask(open, previousAnchorId);
  if (!anchor) return { state: "skip", job, reason: "nothing_open" };

  const goalTitle = anchor.goalId
    ? (goals.find((goal) => goal.id === anchor.goalId)?.title ?? null)
    : null;

  const payload = toSmartReminderPayload({
    localDate: job.localDate,
    timezone: job.timezone,
    slotIndex,
    userName,
    anchor,
    goalTitle,
    remainingCount: open.length,
    completedToday: today.completedToday,
    totalToday: today.totalToday,
    overdueCount: today.overdueTasks.length,
  });

  /*
   * Record the subject on the job, so the delivery log carries it and the next
   * reminder can see what this one named. Best effort: a lease that expired
   * between the read above and here means this job is no longer ours to send,
   * and the completion path will reject it on the same grounds. Losing the
   * anti-repeat hint is not worth failing a notification over.
   *
   * The anchor is ALSO returned below, and that is what the delivery log
   * actually uses. Writing it here is what lets a later request see it; the
   * return value is what makes the log correct in the same request.
   */
  if (job.leaseId) {
    await workerRepo.setJobEntity(job.id, job.leaseId, "task", anchor.id);
  }

  const text = smartReminderFallback({
    anchorTitle: anchor.title,
    remainingCount: open.length,
    stage: smartReminderStage(slotIndex),
  });

  return {
    state: "ready",
    job,
    payload,
    fallbackNotification: fallback(text.title, text.body, text.url),
    entity: { type: "task", id: anchor.id },
  };
}

async function prepareGraveyard(
  job: AutomationJob,
  settings: Awaited<ReturnType<typeof getUserSettingsCached>>,
  now: Date,
): Promise<PreparedWorkerJob> {
  const [tasks, goals, priorDigests, email] = await Promise.all([
    tasksRepo.listTasksForUser(job.userId),
    goalsRepo.listGoals(job.userId),
    automationRepo.listNotificationsByKind(job.userId, "graveyard", 12),
    usersRepo.getUserEmailById(job.userId),
  ]);

  if (!email) {
    throw new Error("Graveyard email recipient not found.");
  }

  const payload = buildGraveyardPayload({
    tasks,
    goalTitles: new Map(goals.map((goal) => [goal.id, goal.title])),
    repeats: countRepeats(priorDigests.map((entry) => entry.payload)),
    today: job.localDate,
    timeZone: settings.timezone,
    isSabbath: false,
    now,
  });

  // A clean backlog sends nothing at all. No "all clear" email.
  if (payload.total === 0) return { state: "skip", job, reason: "quiet" };

  return {
    state: "ready",
    job,
    payload,
    delivery: {
      channel: "email",
      email,
    },
    fallbackNotification: fallback(
      `${payload.total} task${payload.total === 1 ? "" : "s"} need a decision`,
      `${payload.stuck.totalCount} stuck | ${payload.longOverdue.totalCount} long overdue | ${payload.zombieInbox.totalCount} rotting in the inbox`,
      "/tasks",
    ),
  };
}

/** The week's numbers, for the AI review draft. */
async function prepareReview(
  job: AutomationJob,
  settings: Awaited<ReturnType<typeof getUserSettingsCached>>,
): Promise<PreparedWorkerJob> {
  const weekStartsOn = (settings.weekStartsOn as Weekday) ?? 1;
  // The week this job was created for, never "the week it happens to run in".
  const weekStart = job.targetDate ?? startOfWeek(job.localDate, weekStartsOn);
  const bounds = weekBounds(weekStart);

  const [tasks, goals, habits, entries, sessions, review] = await Promise.all([
    tasksRepo.listTasksForUser(job.userId),
    goalsRepo.listGoals(job.userId),
    habitsRepo.listHabitsWithSchedule(job.userId),
    habitsRepo.listEntriesInRange(job.userId, {
      from: addDays(weekStart, -14),
      to: bounds.end,
    }),
    focusRepo.listCompletedSessionsInRange(job.userId, {
      from: addDays(weekStart, -7),
      to: bounds.end,
    }),
    reviewsRepo.getWeeklyReview(job.userId, weekStart),
  ]);

  // A finished review is the owner's own words. Never draft over it.
  if (review?.completedAt) return { state: "skip", job, reason: "review_complete" };

  const alreadyWritten =
    Boolean(review?.wins) && Boolean(review?.challenges) && Boolean(review?.focusNextWeek);
  if (alreadyWritten) return { state: "skip", job, reason: "review_complete" };

  const stats = deriveReviewStats({
    week: bounds,
    tasks,
    habits,
    habitEntries: entries,
    sessions,
    goals,
    today: job.localDate,
    weekStartsOn,
    timeZone: settings.timezone,
  });

  // An AI essay about a week where nothing happened is noise.
  if (stats.completed.length === 0 && stats.slipped.length === 0) {
    return { state: "skip", job, reason: "quiet" };
  }

  const email = await usersRepo.getUserEmailById(job.userId);

  if (!email) {
    throw new Error("Review email recipient not found.");
  }

  return {
    state: "ready",
    job,
    payload: {
      localDate: job.localDate,
      timezone: settings.timezone,
      isSabbath: false,
      weekStart,
      weekEnd: bounds.end,
      stats,
      review: {
        exists: Boolean(review),
        hasWins: Boolean(review?.wins),
        hasChallenges: Boolean(review?.challenges),
        hasNextWeekFocus: Boolean(review?.focusNextWeek),
      },
    },
    delivery: {
      channel: "email",
      email,
    },
    fallbackNotification: fallback(
      "Your weekly review is ready to write",
      `${stats.completed.length} completed and ${stats.slipped.length} slipped last week.`,
      "/review",
    ),
  };
}
