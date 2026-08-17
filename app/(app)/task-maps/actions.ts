"use server";

import { revalidatePath } from "next/cache";

import { taskMapsRepo, tasksRepo, type TaskMap, type TaskMapEdge, type TaskMapNode } from "@/db";
import { requireUser } from "@/lib/session";
import {
  createEdgeSchema,
  createNodeSchema,
  edgeIdSchema,
  edgeLabelSchema,
  importTasksSchema,
  legendSchema,
  moveNodesSchema,
  nodeIdSchema,
  taskMapIdSchema,
  taskMapNameSchema,
  updateNodeSchema,
  updateTaskMapSchema,
  viewportSchema,
  type CreateEdgeInput,
  type CreateNodeInput,
  type ImportTasksInput,
  type LegendInput,
  type MoveNodesInput,
  type UpdateNodeInput,
} from "@/lib/validations/task-maps";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NOT_FOUND = "That map could not be found.";

function fail(message: string | undefined): ActionResult<never> {
  return { ok: false, error: message ?? GENERIC_ERROR };
}

const ARCHIVED = "That map is archived. Restore it before making changes.";

/**
 * The map exists, belongs to the caller, and is still editable.
 *
 * Archiving is meant to freeze a map, but nothing enforced it: every graph
 * mutation checked ownership alone, so an archived map stayed fully editable
 * (audit R-12). The repository now carries the same condition in SQL; this
 * exists so the user gets an explanation instead of a bare "not found".
 */
async function assertMapEditable(userId: string, taskMapId: string): Promise<string | null> {
  const map = await taskMapsRepo.getTaskMap(userId, taskMapId);
  if (!map) return NOT_FOUND;
  if (map.isArchived) return ARCHIVED;
  return null;
}

// --- Maps ---

export async function createTaskMapAction(name: string): Promise<ActionResult<TaskMap>> {
  const user = await requireUser();
  const parsed = taskMapNameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  try {
    const map = await taskMapsRepo.createTaskMap(user.id, { name: parsed.data });
    revalidatePath("/task-maps");
    return { ok: true, data: map };
  } catch (error) {
    console.error("createTaskMapAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

export async function updateTaskMapAction(
  id: string,
  input: { name: string; description?: string | null },
): Promise<ActionResult<TaskMap>> {
  const user = await requireUser();
  const idResult = taskMapIdSchema.safeParse(id);
  if (!idResult.success) return fail(NOT_FOUND);
  const parsed = updateTaskMapSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  try {
    // Renaming an archived map is an edit like any other.
    const gate = await assertMapEditable(user.id, idResult.data);
    if (gate) return fail(gate);
    const map = await taskMapsRepo.updateTaskMap(user.id, idResult.data, parsed.data);
    if (!map) return fail(NOT_FOUND);
    revalidatePath("/task-maps");
    return { ok: true, data: map };
  } catch (error) {
    console.error("updateTaskMapAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

export async function archiveTaskMapAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = taskMapIdSchema.safeParse(id);
  if (!idResult.success) return fail(NOT_FOUND);

  try {
    const map = await taskMapsRepo.archiveTaskMap(user.id, idResult.data);
    if (!map) return fail(NOT_FOUND);
    revalidatePath("/task-maps");
    return { ok: true, data: { id: map.id } };
  } catch (error) {
    console.error("archiveTaskMapAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

export async function restoreTaskMapAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = taskMapIdSchema.safeParse(id);
  if (!idResult.success) return fail(NOT_FOUND);

  try {
    const map = await taskMapsRepo.restoreTaskMap(user.id, idResult.data);
    if (!map) return fail(NOT_FOUND);
    revalidatePath("/task-maps");
    return { ok: true, data: { id: map.id } };
  } catch (error) {
    console.error("restoreTaskMapAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

export async function deleteTaskMapAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = taskMapIdSchema.safeParse(id);
  if (!idResult.success) return fail(NOT_FOUND);

  try {
    const deleted = await taskMapsRepo.deleteTaskMap(user.id, idResult.data);
    if (!deleted) return fail(NOT_FOUND);
    revalidatePath("/task-maps");
    return { ok: true, data: { id: idResult.data } };
  } catch (error) {
    console.error("deleteTaskMapAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

export async function saveViewportAction(
  id: string,
  viewport: { x: number; y: number; zoom: number },
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = taskMapIdSchema.safeParse(id);
  if (!idResult.success) return fail(NOT_FOUND);
  const parsed = viewportSchema.safeParse(viewport);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  try {
    const map = await taskMapsRepo.updateTaskMap(user.id, idResult.data, { viewport: parsed.data });
    if (!map) return fail(NOT_FOUND);
    return { ok: true, data: { id: map.id } };
  } catch (error) {
    console.error("saveViewportAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

// --- Nodes ---

export async function addNodeAction(input: CreateNodeInput): Promise<ActionResult<TaskMapNode>> {
  const user = await requireUser();
  const parsed = createNodeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);
  const { taskMapId, taskId, color, ...node } = parsed.data;

  try {
    const gate = await assertMapEditable(user.id, taskMapId);
    if (gate) return fail(gate);
    if (taskId && !(await tasksRepo.getTask(user.id, taskId))) {
      return fail("That task could not be found.");
    }
    const created = await taskMapsRepo.createTaskMapNode(user.id, taskMapId, {
      ...node,
      taskId,
      data: { color },
    });
    revalidatePath("/task-maps");
    return { ok: true, data: created };
  } catch (error) {
    console.error("addNodeAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

export async function updateNodeAction(
  id: string,
  input: UpdateNodeInput,
): Promise<ActionResult<TaskMapNode>> {
  const user = await requireUser();
  const idResult = nodeIdSchema.safeParse(id);
  if (!idResult.success) return fail(idResult.error.issues[0]?.message);
  const parsed = updateNodeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  try {
    if (parsed.data.taskId && !(await tasksRepo.getTask(user.id, parsed.data.taskId))) {
      return fail("That task could not be found.");
    }
    const { color, ...fields } = parsed.data;
    const node = await taskMapsRepo.updateTaskMapNode(user.id, idResult.data, {
      ...fields,
      data: { color },
    });
    if (!node) return fail("That node could not be found.");
    revalidatePath("/task-maps");
    return { ok: true, data: node };
  } catch (error) {
    console.error("updateNodeAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

export async function moveNodesAction(input: MoveNodesInput): Promise<ActionResult<{ updated: number }>> {
  const user = await requireUser();
  const parsed = moveNodesSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  try {
    const gate = await assertMapEditable(user.id, parsed.data.taskMapId);
    if (gate) return fail(gate);
    const updated = await taskMapsRepo.updateNodePositions(
      user.id,
      parsed.data.taskMapId,
      parsed.data.positions,
    );
    return { ok: true, data: { updated } };
  } catch (error) {
    console.error("moveNodesAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

export async function deleteNodeAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = nodeIdSchema.safeParse(id);
  if (!idResult.success) return fail(idResult.error.issues[0]?.message);

  try {
    const deleted = await taskMapsRepo.deleteTaskMapNode(user.id, idResult.data);
    if (!deleted) return fail("That node could not be found.");
    return { ok: true, data: { id: idResult.data } };
  } catch (error) {
    console.error("deleteNodeAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

/**
 * Save what the map's colours MEAN. Stored per map because "red" is a different
 * idea on a house-move map than on a product roadmap.
 */
export async function saveLegendAction(
  id: string,
  legend: LegendInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = taskMapIdSchema.safeParse(id);
  if (!idResult.success) return fail(NOT_FOUND);
  const parsed = legendSchema.safeParse(legend);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  try {
    const map = await taskMapsRepo.updateTaskMap(user.id, idResult.data, {
      legend: parsed.data as Record<string, string>,
    });
    if (!map) return fail(NOT_FOUND);
    revalidatePath("/task-maps");
    return { ok: true, data: { id: map.id } };
  } catch (error) {
    console.error("saveLegendAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

/**
 * Drop existing tasks onto the map as linked nodes, laid out in a grid.
 *
 * Building a useful map one node at a time, retyping titles that already exist,
 * was enough friction that maps stayed at three nodes and never described real
 * work. Every id is checked against the caller's own tasks before anything is
 * written.
 */
export async function importTasksAction(
  input: ImportTasksInput,
): Promise<ActionResult<TaskMapNode[]>> {
  const user = await requireUser();
  const parsed = importTasksSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);
  const { taskMapId, taskIds, originX, originY } = parsed.data;

  try {
    const gate = await assertMapEditable(user.id, taskMapId);
    if (gate) return fail(gate);

    const owned = await Promise.all(taskIds.map((id) => tasksRepo.getTask(user.id, id)));
    const tasks = owned.filter((t): t is NonNullable<typeof t> => t !== null);
    if (tasks.length === 0) return fail("Those tasks could not be found.");

    const COLUMNS = 4;
    const COL_GAP = 240;
    const ROW_GAP = 160;

    const created = await Promise.all(
      tasks.map((task, index) =>
        taskMapsRepo.createTaskMapNode(user.id, taskMapId, {
          nodeType: "task",
          label: task.title,
          taskId: task.id,
          positionX: originX + (index % COLUMNS) * COL_GAP,
          positionY: originY + Math.floor(index / COLUMNS) * ROW_GAP,
          // Priority is the one thing worth colouring automatically; the user
          // can recolour anything afterwards and rename what the colour means.
          data: {
            color:
              task.priority === "urgent"
                ? "red"
                : task.priority === "high"
                  ? "orange"
                  : task.priority === "low"
                    ? "neutral"
                    : "blue",
          },
        }),
      ),
    );

    return { ok: true, data: created };
  } catch (error) {
    console.error("importTasksAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

/**
 * Rename a connection. The label is what turns a decision node into an actual
 * branch: the answers live on the edges leaving it ("Yes", "No", "if blocked").
 */
export async function updateEdgeLabelAction(
  id: string,
  label: string | null,
): Promise<ActionResult<TaskMapEdge>> {
  const user = await requireUser();
  const idResult = edgeIdSchema.safeParse(id);
  if (!idResult.success) return fail(idResult.error.issues[0]?.message);
  const parsed = edgeLabelSchema.safeParse(label);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  try {
    const edge = await taskMapsRepo.updateTaskMapEdge(user.id, idResult.data, {
      label: parsed.data,
    });
    if (!edge) return fail("That connection could not be found.");
    return { ok: true, data: edge };
  } catch (error) {
    console.error("updateEdgeLabelAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

/**
 * Persist a whole tidy-up in one write.
 *
 * Auto-layout moves every node at once, and firing one request per node would
 * be dozens of round trips with a half-arranged map if any of them failed.
 * Reuses the batched, map-scoped position update the drag handler already uses.
 */
export async function layoutMapAction(
  input: MoveNodesInput,
): Promise<ActionResult<{ updated: number }>> {
  return moveNodesAction(input);
}

// --- Edges ---

export async function addEdgeAction(input: CreateEdgeInput): Promise<ActionResult<TaskMapEdge>> {
  const user = await requireUser();
  const parsed = createEdgeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);
  const { taskMapId, sourceNodeId, targetNodeId } = parsed.data;

  try {
    const gate = await assertMapEditable(user.id, taskMapId);
    if (gate) return fail(gate);
    // Both endpoints must be nodes of this owned map.
    const found = await taskMapsRepo.countNodesInMap(user.id, taskMapId, [sourceNodeId, targetNodeId]);
    if (found !== 2) return fail("Those nodes could not be connected.");

    const edge = await taskMapsRepo.createTaskMapEdge(user.id, taskMapId, { sourceNodeId, targetNodeId });
    if (!edge) return fail("Those nodes could not be connected.");
    return { ok: true, data: edge };
  } catch (error) {
    console.error("addEdgeAction failed", error);
    return fail(GENERIC_ERROR);
  }
}

export async function deleteEdgeAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = edgeIdSchema.safeParse(id);
  if (!idResult.success) return fail(idResult.error.issues[0]?.message);

  try {
    const deleted = await taskMapsRepo.deleteTaskMapEdge(user.id, idResult.data);
    if (!deleted) return fail("That connection could not be found.");
    return { ok: true, data: { id: idResult.data } };
  } catch (error) {
    console.error("deleteEdgeAction failed", error);
    return fail(GENERIC_ERROR);
  }
}
