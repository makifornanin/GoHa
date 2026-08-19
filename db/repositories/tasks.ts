import "server-only";

import { and, asc, eq, isNull, isNotNull } from "drizzle-orm";

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
  parentTaskId?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  scheduledFor?: string | null;
  scheduledTime?: string | null;
  dueAt?: Date | null;
  estimateMinutes?: number | null;
  sortOrder?: number;
};

/**
 * A user's TOP-LEVEL tasks (any status). Subtasks are deliberately excluded:
 * they are checklist steps belonging to a parent, and every consumer of this
 * function (the To-dos list, Today, the Focus picker, the Task Map link picker)
 * wants real work items, not the steps inside them. Fetch those with
 * `listSubtasksForUser`.
 */
export async function listTasksForUser(userId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.parentTaskId)))
    .orderBy(asc(tasks.sortOrder), asc(tasks.scheduledFor), asc(tasks.createdAt));
}

/**
 * Every subtask the user owns, oldest first, for grouping under their parents.
 * One query for the whole page rather than one per opened task: a personal
 * system's checklist steps are few, and the detail panel must open instantly.
 */
export async function listSubtasksForUser(userId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNotNull(tasks.parentTaskId)))
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

/**
 * Add a checklist step to a task.
 *
 * A subtask carries ONLY a title and its parent: no goal, no life area, no
 * dates. That is deliberate. Goal progress and the life-area rollups count
 * tasks by `goal_id` / `life_area_id`, so giving steps those links would inflate
 * both denominators and make a goal look less complete the more finely its work
 * was broken down. Steps belong to their parent; the parent belongs to the goal.
 */
export async function createSubtask(
  userId: string,
  parentTaskId: string,
  title: string,
): Promise<Task> {
  const [row] = await db
    .insert(tasks)
    .values({ userId, parentTaskId, title })
    .returning();
  return row;
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
