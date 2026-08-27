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
