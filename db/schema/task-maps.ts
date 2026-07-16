import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, check, doublePrecision, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { goals } from "./goals";
import { lifeAreas } from "./life-areas";
import { tasks } from "./tasks";
import { taskMapNodeType } from "./enums";

/**
 * Task Maps: a React Flow (@xyflow/react) canvas of nodes and edges. Maps are
 * valuable entities, so they are archived rather than hard-deleted. Nodes and
 * edges cascade-delete with their map.
 */
export const taskMaps = pgTable(
  "task_maps",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    goalId: uuid().references(() => goals.id, { onDelete: "set null" }),
    lifeAreaId: uuid().references(() => lifeAreas.id, { onDelete: "set null" }),
    /** React Flow viewport { x, y, zoom }. */
    viewport: jsonb().$type<{ x: number; y: number; zoom: number }>(),
    isArchived: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    ...auditTimestamps,
  },
  (t) => [index("task_maps_user_id_idx").on(t.userId)],
);

/**
 * Task Map nodes. A node may represent an existing task (`taskId`, unlinked via
 * `set null` if the task is deleted) or be a standalone note/group/milestone.
 * Positions are React Flow canvas coordinates.
 */
export const taskMapNodes = pgTable(
  "task_map_nodes",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskMapId: uuid()
      .notNull()
      .references(() => taskMaps.id, { onDelete: "cascade" }),
    taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
    nodeType: taskMapNodeType().notNull().default("task"),
    /** Label for non-task nodes, or an override for task nodes. */
    label: text(),
    positionX: doublePrecision().notNull().default(0),
    positionY: doublePrecision().notNull().default(0),
    width: doublePrecision(),
    height: doublePrecision(),
    /** Extra presentation data (color, collapsed, etc.). */
    data: jsonb(),
    ...auditTimestamps,
  },
  (t) => [
    index("task_map_nodes_task_map_id_idx").on(t.taskMapId),
    index("task_map_nodes_task_id_idx").on(t.taskId),
  ],
);

/**
 * Task Map edges connecting two nodes within the same map. Duplicate edges are
 * prevented, and a node cannot connect to itself.
 */
export const taskMapEdges = pgTable(
  "task_map_edges",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskMapId: uuid()
      .notNull()
      .references(() => taskMaps.id, { onDelete: "cascade" }),
    sourceNodeId: uuid()
      .notNull()
      .references((): AnyPgColumn => taskMapNodes.id, { onDelete: "cascade" }),
    targetNodeId: uuid()
      .notNull()
      .references((): AnyPgColumn => taskMapNodes.id, { onDelete: "cascade" }),
    label: text(),
    data: jsonb(),
    ...auditTimestamps,
  },
  (t) => [
    unique("task_map_edges_source_target_uq").on(t.taskMapId, t.sourceNodeId, t.targetNodeId),
    index("task_map_edges_task_map_id_idx").on(t.taskMapId),
    check("task_map_edges_no_self_loop", sql`${t.sourceNodeId} <> ${t.targetNodeId}`),
  ],
);
