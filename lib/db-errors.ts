/**
 * Reading PostgreSQL constraint failures.
 *
 * The database now carries invariants the application also tries to keep:
 * one owner, one running focus session, one active schedule per habit, one
 * pinned slot per task per day (audit R-08). When two requests race, the loser
 * comes back as a constraint violation rather than as a bug, so callers need to
 * tell "you cannot do that" apart from "something is broken" without matching
 * on error text.
 *
 * Pure and driver-agnostic: it reads the standard SQLSTATE fields that
 * @neondatabase/serverless surfaces on its errors, and never imports the client.
 */

/** SQLSTATE 23505: unique_violation. */
export const UNIQUE_VIOLATION = "23505";
/** SQLSTATE 23514: check_violation. */
export const CHECK_VIOLATION = "23514";

type PgErrorShape = { code?: unknown; constraint?: unknown; cause?: unknown };

function asPgError(error: unknown): PgErrorShape | null {
  return error && typeof error === "object" ? (error as PgErrorShape) : null;
}

/** The SQLSTATE of an error, unwrapping one level of `cause`. */
export function sqlState(error: unknown): string | null {
  const candidate = asPgError(error);
  if (!candidate) return null;
  if (typeof candidate.code === "string") return candidate.code;
  const cause = asPgError(candidate.cause);
  return cause && typeof cause.code === "string" ? cause.code : null;
}

/** The constraint that failed, when the driver reports one. */
export function violatedConstraint(error: unknown): string | null {
  const candidate = asPgError(error);
  if (!candidate) return null;
  if (typeof candidate.constraint === "string") return candidate.constraint;
  const cause = asPgError(candidate.cause);
  return cause && typeof cause.constraint === "string" ? cause.constraint : null;
}

/**
 * Whether this is a unique violation, optionally of one specific constraint.
 *
 * Without a name it answers "someone got there first". With a name it answers
 * "this exact rule stopped it", which is what a caller needs before turning a
 * failure into a sentence for the person who is reading the screen.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (sqlState(error) !== UNIQUE_VIOLATION) return false;
  if (!constraint) return true;
  return violatedConstraint(error) === constraint;
}

/** Whether a CHECK constraint rejected the write. */
export function isCheckViolation(error: unknown, constraint?: string): boolean {
  if (sqlState(error) !== CHECK_VIOLATION) return false;
  if (!constraint) return true;
  return violatedConstraint(error) === constraint;
}

/** The constraint names the application reacts to by name. */
export const CONSTRAINTS = {
  singleOwner: "user_single_owner_uq",
  oneActiveFocusSession: "focus_sessions_one_active_per_user_uq",
  oneActiveHabitSchedule: "habit_schedules_one_active_per_habit_uq",
  onePriorityPerTaskPerDay: "daily_priorities_user_date_task_uq",
  onePriorityPerSlot: "daily_priorities_user_date_position_uq",
} as const;
