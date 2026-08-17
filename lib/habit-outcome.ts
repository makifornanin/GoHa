import type { IsoDate } from "@/lib/date";

/**
 * The single definition of "how did this habit go on this day" (audit R-06).
 *
 * Three modules used to answer this question and two of them got it wrong.
 * A numeric habit logged BELOW its target is stored with status `done` (the
 * user did log something), so:
 *
 *  - Habits and Today ran the value against the target and correctly showed
 *    `partial`;
 *  - Calendar and the wide-window Progress/Review aggregations read the raw
 *    status and counted it as a completion.
 *
 * The same day therefore read as a success on one screen and a shortfall on
 * another, and the habit-completion percentage was inflated by every partial
 * day. Storing the derived answer was never an option (CLAUDE.md section 7), so
 * the fix is one pure function that every surface calls.
 *
 * Deliberately dependency-free and client-safe: the same call has to work in a
 * Server Component aggregating a year and in a cell renderer.
 */

/** The measurement rules that decide whether a logged value counts. */
export type HabitMeasure = {
  type: "boolean" | "numeric";
  /** The daily target for a numeric habit. Null for boolean habits. */
  targetValue: number | null;
  /** True when more is better (8 glasses); false for "at most" goals. */
  higherIsBetter: boolean;
};

/** A logged entry, already normalised out of its database row. */
export type LoggedEntry = {
  status: "done" | "missed" | "skipped";
  /** The recorded quantity for a numeric habit. Null for boolean habits. */
  value: number | null;
};

export type HabitOutcomeInput = {
  habit: HabitMeasure;
  /** The entry for this date, or null when nothing was logged. */
  entry: LoggedEntry | null;
  /** Whether the habit's schedule covers this date. */
  scheduled: boolean;
  /** The date being resolved. */
  date: IsoDate;
  /**
   * The user's local today, in the same timezone the date was derived in.
   * Required, not defaulted: a caller that gets this wrong turns today's
   * unlogged habit into a miss, and there is no safe guess for it.
   */
  today: IsoDate;
};

/**
 * How a habit day resolves.
 *
 *  - `done`         completed, and for numeric habits the target was met
 *  - `partial`      logged, but the numeric value fell short of the target
 *  - `missed`       explicitly not done, or a past scheduled day never logged
 *  - `skipped`      deliberately skipped; neutral, never counts either way
 *  - `pending`      scheduled today or later and not yet logged
 *  - `off_schedule` the habit was not due on this date
 */
export type HabitOutcome =
  | "done"
  | "partial"
  | "missed"
  | "skipped"
  | "pending"
  | "off_schedule";

/**
 * The outcomes reachable when an entry EXISTS. Never pending, never
 * off_schedule, because both of those describe the absence of a log.
 */
export type LoggedOutcome = Extract<
  HabitOutcome,
  "done" | "partial" | "missed" | "skipped"
>;

/**
 * Resolve a logged entry on its own, with no date context.
 *
 * Split out because a caller holding an entry has nothing to decide about
 * schedules or day boundaries, and making it invent a `today` just to satisfy a
 * signature is how wrong values get passed. The narrower return type also lets
 * the legacy wrappers map without a cast.
 */
export function loggedEntryOutcome(habit: HabitMeasure, entry: LoggedEntry): LoggedOutcome {
  if (entry.status === "skipped") return "skipped";
  if (entry.status === "missed") return "missed";
  // status === "done": for a numeric habit the value decides whether the
  // logged day actually met the target.
  if (habit.type === "numeric" && habit.targetValue !== null && entry.value !== null) {
    const met = habit.higherIsBetter
      ? entry.value >= habit.targetValue
      : entry.value <= habit.targetValue;
    return met ? "done" : "partial";
  }
  // A boolean habit, or a numeric habit with no target or no recorded value:
  // there is nothing to compare against, so the log stands as a completion.
  return "done";
}

/**
 * Resolve one habit-day.
 *
 * Precedence, which matters and is preserved exactly from the original
 * behaviour: a LOGGED ENTRY always wins, even on a day the habit was not
 * scheduled. Logging something on a rest day is a real act and it would be
 * wrong to hide it. Only when nothing is logged does the schedule decide, and
 * only a day already in the past can be a miss.
 */
export function habitOutcome(input: HabitOutcomeInput): HabitOutcome {
  const { habit, entry, scheduled, date, today } = input;

  if (entry) return loggedEntryOutcome(habit, entry);

  if (!scheduled) return "off_schedule";
  // Today is still in play, and the future has not happened yet.
  return date < today ? "missed" : "pending";
}

/**
 * Did this day count as a completion?
 *
 * `partial` is deliberately NOT a completion. A numeric habit that fell short
 * of its target did not meet it, and letting it count is what inflated the
 * habit-completion rate on Progress and Review.
 */
export function isCompleteOutcome(outcome: HabitOutcome): boolean {
  return outcome === "done";
}

/**
 * Should this day appear in a completion DENOMINATOR?
 *
 * `off_schedule` was never expected, and `skipped` is explicitly neutral:
 * counting either would penalise a habit for days it was never meant to run.
 */
export function countsTowardExpected(outcome: HabitOutcome): boolean {
  return outcome !== "off_schedule" && outcome !== "skipped";
}

/* -------------------------------------------------------------------------- */
/* Legacy vocabulary                                                          */
/*                                                                            */
/* The grid, the heatmap and the streak walker predate this module and use     */
/* shorter names. Mapping lives here, next to the definition, so the two       */
/* vocabularies cannot drift; nothing else should need to know both.           */
/* -------------------------------------------------------------------------- */

/** The four-value vocabulary `lib/habit-streaks` walks over. */
export type StreakOutcomeName = "done" | "partial" | "miss" | "skip";

/** The cell vocabulary `lib/habits.dayCellConfig` renders. */
export type DayCellStateName = StreakOutcomeName | "pending" | "off";

const TO_CELL_STATE: Record<HabitOutcome, DayCellStateName> = {
  done: "done",
  partial: "partial",
  missed: "miss",
  skipped: "skip",
  pending: "pending",
  off_schedule: "off",
};

/** Translate an outcome into the grid/heatmap cell vocabulary. */
export function toDayCellState(outcome: HabitOutcome): DayCellStateName {
  return TO_CELL_STATE[outcome];
}
