import "server-only";

import { and, asc, eq, getTableColumns, isNotNull, sql } from "drizzle-orm";

import { db } from "../client";
import { goals, habits, lifeAreas, tasks } from "../schema";
import type { LifeArea } from "../types";

/**
 * Life Areas repository. Every function is user-scoped: the caller passes the
 * session user id (derived from the authenticated session, never from client
 * input, per CLAUDE.md section 5) and every query filters by it.
 */

/** Fields a client may set. `id`, `userId`, and audit columns are never accepted. */
export type LifeAreaInput = {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  weight?: number;
  sortOrder?: number;
};

export async function listLifeAreas(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<LifeArea[]> {
  const where = options.includeArchived
    ? eq(lifeAreas.userId, userId)
    : and(eq(lifeAreas.userId, userId), eq(lifeAreas.isArchived, false));
  return db
    .select()
    .from(lifeAreas)
    .where(where)
    .orderBy(asc(lifeAreas.sortOrder), asc(lifeAreas.createdAt));
}

/** A life area plus what actually lives inside it. */
export type LifeAreaWithCounts = LifeArea & {
  activeGoals: number;
  openTasks: number;
  completedTasks: number;
  activeHabits: number;
};

/**
 * Life areas with their rollups, so the page can say what each area CONTAINS
 * rather than only what it is called. One pass: three grouped aggregates joined
 * onto the areas, never a query per card.
 *
 * Each aggregate is filtered by `userId` in its own subquery as well as by the
 * join, so a row can never be counted across users (CLAUDE.md section 5).
 */
export async function listLifeAreasWithCounts(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<LifeAreaWithCounts[]> {
  const goalCounts = db
    .select({
      lifeAreaId: goals.lifeAreaId,
      activeGoals: sql<number>`count(*) filter (where ${goals.status} = 'active')::int`.as("active_goals"),
    })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.isArchived, false), isNotNull(goals.lifeAreaId)))
    .groupBy(goals.lifeAreaId)
    .as("goal_counts");

  const taskCounts = db
    .select({
      lifeAreaId: tasks.lifeAreaId,
      openTasks: sql<number>`count(*) filter (where ${tasks.status} in ('todo', 'in_progress'))::int`.as("open_tasks"),
      completedTasks: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`.as("completed_tasks"),
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNotNull(tasks.lifeAreaId)))
    .groupBy(tasks.lifeAreaId)
    .as("task_counts");

  const habitCounts = db
    .select({
      lifeAreaId: habits.lifeAreaId,
      activeHabits: sql<number>`count(*)::int`.as("active_habits"),
    })
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.isArchived, false), isNotNull(habits.lifeAreaId)))
    .groupBy(habits.lifeAreaId)
    .as("habit_counts");

  const filters = [eq(lifeAreas.userId, userId)];
  if (!options.includeArchived) filters.push(eq(lifeAreas.isArchived, false));

  return db
    .select({
      ...getTableColumns(lifeAreas),
      activeGoals: sql<number>`coalesce(${goalCounts.activeGoals}, 0)`,
      openTasks: sql<number>`coalesce(${taskCounts.openTasks}, 0)`,
      completedTasks: sql<number>`coalesce(${taskCounts.completedTasks}, 0)`,
      activeHabits: sql<number>`coalesce(${habitCounts.activeHabits}, 0)`,
    })
    .from(lifeAreas)
    .leftJoin(goalCounts, eq(goalCounts.lifeAreaId, lifeAreas.id))
    .leftJoin(taskCounts, eq(taskCounts.lifeAreaId, lifeAreas.id))
    .leftJoin(habitCounts, eq(habitCounts.lifeAreaId, lifeAreas.id))
    .where(and(...filters))
    .orderBy(asc(lifeAreas.sortOrder), asc(lifeAreas.createdAt));
}

export async function getLifeArea(userId: string, id: string): Promise<LifeArea | null> {
  const [row] = await db
    .select()
    .from(lifeAreas)
    .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createLifeArea(userId: string, input: LifeAreaInput): Promise<LifeArea> {
  const [row] = await db
    .insert(lifeAreas)
    .values({ ...input, userId })
    .returning();
  return row;
}

export async function updateLifeArea(
  userId: string,
  id: string,
  input: Partial<LifeAreaInput>,
): Promise<LifeArea | null> {
  const [row] = await db
    .update(lifeAreas)
    .set(input)
    .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)))
    .returning();
  return row ?? null;
}

/** Soft delete: archive rather than hard delete (CLAUDE.md section 7). */
export async function archiveLifeArea(userId: string, id: string): Promise<LifeArea | null> {
  const [row] = await db
    .update(lifeAreas)
    .set({ isArchived: true, archivedAt: new Date() })
    .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)))
    .returning();
  return row ?? null;
}

export async function restoreLifeArea(userId: string, id: string): Promise<LifeArea | null> {
  const [row] = await db
    .update(lifeAreas)
    .set({ isArchived: false, archivedAt: null })
    .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)))
    .returning();
  return row ?? null;
}
