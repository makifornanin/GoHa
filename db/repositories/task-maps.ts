import "server-only";

import { and, asc, count, eq, inArray } from "drizzle-orm";

import { db } from "../client";
import { taskMapEdges, taskMapNodes, taskMaps } from "../schema";
import type { TaskMapNodeType } from "../schema";
import type { TaskMap, TaskMapEdge, TaskMapNode } from "../types";

/**
 * Task Maps repository (task_maps + task_map_nodes + task_map_edges).
 * User-scoped. Maps are archived rather than hard-deleted; nodes and edges
 * cascade with their map at the database level.
 */

export async function listTaskMaps(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<TaskMap[]> {
  const where = options.includeArchived
    ? eq(taskMaps.userId, userId)
    : and(eq(taskMaps.userId, userId), eq(taskMaps.isArchived, false));
  return db.select().from(taskMaps).where(where).orderBy(asc(taskMaps.createdAt));
}

export async function getTaskMap(userId: string, id: string): Promise<TaskMap | null> {
  const [row] = await db
    .select()
    .from(taskMaps)
    .where(and(eq(taskMaps.id, id), eq(taskMaps.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** A map plus all its nodes and edges, ready to hydrate a React Flow canvas. */
export async function getTaskMapGraph(
  userId: string,
  id: string,
): Promise<{ map: TaskMap; nodes: TaskMapNode[]; edges: TaskMapEdge[] } | null> {
  const map = await getTaskMap(userId, id);
  if (!map) return null;
  const [nodes, edges] = await Promise.all([
    db.select().from(taskMapNodes).where(eq(taskMapNodes.taskMapId, id)),
    db.select().from(taskMapEdges).where(eq(taskMapEdges.taskMapId, id)),
  ]);
  return { map, nodes, edges };
}

export async function createTaskMap(
  userId: string,
  input: { name: string; description?: string | null; goalId?: string | null; lifeAreaId?: string | null },
): Promise<TaskMap> {
  const [row] = await db
    .insert(taskMaps)
    .values({ ...input, userId })
    .returning();
  return row;
}

export async function updateTaskMap(
  userId: string,
  id: string,
  input: {
    name?: string;
    description?: string | null;
    goalId?: string | null;
    lifeAreaId?: string | null;
    viewport?: { x: number; y: number; zoom: number };
  },
): Promise<TaskMap | null> {
  const [row] = await db
    .update(taskMaps)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(taskMaps.id, id), eq(taskMaps.userId, userId)))
    .returning();
  return row ?? null;
}

export async function archiveTaskMap(userId: string, id: string): Promise<TaskMap | null> {
  const [row] = await db
    .update(taskMaps)
    .set({ isArchived: true, archivedAt: new Date() })
    .where(and(eq(taskMaps.id, id), eq(taskMaps.userId, userId)))
    .returning();
  return row ?? null;
}

export async function restoreTaskMap(userId: string, id: string): Promise<TaskMap | null> {
  const [row] = await db
    .update(taskMaps)
    .set({ isArchived: false, archivedAt: null })
    .where(and(eq(taskMaps.id, id), eq(taskMaps.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Hard delete a map. Nodes and edges cascade at the database level. Callers
 * should confirm intent first (this is destructive and not reversible).
 */
export async function deleteTaskMap(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(taskMaps)
    .where(and(eq(taskMaps.id, id), eq(taskMaps.userId, userId)))
    .returning({ id: taskMaps.id });
  return rows.length > 0;
}

// --- Nodes ---

export type TaskMapNodeInput = {
  taskId?: string | null;
  nodeType?: TaskMapNodeType;
  label?: string | null;
  positionX?: number;
  positionY?: number;
  width?: number | null;
  height?: number | null;
  data?: unknown;
};

export async function createTaskMapNode(
  userId: string,
  taskMapId: string,
  input: TaskMapNodeInput,
): Promise<TaskMapNode> {
  const [row] = await db
    .insert(taskMapNodes)
    .values({ ...input, userId, taskMapId })
    .returning();
  return row;
}

export async function updateTaskMapNode(
  userId: string,
  id: string,
  input: Partial<TaskMapNodeInput>,
): Promise<TaskMapNode | null> {
  const [row] = await db
    .update(taskMapNodes)
    .set(input)
    .where(and(eq(taskMapNodes.id, id), eq(taskMapNodes.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteTaskMapNode(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(taskMapNodes)
    .where(and(eq(taskMapNodes.id, id), eq(taskMapNodes.userId, userId)))
    .returning({ id: taskMapNodes.id });
  return rows.length > 0;
}

/**
 * Persist the final positions of one or more dragged nodes. Each update is
 * user-scoped and constrained to the given map, so a stale client id can never
 * write to another map or another owner. Returns how many rows were updated.
 */
export async function updateNodePositions(
  userId: string,
  taskMapId: string,
  positions: { id: string; positionX: number; positionY: number }[],
): Promise<number> {
  if (positions.length === 0) return 0;
  const results = await Promise.all(
    positions.map((p) =>
      db
        .update(taskMapNodes)
        .set({ positionX: p.positionX, positionY: p.positionY })
        .where(
          and(
            eq(taskMapNodes.id, p.id),
            eq(taskMapNodes.userId, userId),
            eq(taskMapNodes.taskMapId, taskMapId),
          ),
        )
        .returning({ id: taskMapNodes.id }),
    ),
  );
  return results.reduce((sum, rows) => sum + rows.length, 0);
}

/**
 * How many of the given node ids actually belong to this user's map. Used to
 * validate that both endpoints of a new edge live inside the same owned map.
 */
export async function countNodesInMap(
  userId: string,
  taskMapId: string,
  nodeIds: string[],
): Promise<number> {
  if (nodeIds.length === 0) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(taskMapNodes)
    .where(
      and(
        eq(taskMapNodes.userId, userId),
        eq(taskMapNodes.taskMapId, taskMapId),
        inArray(taskMapNodes.id, nodeIds),
      ),
    );
  return row?.n ?? 0;
}

// --- Edges ---

/**
 * Create an edge between two nodes of a map. Idempotent on the
 * (map, source, target) unique constraint: a duplicate connection resolves to
 * the existing edge instead of throwing.
 */
export async function createTaskMapEdge(
  userId: string,
  taskMapId: string,
  input: { sourceNodeId: string; targetNodeId: string; label?: string | null; data?: unknown },
): Promise<TaskMapEdge | null> {
  const [row] = await db
    .insert(taskMapEdges)
    .values({ ...input, userId, taskMapId })
    .onConflictDoNothing({
      target: [taskMapEdges.taskMapId, taskMapEdges.sourceNodeId, taskMapEdges.targetNodeId],
    })
    .returning();
  if (row) return row;
  // Conflict: return the edge that already connects these two nodes.
  const [existing] = await db
    .select()
    .from(taskMapEdges)
    .where(
      and(
        eq(taskMapEdges.userId, userId),
        eq(taskMapEdges.taskMapId, taskMapId),
        eq(taskMapEdges.sourceNodeId, input.sourceNodeId),
        eq(taskMapEdges.targetNodeId, input.targetNodeId),
      ),
    )
    .limit(1);
  return existing ?? null;
}

export async function deleteTaskMapEdge(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(taskMapEdges)
    .where(and(eq(taskMapEdges.id, id), eq(taskMapEdges.userId, userId)))
    .returning({ id: taskMapEdges.id });
  return rows.length > 0;
}
