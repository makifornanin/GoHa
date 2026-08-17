import type { Task } from "@/db";
import { toZonedDate, type IsoDate } from "@/lib/date";

/**
 * The weekly graveyard sweep (automation Guide 05).
 *
 * Three kinds of rot, one deliberate decision asked for each. The thresholds
 * live here, in one place, so tuning them is a single edit rather than a hunt
 * through a workflow.
 *
 * Subtasks are excluded throughout: the parent represents them, and a digest
 * that lists both is asking the same question twice.
 */

/** In-progress and untouched for this long. */
export const STUCK_DAYS = 14;
/** Past its due date by this much, still open. */
export const LONG_OVERDUE_DAYS = 30;
/** Undated, ungoaled, and this old. */
export const ZOMBIE_DAYS = 45;
/** Recent attention means it is not rotting, whatever its age says. */
export const RECENT_TOUCH_DAYS = 7;
/** Per bucket, so a badly rotted backlog stays readable. */
export const BUCKET_CAP = 10;

export type GraveyardBucket = "stuck" | "longOverdue" | "zombieInbox";

export type GraveyardItem = {
  id: string;
  title: string;
  status: Task["status"];
  priority: Task["priority"];
  bucket: GraveyardBucket;
  ageDays: number;
  overdueDays: number | null;
  goalTitle: string | null;
  description: string | null;
  /** How many previous digests named this exact task. */
  repeatCount: number;
  recommendation: string;
};

export type GraveyardPayload = {
  localDate: IsoDate;
  timezone: string;
  isSabbath: boolean;
  generatedAt: string;
  stuck: { items: GraveyardItem[]; totalCount: number };
  longOverdue: { items: GraveyardItem[]; totalCount: number };
  zombieInbox: { items: GraveyardItem[]; totalCount: number };
  total: number;
};

/**
 * The recommendation must match the bucket (Guide 05, revision highlight).
 *
 * Stated here rather than left to the narrator: a model asked to suggest an
 * action for a rotting task will eventually suggest "just do it", which is not
 * a decision and not what any of these buckets need.
 */
const RECOMMENDATION: Record<GraveyardBucket, string> = {
  stuck: "Break it down.",
  longOverdue: "Cancel or reschedule.",
  zombieInbox: "Cancel, or link it to a goal.",
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/** Trimmed so a long description cannot dominate the digest. */
function trimDescription(value: string | null): string | null {
  if (!value) return null;
  const text = value.trim();
  if (text.length <= 160) return text || null;
  return `${text.slice(0, 157)}...`;
}

export function buildGraveyardPayload(params: {
  tasks: Task[];
  goalTitles: Map<string, string>;
  /** taskId -> how many earlier digests named it. */
  repeats: Map<string, number>;
  today: IsoDate;
  timeZone: string;
  isSabbath: boolean;
  now: Date;
}): GraveyardPayload {
  const { now } = params;
  const stuck: GraveyardItem[] = [];
  const longOverdue: GraveyardItem[] = [];
  const zombieInbox: GraveyardItem[] = [];

  for (const task of params.tasks) {
    // The parent stands for its subtasks; listing both asks twice.
    if (task.parentTaskId) continue;
    if (task.status === "completed" || task.status === "cancelled") continue;

    const ageDays = daysBetween(task.createdAt, now);
    const touchedDays = daysBetween(task.updatedAt, now);
    const base = {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      ageDays,
      goalTitle: task.goalId ? params.goalTitles.get(task.goalId) ?? null : null,
      description: trimDescription(task.description),
      repeatCount: params.repeats.get(task.id) ?? 0,
    };

    if (task.status === "in_progress" && touchedDays >= STUCK_DAYS) {
      stuck.push({
        ...base,
        bucket: "stuck",
        overdueDays: null,
        recommendation: RECOMMENDATION.stuck,
      });
      continue;
    }

    if (task.dueAt) {
      const overdueDays = daysBetween(task.dueAt, now);
      if (overdueDays > LONG_OVERDUE_DAYS) {
        longOverdue.push({
          ...base,
          bucket: "longOverdue",
          overdueDays,
          recommendation: RECOMMENDATION.longOverdue,
        });
      }
      continue;
    }

    const undated = !task.scheduledFor && !task.dueAt && !task.goalId;
    if (
      undated &&
      task.status === "todo" &&
      ageDays >= ZOMBIE_DAYS &&
      // Recent attention means it is not rotting, whatever its age says.
      touchedDays >= RECENT_TOUCH_DAYS
    ) {
      zombieInbox.push({
        ...base,
        bucket: "zombieInbox",
        overdueDays: null,
        recommendation: RECOMMENDATION.zombieInbox,
      });
    }
  }

  // Worst first within each bucket, and the cap keeps the digest readable
  // while `totalCount` keeps it honest about how much was left out.
  const cap = (items: GraveyardItem[], sort: (a: GraveyardItem, b: GraveyardItem) => number) => {
    const sorted = [...items].sort(sort);
    return { items: sorted.slice(0, BUCKET_CAP), totalCount: sorted.length };
  };

  return {
    localDate: params.today,
    timezone: params.timeZone,
    isSabbath: params.isSabbath,
    generatedAt: now.toISOString(),
    stuck: cap(stuck, (a, b) => b.repeatCount - a.repeatCount || b.ageDays - a.ageDays),
    longOverdue: cap(
      longOverdue,
      (a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0),
    ),
    zombieInbox: cap(zombieInbox, (a, b) => b.ageDays - a.ageDays),
    total: stuck.length + longOverdue.length + zombieInbox.length,
  };
}

/**
 * Count how many earlier digests named each task.
 *
 * By TASK ID out of the stored payload, never by title (Guide 05, step 1.4).
 * Two different tasks called "follow up" must not share a repeat history, and
 * renaming a task must not reset the count that says it has been ignored three
 * weeks running.
 */
export function countRepeats(priorPayloads: unknown[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const payload of priorPayloads) {
    const ids = extractTaskIds(payload);
    // A task named twice in one digest is still one appearance.
    for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function extractTaskIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const direct = record.taskIds;
  if (Array.isArray(direct)) return direct.filter((id): id is string => typeof id === "string");

  // Fall back to walking the stored buckets, so a payload written by an older
  // workflow shape still contributes its history.
  const ids: string[] = [];
  for (const value of Object.values(record)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string") {
        ids.push((entry as { id: string }).id);
      }
    }
  }
  return ids;
}

/** The digest's own key: one per ISO week. */
export function graveyardKey(date: IsoDate): string {
  return `graveyard:${isoWeek(date)}`;
}

/** ISO-8601 week string, e.g. "2026-W34". */
export function isoWeek(date: IsoDate): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  // Thursday decides the year an ISO week belongs to.
  const dayNumber = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Local "today" for a graveyard run, kept here so the route stays thin. */
export function graveyardToday(now: Date, timeZone: string): IsoDate {
  return toZonedDate(now, timeZone);
}
