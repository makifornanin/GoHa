/**
 * Shared Task Map constants and helpers. Client-safe (no server-only imports),
 * so both the canvas UI and the server actions/validations can use them.
 */

export const TASK_MAP_NODE_TYPES = ["task", "note", "group", "milestone"] as const;
export type TaskMapNodeTypeValue = (typeof TASK_MAP_NODE_TYPES)[number];

export const NODE_TYPE_LABELS: Record<TaskMapNodeTypeValue, string> = {
  task: "Task",
  note: "Note",
  milestone: "Milestone",
  group: "Group",
};

export const TASK_MAP_NAME_MAX = 120;
export const TASK_MAP_DESCRIPTION_MAX = 500;
export const NODE_LABEL_MAX = 200;

/** Fallback label shown for a node that has no text yet. */
export const DEFAULT_NODE_LABEL = "Untitled node";

/** How long to wait after the last drag before persisting node positions. */
export const POSITION_SAVE_DEBOUNCE_MS = 500;
