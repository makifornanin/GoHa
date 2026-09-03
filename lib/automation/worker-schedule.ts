import {
  getZonedParts,
  toZonedDate,
  zonedLocalToInstant,
  type IsoDate,
} from "@/lib/date";

/** The queue lease is deliberately longer than a normal model call. */
export const AUTOMATION_JOB_LEASE_MS = 15 * 60_000;
export const AUTOMATION_JOB_MAX_ATTEMPTS = 5;

/** Only actual saved rhythm times schedule daily work. */
export function scheduledLocalInstant(params: {
  date: IsoDate;
  time: string | null | undefined;
  timezone: string;
}): Date | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(params.time ?? "");
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;

  try {
    const instant = zonedLocalToInstant(
      `${params.date}T${match[1]}:${match[2]}:${String(second).padStart(2, "0")}`,
      params.timezone,
    );
    if (!instant) return null;

    // A local time skipped by a DST jump must not silently schedule at a
    // different wall time. The next scheduler poll can safely skip that day's
    // optional notification rather than surprise the user.
    const actual = getZonedParts(instant, params.timezone);
    if (actual.hour !== hour || actual.minute !== minute || actual.second !== second) return null;
    return instant;
  } catch {
    return null;
  }
}

/** Due only on the named local date, never as an after-midnight prior-day job. */
export function dueDailySchedule(params: {
  now: Date;
  date: IsoDate;
  time: string | null | undefined;
  timezone: string;
}): Date | null {
  try {
    if (toZonedDate(params.now, params.timezone) !== params.date) return null;
  } catch {
    return null;
  }
  const scheduledFor = scheduledLocalInstant(params);
  return scheduledFor && params.now.getTime() >= scheduledFor.getTime() ? scheduledFor : null;
}

/** A date-scoped retry is no longer useful after that user's midnight. */
export function isSameJobLocalDate(
  now: Date,
  localDate: IsoDate,
  timezone: string,
): boolean {
  try {
    return toZonedDate(now, timezone) === localDate;
  } catch {
    return false;
  }
}

/** Bounded deterministic backoff: 1m, 5m, 15m, then 60m. */
export function retryAt(now: Date, attemptCount: number): Date {
  const minutes = [1, 5, 15, 60][Math.max(0, Math.min(3, attemptCount - 1))];
  return new Date(now.getTime() + minutes * 60_000);
}

/**
 * Weekly work, with Sabbath catch-up built in.
 *
 * The digest kinds (graveyard, review) are keyed to the week rather than the
 * day, so the database's dedupe key does the "only once" work and this only has
 * to answer "is it time yet". That is what makes deferral free: on a rest day
 * nothing is materialized, and the next poll on the first working day sees the
 * same week key still unclaimed and fires then.
 *
 * `anchor` is the local date the run is meant for. Any local date on or after
 * it qualifies, which is the catch-up window; a missed week never fires late
 * because the anchor moves with the week.
 */
export function dueWeeklySchedule(params: {
  now: Date;
  localDate: IsoDate;
  anchor: IsoDate;
  time: string | null | undefined;
  timezone: string;
}): Date | null {
  if (params.localDate < params.anchor) return null;

  // Past the anchor day, the time of day no longer gates it: a catch-up run
  // should not have to wait for the same clock time it already missed.
  if (params.localDate > params.anchor) {
    return scheduledLocalInstant({
      date: params.localDate,
      time: params.time,
      timezone: params.timezone,
    }) ?? params.now;
  }

  return dueDailySchedule({
    now: params.now,
    date: params.anchor,
    time: params.time,
    timezone: params.timezone,
  });
}

/**
 * Kinds delivered to a phone, and kinds delivered by the workflow itself.
 *
 * Graveyard and review are long-form and go out as email from n8n (guides 05
 * and 06), so they must NOT require a registered device: a user who never
 * installs the PWA should still get their weekly digest. Everything else is a
 * push and is pointless without somewhere to send it.
 *
 * Kept here rather than beside the job logic because it is pure data that both
 * the scheduler and the tests need, and the job module is server-only.
 */
export const PUSH_JOB_KINDS = new Set([
  "morning_brief",
  "sabbath",
  "evening_summary",
  "deadline",
  "focus_overrun",
  // Push-only by design: a contextual midday nudge is worth a phone buzz and
  // is not worth an email, which would land four times a day in an inbox.
  "smart_task_reminder",
]);

export function isPushJobKind(kind: string): boolean {
  return PUSH_JOB_KINDS.has(kind);
}

/**
 * A day that ends after midnight.
 *
 * Someone who wakes at 1pm and stops working at 2am has a real day, and both of
 * those are real rhythm times. The original model compared them as minutes from
 * midnight ON THE SAME DATE, so "2am" always meant this morning rather than
 * tonight: the evening landed *before* the morning, the smart-reminder window
 * collapsed, and the evening summary fired at 2am at the START of its own day
 * and summarised nothing. Night-shift accounts silently got an empty summary
 * every single day.
 *
 * The rule that fixes it is one line: an evening time at or before the morning
 * time belongs to the NEXT calendar day.
 */
export function eveningWrapsPastMidnight(
  morningTime: string | null | undefined,
  eveningTime: string | null | undefined,
): boolean {
  const morning = clockMinutes(morningTime);
  const evening = clockMinutes(eveningTime);
  if (morning === null || evening === null) return false;
  return evening <= morning;
}

/** Minutes from local midnight, or null when the value is not a clock time. */
export function clockMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? "");
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * When the evening summary is due, and which day it is ABOUT.
 *
 * The two are the same date on an ordinary day and one apart on a wrapped one.
 * The summary always describes the day the user actually lived: set 1pm/2am and
 * the 2am delivery on Tuesday reports Monday, not the four minutes of Tuesday
 * that have happened so far.
 *
 * `summaryDate` becomes the job's `localDate`, so every date-scoped read in
 * `prepareEvening` keeps working untouched, and the dedupe key stays one per
 * real day.
 */
export function dueEveningSchedule(params: {
  now: Date;
  /** Today, in the user's zone. */
  localDate: IsoDate;
  morningTime: string | null | undefined;
  eveningTime: string | null | undefined;
  timezone: string;
}): { summaryDate: IsoDate; scheduledFor: Date } | null {
  const scheduledFor = dueDailySchedule({
    now: params.now,
    date: params.localDate,
    time: params.eveningTime,
    timezone: params.timezone,
  });
  if (!scheduledFor) return null;

  if (!eveningWrapsPastMidnight(params.morningTime, params.eveningTime)) {
    return { summaryDate: params.localDate, scheduledFor };
  }
  // Fires today, reports yesterday.
  return { summaryDate: previousLocalDate(params.localDate), scheduledFor };
}

/** The calendar day before an ISO date, without going through a Date. */
function previousLocalDate(date: IsoDate): IsoDate {
  const [y, m, d] = date.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10) as IsoDate;
}

/**
 * Whether a job's day is still the day it is happening on.
 *
 * Retries and staleness are scoped to the job's own day, and for almost every
 * job that is `localDate`. A wrapped evening summary is the exception: it is
 * ABOUT one date and DELIVERED on the next, so keying its liveness to
 * `localDate` would have the worker discard it as stale the moment it became
 * claimable.
 *
 * Derived from `scheduledFor`, which already records the instant the job is
 * due, rather than from a new column or a second lookup of the user's settings.
 * For every non-wrapped job `scheduledFor` falls on `localDate`, so this is
 * exactly the previous behaviour.
 */
export function isJobDayCurrent(
  now: Date,
  job: { localDate: IsoDate; scheduledFor?: Date | null; timezone: string },
): boolean {
  try {
    /*
     * `scheduled_for` is NOT NULL in the schema, so the fallback is unreachable
     * for a real row. It is here because the failure it prevents is silent: a
     * job-shaped value without it would make this return false and the worker
     * would discard the notification as stale rather than send it. Falling back
     * to `localDate` is exactly the behaviour this replaced.
     */
    const anchor = job.scheduledFor ?? null;
    const firing = anchor ? toZonedDate(anchor, job.timezone) : job.localDate;
    return toZonedDate(now, job.timezone) === firing;
  } catch {
    return false;
  }
}
