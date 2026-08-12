import { z } from "zod";

import {
  DEFAULT_NODE_COLOR,
  LEGEND_LABEL_MAX,
  NODE_COLOR_KEYS,
  NODE_LABEL_MAX,
  TASK_MAP_DESCRIPTION_MAX,
  TASK_MAP_NAME_MAX,
  TASK_MAP_NODE_TYPES,
  type NodeColorKey,
} from "@/lib/task-maps";

export const taskMapIdSchema = z.uuid("That map could not be found.");
export const nodeIdSchema = z.uuid("That node could not be found.");
export const edgeIdSchema = z.uuid("That connection could not be found.");

export const taskMapNameSchema = z
  .string()
  .trim()
  .min(1, "Give your map a name.")
  .max(TASK_MAP_NAME_MAX, `Keep the name under ${TASK_MAP_NAME_MAX} characters.`);

/** Optional description; blank strings normalise to null. */
export const taskMapDescriptionSchema = z
  .string()
  .trim()
  .max(TASK_MAP_DESCRIPTION_MAX, `Keep it under ${TASK_MAP_DESCRIPTION_MAX} characters.`)
  .nullish()
  .transform((v) => (v ? v : null));

export const nodeTypeSchema = z.enum(TASK_MAP_NODE_TYPES);

export const nodeLabelSchema = z
  .string()
  .trim()
  .max(NODE_LABEL_MAX, `Keep the label under ${NODE_LABEL_MAX} characters.`)
  .nullish()
  .transform((v) => (v ? v : null));

const finiteNumber = z.number().refine(Number.isFinite, "Invalid coordinate.");

export const updateTaskMapSchema = z.object({
  name: taskMapNameSchema,
  description: taskMapDescriptionSchema,
});

export const viewportSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  zoom: finiteNumber,
});

export const nodeColorSchema = z.enum(NODE_COLOR_KEYS).default(DEFAULT_NODE_COLOR);

export const createNodeSchema = z.object({
  taskMapId: taskMapIdSchema,
  nodeType: nodeTypeSchema.default("task"),
  label: nodeLabelSchema,
  color: nodeColorSchema,
  taskId: z.uuid().nullish().transform((v) => v ?? null),
  positionX: finiteNumber,
  positionY: finiteNumber,
});

export const updateNodeSchema = z.object({
  label: nodeLabelSchema,
  nodeType: nodeTypeSchema.optional(),
  color: nodeColorSchema,
  taskId: z.uuid().nullish().transform((v) => v ?? null),
});

/**
 * The map's colour legend: colour key -> the user's own label.
 *
 * Keyed by plain string and narrowed afterwards, NOT by `z.enum(...)`: in Zod 4
 * an enum-keyed record is exhaustive, so naming a single colour failed with
 * "expected string, received undefined" for every colour left blank. Unknown
 * keys are dropped here rather than rejected, so the canvas is never asked to
 * render a colour it has no styling for.
 */
export const legendSchema = z
  .record(
    z.string(),
    z
      .string()
      .trim()
      .max(LEGEND_LABEL_MAX, `Keep each label under ${LEGEND_LABEL_MAX} characters.`),
  )
  .transform((raw) =>
    Object.fromEntries(
      Object.entries(raw).filter(
        ([key, value]) => NODE_COLOR_KEYS.includes(key as NodeColorKey) && value.length > 0,
      ),
    ),
  );

/** Bulk-import existing tasks onto a map as linked nodes. */
export const importTasksSchema = z.object({
  taskMapId: taskMapIdSchema,
  taskIds: z.array(z.uuid()).min(1, "Choose at least one task.").max(100),
  originX: finiteNumber,
  originY: finiteNumber,
});

export const moveNodesSchema = z.object({
  taskMapId: taskMapIdSchema,
  positions: z
    .array(
      z.object({
        id: nodeIdSchema,
        positionX: finiteNumber,
        positionY: finiteNumber,
      }),
    )
    .min(1, "Nothing to save.")
    .max(1000),
});

export const createEdgeSchema = z
  .object({
    taskMapId: taskMapIdSchema,
    sourceNodeId: nodeIdSchema,
    targetNodeId: nodeIdSchema,
  })
  .refine((d) => d.sourceNodeId !== d.targetNodeId, {
    message: "A node cannot connect to itself.",
    path: ["targetNodeId"],
  });

export type CreateNodeInput = z.input<typeof createNodeSchema>;
export type UpdateNodeInput = z.input<typeof updateNodeSchema>;
export type ImportTasksInput = z.input<typeof importTasksSchema>;
export type LegendInput = z.input<typeof legendSchema>;
export type MoveNodesInput = z.input<typeof moveNodesSchema>;
export type CreateEdgeInput = z.input<typeof createEdgeSchema>;
