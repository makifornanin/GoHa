import "server-only";

import { and, asc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";

import { manilaBucketRange, type DateBucket, type Weekday } from "@/lib/date";
import { db } from "../client";
import { tasks } from "../schema";
import type { Priority, TaskStatus } from "../schema";
import type { Task } from "../types";

/**
 * Tasks repository. User-scoped throughout. Date-derived views are computed from
 * `scheduledFor` / `dueAt` via `lib/date` + `lib/task-buckets`; there is no
 * stored `bucket` (CLAUDE.md section 7).
 */

export type TaskInput = {
  title: string;
  description?: string | null;
  goalId?: string | null;
  lifeAreaId?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  scheduledFor?: string | null;
  dueAt?: Date | null;
  estimateMinutes?: number | null;
  sortOrder?: number;
};

/** All of a user's tasks (any status). The Tasks page filters/sorts client-side. */
export async function listTasksForUser(userId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.sortOrder), asc(tasks.scheduledFor), asc(tasks.createdAt));
}

export type TaskListFilter = {
  status?: TaskStatus;
  goalId?: string | null;
  lifeAreaId?: string | null;
  includeCompleted?: boolean;
};

export async function listTasks(userId: string, filter: TaskListFilter = {}): Promise<Task[]> {
  const filters = [eq(tasks.userId, userId)];
  if (filter.status) filters.push(eq(tasks.status, filter.status));
  if (!filter.status && !filter.includeCompleted) filters.push(ne(tasks.status, "completed"));
  if (filter.goalId !== undefined) {
    filters.push(filter.goalId === null ? isNull(tasks.goalId) : eq(tasks.goalId, filter.goalId));
  }
  if (filter.lifeAreaId !== undefined) {
    filters.push(
      filter.lifeAreaId === null ? isNull(tasks.lifeAreaId) : eq(tasks.lifeAreaId, filter.lifeAreaId),
    );
  }
  return db
    .select()
    .from(tasks)
    .where(and(...filters))
    .orderBy(asc(tasks.sortOrder), asc(tasks.scheduledFor), asc(tasks.createdAt));
}

/**
 * Tasks scheduled within a date-derived bucket (Today/Week/Month/Quarter/Year),
 * computed in Asia/Manila. Completed tasks are excluded by default. (Used by the
 * Today dashboard; the Tasks page filters client-side.)
 */
export async function listTasksForBucket(
  userId: string,
  bucket: DateBucket,
  options: { now?: Date; weekStartsOn?: Weekday; includeCompleted?: boolean } = {},
): Promise<Task[]> {
  const range = manilaBucketRange(bucket, options.now, options.weekStartsOn);
  const filters = [
    eq(tasks.userId, userId),
    gte(tasks.scheduledFor, range.start),
    lt(tasks.scheduledFor, range.endExclusive),
  ];
  if (!options.includeCompleted) filters.push(ne(tasks.status, "completed"));
  return db
    .select()
    .from(tasks)
    .where(and(...filters))
    .orderBy(asc(tasks.scheduledFor), asc(tasks.sortOrder), asc(tasks.createdAt));
}

/** Inbox: unscheduled, active tasks (no scheduledFor and no dueAt). */
export async function listInboxTasks(userId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.scheduledFor),
        isNull(tasks.dueAt),
        ne(tasks.status, "completed"),
        ne(tasks.status, "cancelled"),
      ),
    )
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));
}

export async function getTask(userId: string, id: string): Promise<Task | null> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createTask(userId: string, input: TaskInput): Promise<Task> {
  const completedAt = input.status === "completed" ? new Date() : null;
  const [row] = await db
    .insert(tasks)
    .values({ ...input, userId, completedAt })
    .returning();
  return row;
}

export async function updateTask(
  userId: string,
  id: string,
  input: Partial<TaskInput> & { completedAt?: Date | null; completionNote?: string | null },
): Promise<Task | null> {
  const [row] = await db
    .update(tasks)
    .set(input)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Mark a task completed and stamp `completedAt`, optionally storing completion
 * feedback. Linked goal progress is derived from these counts on read, so no
 * recompute is needed (CLAUDE.md section 7, one connected system).
 */
export async function completeTask(
  userId: string,
  id: string,
  options: { completionNote?: string | null } = {},
): Promise<Task | null> {
  const [row] = await db
    .update(tasks)
    .set({
      status: "completed",
      completedAt: new Date(),
      ...(options.completionNote !== undefined ? { completionNote: options.completionNote } : {}),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();
  return row ?? null;
}

export async function reopenTask(userId: string, id: string): Promise<Task | null> {
  const [row] = await db
    .update(tasks)
    .set({ status: "todo", completedAt: null })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();
  return row ?? null;
}

export async function cancelTask(userId: string, id: string): Promise<Task | null> {
  const [row] = await db
    .update(tasks)
    .set({ status: "cancelled", completedAt: null })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();
  return row ?? null;
}

/** Add or edit persistent completion feedback (during or after completion). */
export async function setCompletionNote(
  userId: string,
  id: string,
  completionNote: string | null,
): Promise<Task | null> {
  const [row] = await db
    .update(tasks)
    .set({ completionNote })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteTask(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning({ id: tasks.id });
  return rows.length > 0;
}

/** Count of completed vs total tasks for a goal, used by derived goal progress. */
export async function countTasksByGoal(
  userId: string,
  goalId: string,
): Promise<{ total: number; completed: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.goalId, goalId)));
  return { total: row?.total ?? 0, completed: row?.completed ?? 0 };
}
