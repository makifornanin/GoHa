import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "../client";
import { lifeAreas } from "../schema";
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
