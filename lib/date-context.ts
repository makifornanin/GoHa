import { getZonedParts, startOfWeek, zonedToday, type IsoDate, type Weekday } from "@/lib/date";

/**
 * The date context: who "today" is for, resolved once (audit R-15).
 *
 * GoHa is timezone-aware everywhere it matters, but the plumbing was optional.
 * Helpers defaulted their `timeZone` parameter to Asia/Manila, so a caller that
 * simply forgot to thread it through still compiled, still worked for the owner,
 * and was silently wrong for anyone else. Two of those omissions reached real
 * data: focus sessions stamped their `session_date` in Manila regardless of the
 * saved timezone, and the Settings export named and bounded its file the same
 * way.
 *
 * A context object fixes that by making the dependency explicit and singular:
 * one thing to pass, no defaults, and it carries `now` so a caller cannot
 * resolve "today" twice and straddle midnight between the two calls.
 *
 * Pure and client-safe. The server-side constructor that reads user settings
 * lives in lib/user-settings.ts, which is the module already allowed to touch
 * the database.
 */
export type DateContext = {
  /** IANA timezone from the user's settings. */
  timeZone: string;
  /** 0=Sunday .. 6=Saturday, from the user's settings. */
  weekStartsOn: Weekday;
  /** The instant this context was built. */
  now: Date;
  /** The local calendar date `now` falls on, in `timeZone`. */
  today: IsoDate;
  /** Local hour 0-23, for time-of-day decisions. */
  hour: number;
};

/**
 * Build a context from an explicit timezone and week start.
 *
 * `now` is injectable so every consumer is deterministic under test, which is
 * how the midnight-boundary cases get covered at all.
 */
export function makeDateContext(input: {
  timeZone: string;
  weekStartsOn: Weekday;
  now?: Date;
}): DateContext {
  const now = input.now ?? new Date();
  const parts = getZonedParts(now, input.timeZone);
  return {
    timeZone: input.timeZone,
    weekStartsOn: input.weekStartsOn,
    now,
    today: zonedToday(now, input.timeZone),
    hour: parts.hour,
  };
}

/** The local date the current week began on, for this context. */
export function contextWeekStart(context: DateContext): IsoDate {
  return startOfWeek(context.today, context.weekStartsOn);
}
