import {
  MANILA_TZ,
  toZonedDate,
  zonedBucketRange,
  type DateBucket,
  type IsoDate,
  type Weekday,
} from "@/lib/date";

/**
 * Pure, timezone-aware bucketing for tasks (CLAUDE.md sections 6 and 7). There is
 * no stored `bucket` column: a task's view membership is derived from its real
 * scheduling fields against the user's local date ranges (Asia/Manila by
 * default). Injecting `now` keeps this deterministic and unit-testable.
 */

export type TaskDateFields = { scheduledFor: string | null; dueAt: Date | null };
export type TaskStatusLike = "todo" | "in_progress" | "completed" | "cancelled";

/** The list views on the Tasks page: Inbox, the timeframe buckets, Done, and All. */
export type TaskViewKey = "inbox" | DateBucket | "done" | "all";

const ACTIVE_STATUSES: ReadonlySet<TaskStatusLike> = new Set(["todo", "in_progress"]);

/**
 * The single local date a task is anchored to: its `scheduledFor` if planned,
 * otherwise the local calendar date of its `dueAt` deadline, otherwise none
 * (an Inbox task). This is what every timeframe view is derived from.
 */
export function taskEffectiveDate(task: TaskDateFields, timeZone: string = MANILA_TZ): IsoDate | null {
  if (task.scheduledFor) return task.scheduledFor;
  if (task.dueAt) return toZonedDate(task.dueAt, timeZone);
  return null;
}

/**
 * Whether a local date falls inside a timeframe bucket, using the half-open
 * local range `[start, endExclusive)`. ISO date strings compare lexically.
 */
export function isInBucket(
  effectiveDate: IsoDate | null,
  bucket: DateBucket,
  now: Date = new Date(),
  weekStartsOn: Weekday = 1,
  timeZone: string = MANILA_TZ,
): boolean {
  if (!effectiveDate) return false;
  const { start, endExclusive } = zonedBucketRange(bucket, now, weekStartsOn, timeZone);
  return effectiveDate >= start && effectiveDate < endExclusive;
}

/**
 * Whether a task belongs in a given view:
 *  - `all`: every task, any status.
 *  - `done`: completed tasks.
 *  - `inbox`: active (todo/in_progress) tasks with no scheduled or due date.
 *  - timeframe buckets: active tasks whose effective date is in range.
 * Completed and cancelled tasks never appear in Inbox or the timeframe views.
 */
export function taskMatchesView(
  task: TaskDateFields & { status: TaskStatusLike },
  view: TaskViewKey,
  now: Date = new Date(),
  weekStartsOn: Weekday = 1,
  timeZone: string = MANILA_TZ,
): boolean {
  if (view === "all") return true;
  if (view === "done") return task.status === "completed";
  if (view === "inbox") {
    return ACTIVE_STATUSES.has(task.status) && taskEffectiveDate(task, timeZone) === null;
  }
  return (
    ACTIVE_STATUSES.has(task.status) &&
    isInBucket(taskEffectiveDate(task, timeZone), view, now, weekStartsOn, timeZone)
  );
}

/* ------------------------------------------------------------------ */
/* Independent WHEN / WHAT-STATE filters                               */
/*                                                                     */
/* The single `TaskViewKey` list conflated two questions ("when is it  */
/* scheduled" and "what state is it in"), so Done and the timeframes   */
/* were mutually exclusive and there was no way to ask for, say,       */
/* "this week's in-progress work". These two axes compose freely.      */
/* ------------------------------------------------------------------ */

/** WHEN a task is scheduled. Independent of its progress. */
export type TaskTimeframeKey = "all" | "inbox" | DateBucket;

/** WHAT STATE a task is in. `late` is derived, not stored. */
export type TaskProgressKey =
  | "all"
  | "todo"
  | "in_progress"
  | "late"
  | "done"
  | "cancelled";

/**
 * Active work whose effective date has already passed. Derived from the date,
 * never stored, so it can never drift out of sync (CLAUDE.md section 7).
 */
export function isTaskLate(
  task: TaskDateFields & { status: TaskStatusLike },
  now: Date = new Date(),
  timeZone: string = MANILA_TZ,
): boolean {
  if (!ACTIVE_STATUSES.has(task.status)) return false;
  const effective = taskEffectiveDate(task, timeZone);
  if (effective === null) return false;
  return effective < toZonedDate(now, timeZone);
}

/** Timeframe membership only. Status is deliberately NOT considered here. */
export function taskMatchesTimeframe(
  task: TaskDateFields,
  timeframe: TaskTimeframeKey,
  now: Date = new Date(),
  weekStartsOn: Weekday = 1,
  timeZone: string = MANILA_TZ,
): boolean {
  if (timeframe === "all") return true;
  const effective = taskEffectiveDate(task, timeZone);
  if (timeframe === "inbox") return effective === null;
  return isInBucket(effective, timeframe, now, weekStartsOn, timeZone);
}

/**
 * Progress membership. `all` means the normal working set: everything except
 * cancelled work, which stays available under its own explicit option.
 */
export function taskMatchesProgress(
  task: TaskDateFields & { status: TaskStatusLike },
  progress: TaskProgressKey,
  now: Date = new Date(),
  timeZone: string = MANILA_TZ,
): boolean {
  switch (progress) {
    case "all":
      return task.status !== "cancelled";
    case "todo":
      return task.status === "todo";
    case "in_progress":
      return task.status === "in_progress";
    case "late":
      return isTaskLate(task, now, timeZone);
    case "done":
      return task.status === "completed";
    case "cancelled":
      return task.status === "cancelled";
  }
}
