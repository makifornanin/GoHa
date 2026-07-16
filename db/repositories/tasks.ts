import "server-only";

import { and, asc, eq } from "drizzle-orm";

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
