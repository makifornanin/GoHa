import { z } from "zod";

import {
  NODE_LABEL_MAX,
  TASK_MAP_DESCRIPTION_MAX,
  TASK_MAP_NAME_MAX,
  TASK_MAP_NODE_TYPES,
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

export const createNodeSchema = z.object({
  taskMapId: taskMapIdSchema,
  nodeType: nodeTypeSchema.default("task"),
  label: nodeLabelSchema,
  taskId: z.uuid().nullish().transform((v) => v ?? null),
  positionX: finiteNumber,
  positionY: finiteNumber,
});

export const updateNodeSchema = z.object({
  label: nodeLabelSchema,
  nodeType: nodeTypeSchema.optional(),
  taskId: z.uuid().nullish().transform((v) => v ?? null),
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
export type MoveNodesInput = z.input<typeof moveNodesSchema>;
export type CreateEdgeInput = z.input<typeof createEdgeSchema>;
