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
