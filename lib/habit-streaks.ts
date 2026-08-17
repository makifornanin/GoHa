import { addDays, startOfWeek, weekdayOf, type IsoDate, type Weekday } from "@/lib/date";
import {
  habitOutcome,
  loggedEntryOutcome,
  type HabitMeasure,
  type LoggedEntry,
  type LoggedOutcome,
} from "@/lib/habit-outcome";

/**
 * Habit streak logic. Pure and framework-free so it is exhaustively unit-tested
 * (CLAUDE.md section 10) and never lives inside a component. Key rules:
 *
 *  - Schedule-aware: only SCHEDULED days can break a streak. Unscheduled days
 *    (e.g. Tuesday for a Mon/Wed/Fri habit) are ignored, not counted as misses.
 *  - Local dates throughout: callers pass `today` as the calendar date in the
 *    user's saved timezone, and entry dates are the same. No UTC truncation.
 *  - A scheduled day only becomes a miss once it is in the PAST (`date < today`).
 *    Today, if unlogged, is "pending" and never breaks the streak before it ends.
 *  - `skipped` days are neutral: they neither extend nor break a streak.
 *  - Numeric habits: a value that meets the target is `done`; a logged value
 *    below target is `partial` (not a completion; breaks a streak like a miss).
 *
 * What a day RESOLVES TO is no longer decided here. That definition moved to
 * lib/habit-outcome.ts so Calendar, Progress and Review could stop disagreeing
 * with this file (audit R-06); everything below consumes it.
 */

export type StreakOutcome = "done" | "partial" | "miss" | "skip";

/** Structurally the shared measure; the local name is kept for its callers. */
export type HabitLike = HabitMeasure;

export type ScheduleLike = {
  frequency: "daily" | "weekly" | "monthly";
  daysOfWeek: number[] | null;
  timesPerPeriod: number | null;
  startDate: IsoDate | null;
};

export type EntryLike = LoggedEntry & { entryDate: IsoDate };

export type Streaks = { current: number; longest: number };

const HORIZON_DAYS = 730;

/** The shared outcome vocabulary, in the shorter names this module's callers use. */
const LOGGED_TO_STREAK: Record<LoggedOutcome, StreakOutcome> = {
  done: "done",
  partial: "partial",
  missed: "miss",
  skipped: "skip",
};

/**
 * The display/streak outcome of a single entry, given its habit's target.
 *
 * Now a thin wrapper over lib/habit-outcome. It stays because the streak walker
 * and the history grid speak this four-value vocabulary, and renaming that
 * across every cell renderer would be a large diff for no behavioural gain.
 * The mapping is a total Record, so adding an outcome upstream fails the build
 * here rather than silently falling through.
 */
export function entryOutcome(habit: HabitLike, entry: EntryLike): StreakOutcome {
  return LOGGED_TO_STREAK[
    loggedEntryOutcome(habit, { status: entry.status, value: entry.value })
  ];
}

/** The weekdays a schedule targets, or null when it is not weekday-based. */
export function scheduledWeekdays(schedule: ScheduleLike): Set<Weekday> | null {
  if (schedule.frequency === "daily") return new Set([0, 1, 2, 3, 4, 5, 6] as Weekday[]);
  if (schedule.frequency === "weekly" && schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
    return new Set(schedule.daysOfWeek as Weekday[]);
  }
  // Weekly "X times per week" (no specific days) and monthly are not weekday-based.
  return null;
}

/** Whether a habit is due (eligible) on a local date. */
export function isDayScheduled(schedule: ScheduleLike, date: IsoDate): boolean {
  if (schedule.startDate && date < schedule.startDate) return false;
  const weekdays = scheduledWeekdays(schedule);
  if (!weekdays) return true; // times-per-week: every day is eligible
  return weekdays.has(weekdayOf(date));
}

/** Current and longest streak for a habit, respecting its schedule. */
export function computeHabitStreaks(params: {
  habit: HabitLike;
  schedule: ScheduleLike;
  entries: EntryLike[];
  today: IsoDate;
  weekStartsOn?: Weekday;
}): Streaks {
  const weekdays = scheduledWeekdays(params.schedule);
  return weekdays
    ? dayBasedStreaks(params, weekdays)
    : weekBasedStreaks(params);
}

function dayBasedStreaks(
  params: { habit: HabitLike; schedule: ScheduleLike; entries: EntryLike[]; today: IsoDate },
  weekdays: Set<Weekday>,
): Streaks {
  const { habit, schedule, entries, today } = params;

  const entryByDate = new Map<IsoDate, EntryLike>();
  for (const entry of entries) entryByDate.set(entry.entryDate, entry);

  const entryDates = entries.map((e) => e.entryDate).sort();
  const floor = addDays(today, -HORIZON_DAYS);
  let start = schedule.startDate ?? entryDates[0] ?? today;
  if (start < floor) start = floor;
  if (start > today) return { current: 0, longest: 0 };

  const scheduledDates: IsoDate[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (weekdays.has(weekdayOf(d))) scheduledDates.push(d);
  }

  /*
   * Resolve a scheduled date through the SHARED definition rather than
   * re-deriving it. The "past day with no entry is a miss, today is pending"
   * rule used to be written out here as well as in habit-view, which is exactly
   * how the three copies drifted (audit R-06).
   *
   * `scheduled: true` is correct: this is only ever called with dates already
   * filtered to the habit's schedule, so off_schedule is unreachable. It maps
   * to pending anyway, because neutral is the safe reading of a day the habit
   * was never due on.
   */
  const resolve = (date: IsoDate): StreakOutcome | "pending" => {
    const outcome = habitOutcome({
      habit,
      entry: entryByDate.get(date) ?? null,
      scheduled: true,
      date,
      today,
    });
    if (outcome === "pending" || outcome === "off_schedule") return "pending";
    return LOGGED_TO_STREAK[outcome];
  };

  let longest = 0;
  let run = 0;
  for (const date of scheduledDates) {
    const outcome = resolve(date);
    if (outcome === "done") {
      run += 1;
      longest = Math.max(longest, run);
    } else if (outcome === "skip" || outcome === "pending") {
      // neutral: preserve the run
    } else {
      run = 0; // miss or partial
    }
  }

  let current = 0;
  for (let i = scheduledDates.length - 1; i >= 0; i -= 1) {
    const outcome = resolve(scheduledDates[i]);
    if (outcome === "done") current += 1;
    else if (outcome === "skip" || outcome === "pending") continue;
    else break; // miss or partial breaks the current streak
  }

  return { current, longest };
}

/** Week-based streak for "X times per week" habits: consecutive weeks hitting X. */
function weekBasedStreaks(params: {
  habit: HabitLike;
  schedule: ScheduleLike;
  entries: EntryLike[];
  today: IsoDate;
  weekStartsOn?: Weekday;
}): Streaks {
  const { habit, schedule, entries, today } = params;
  const weekStartsOn = params.weekStartsOn ?? 1;
  const target = Math.max(1, schedule.timesPerPeriod ?? 1);

  const doneByWeek = new Map<IsoDate, number>();
  for (const entry of entries) {
    if (entryOutcome(habit, entry) !== "done") continue;
    const week = startOfWeek(entry.entryDate, weekStartsOn);
    doneByWeek.set(week, (doneByWeek.get(week) ?? 0) + 1);
  }

  const currentWeek = startOfWeek(today, weekStartsOn);
  const floorWeek = startOfWeek(addDays(today, -HORIZON_DAYS), weekStartsOn);
  const entryWeeks = [...doneByWeek.keys()].sort();
  let start = schedule.startDate ? startOfWeek(schedule.startDate, weekStartsOn) : entryWeeks[0] ?? currentWeek;
  if (start < floorWeek) start = floorWeek;
  if (start > currentWeek) return { current: 0, longest: 0 };

  const weeks: IsoDate[] = [];
  for (let w = start; w <= currentWeek; w = addDays(w, 7)) weeks.push(w);

  const isSuccess = (week: IsoDate) => (doneByWeek.get(week) ?? 0) >= target;

  let longest = 0;
  let run = 0;
  for (const week of weeks) {
    if (isSuccess(week)) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (week === currentWeek) {
      // in-progress week not yet met: neutral, does not break
    } else {
      run = 0;
    }
  }

  let current = 0;
  for (let i = weeks.length - 1; i >= 0; i -= 1) {
    const week = weeks[i];
    if (isSuccess(week)) current += 1;
    else if (week === currentWeek) continue; // pending week is neutral
    else break;
  }

  return { current, longest };
}
