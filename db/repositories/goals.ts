import "server-only";

import { and, asc, desc, eq, getTableColumns, isNotNull, sql } from "drizzle-orm";

import { db } from "../client";
import { goalProgressUpdates, goals, tasks } from "../schema";
import type { GoalProgressMode, GoalStatus, GoalTimeframe } from "../schema";
import type { Goal, GoalProgressUpdate } from "../types";

/**
 * Goals repository (goals + goal_progress_updates). Every function is
 * user-scoped. Progress itself is not stored: task counts are returned so the
 * pure calculator in lib/goal-progress.ts can derive it (CLAUDE.md section 7).
 */

/** Fields a client may set. `id`, `userId`, audit, and `completedAt` are managed. */
export type GoalInput = {
  title: string;
  description?: string | null;
  lifeAreaId?: string | null;
  parentGoalId?: string | null;
  status?: GoalStatus;
  timeframe?: GoalTimeframe | null;
  progressMode?: GoalProgressMode;
  manualProgress?: number | null;
  startDate?: string | null;
  targetDate?: string | null;
  sortOrder?: number;
};

/** Internal update shape: user fields plus the server-managed `completedAt`. */
export type GoalUpdate = Partial<GoalInput> & { completedAt?: Date | null };

/** A goal plus its linked-task counts, for deriving progress. */
export type GoalWithCounts = Goal & {
  totalTasks: number;
  completedTasks: number;
  cancelledTasks: number;
};

export async function listGoalsWithTaskCounts(
  userId: string,
  options: { timeframe?: GoalTimeframe | null; includeArchived?: boolean } = {},
): Promise<GoalWithCounts[]> {
  const filters = [eq(goals.userId, userId)];
  if (!options.includeArchived) filters.push(eq(goals.isArchived, false));
  if (options.timeframe) filters.push(eq(goals.timeframe, options.timeframe));

  // Per-goal task counts as a single grouped-aggregate subquery joined to goals.
  // NOTE: an earlier version used correlated subqueries
  // (`... where ${tasks.goalId} = ${goals.id}`), but Drizzle renders the outer
  // goal columns UNQUALIFIED inside a `sql` template (`where "goal_id" = "id"`),
  // so they bound to the inner `tasks` table and every count came back 0. This
  // join form references each table's columns unambiguously and is one pass.
  const counts = db
    .select({
      goalId: tasks.goalId,
      totalTasks: sql<number>`count(*)::int`.as("total_tasks"),
      completedTasks: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`.as("completed_tasks"),
      cancelledTasks: sql<number>`count(*) filter (where ${tasks.status} = 'cancelled')::int`.as("cancelled_tasks"),
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNotNull(tasks.goalId)))
    .groupBy(tasks.goalId)
    .as("counts");

  return db
    .select({
      ...getTableColumns(goals),
      totalTasks: sql<number>`coalesce(${counts.totalTasks}, 0)`,
      completedTasks: sql<number>`coalesce(${counts.completedTasks}, 0)`,
      cancelledTasks: sql<number>`coalesce(${counts.cancelledTasks}, 0)`,
    })
    .from(goals)
    .leftJoin(counts, eq(counts.goalId, goals.id))
    .where(and(...filters))
    .orderBy(asc(goals.sortOrder), asc(goals.createdAt));
}

/** Lightweight list (no counts), e.g. to populate the parent-goal selector. */
export async function listGoals(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Goal[]> {
  const filters = [eq(goals.userId, userId)];
  if (!options.includeArchived) filters.push(eq(goals.isArchived, false));
  return db
    .select()
    .from(goals)
    .where(and(...filters))
    .orderBy(asc(goals.sortOrder), asc(goals.createdAt));
}

export async function getGoal(userId: string, id: string): Promise<Goal | null> {
  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Linked-task counts for a single goal (used by the manual/detail surfaces). */
export async function getTaskCounts(
  userId: string,
  goalId: string,
): Promise<{ total: number; completed: number; cancelled: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      cancelled: sql<number>`count(*) filter (where ${tasks.status} = 'cancelled')::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.goalId, goalId)));
  return {
    total: row?.total ?? 0,
    completed: row?.completed ?? 0,
    cancelled: row?.cancelled ?? 0,
  };
}

export async function createGoal(userId: string, input: GoalInput): Promise<Goal> {
  const completedAt = input.status === "completed" ? new Date() : null;
  const [row] = await db
    .insert(goals)
    .values({ ...input, userId, completedAt })
    .returning();
  return row;
}

export async function updateGoal(
  userId: string,
  id: string,
  values: GoalUpdate,
): Promise<Goal | null> {
  const [row] = await db
    .update(goals)
    .set(values)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .returning();
  return row ?? null;
}

export async function archiveGoal(userId: string, id: string): Promise<Goal | null> {
  const [row] = await db
    .update(goals)
    .set({ isArchived: true, archivedAt: new Date() })
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .returning();
  return row ?? null;
}

export async function restoreGoal(userId: string, id: string): Promise<Goal | null> {
  const [row] = await db
    .update(goals)
    .set({ isArchived: false, archivedAt: null })
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Walk the parent chain upward from `goalId`, returning the set of ancestor ids.
 * Used to prevent hierarchy cycles when assigning a parent. Bounded to avoid
 * looping on any pre-existing bad data.
 */
export async function collectAncestorIds(userId: string, goalId: string): Promise<Set<string>> {
  const ancestors = new Set<string>();
  let current = await getGoal(userId, goalId);
  let guard = 0;
  while (current?.parentGoalId && guard < 100) {
    if (ancestors.has(current.parentGoalId)) break;
    ancestors.add(current.parentGoalId);
    current = await getGoal(userId, current.parentGoalId);
    guard += 1;
  }
  return ancestors;
}

/** Append a progress snapshot to the goal's journal (intentional updates only). */
export async function addGoalProgressUpdate(
  userId: string,
  goalId: string,
  progress: number,
  note?: string | null,
): Promise<GoalProgressUpdate> {
  const [row] = await db
    .insert(goalProgressUpdates)
    .values({ userId, goalId, progress, note: note ?? null })
    .returning();
  return row;
}

export async function listGoalProgressUpdates(
  userId: string,
  goalId: string,
): Promise<GoalProgressUpdate[]> {
  return db
    .select()
    .from(goalProgressUpdates)
    .where(and(eq(goalProgressUpdates.userId, userId), eq(goalProgressUpdates.goalId, goalId)))
    .orderBy(desc(goalProgressUpdates.createdAt));
}
