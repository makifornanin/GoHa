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

/**
 * Node colours.
 *
 * The MEANING of each colour is the user's to decide and is stored per map in
 * `task_maps.legend` (e.g. red = "Hard", green = "Quick win"). Fixing the
 * meaning in code would have been guessing at how someone thinks about their own
 * work; fixing only the palette keeps the canvas coherent while leaving the
 * semantics open.
 */
export const NODE_COLOR_KEYS = [
  "neutral",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;
export type NodeColorKey = (typeof NODE_COLOR_KEYS)[number];
export const DEFAULT_NODE_COLOR: NodeColorKey = "neutral";

export const nodeColorConfig: Record<
  NodeColorKey,
  { label: string; swatch: string; border: string; tint: string; dot: string }
> = {
  neutral: {
    label: "Neutral",
    swatch: "bg-gray-3",
    border: "border-separator-opaque",
    tint: "bg-surface",
    dot: "bg-gray-2",
  },
  red: {
    label: "Red",
    swatch: "bg-red",
    border: "border-red/50",
    tint: "bg-red/8",
    dot: "bg-red",
  },
  orange: {
    label: "Orange",
    swatch: "bg-orange",
    border: "border-orange/50",
    tint: "bg-orange/8",
    dot: "bg-orange",
  },
  yellow: {
    label: "Yellow",
    swatch: "bg-yellow",
    border: "border-yellow/60",
    tint: "bg-yellow/10",
    dot: "bg-yellow",
  },
  green: {
    label: "Green",
    swatch: "bg-green",
    border: "border-green/50",
    tint: "bg-green/8",
    dot: "bg-green",
  },
  blue: {
    label: "Blue",
    swatch: "bg-blue",
    border: "border-blue/50",
    tint: "bg-blue/8",
    dot: "bg-blue",
  },
  purple: {
    label: "Purple",
    swatch: "bg-purple",
    border: "border-purple/50",
    tint: "bg-purple/8",
    dot: "bg-purple",
  },
};

/** A starting point the user can rename. Only a suggestion, never enforced. */
export const SUGGESTED_LEGEND: Record<string, string> = {
  red: "Hard / blocked",
  orange: "Important",
  yellow: "Waiting on someone",
  green: "Quick win",
  blue: "In progress",
  purple: "Idea",
};

export const LEGEND_LABEL_MAX = 40;

/** Narrow a stored value to a known colour key. */
export function toNodeColor(value: unknown): NodeColorKey {
  return NODE_COLOR_KEYS.includes(value as NodeColorKey)
    ? (value as NodeColorKey)
    : DEFAULT_NODE_COLOR;
}

/** Read a node's colour out of its free-form `data` blob. */
export function nodeColorOf(data: unknown): NodeColorKey {
  if (data && typeof data === "object" && "color" in data) {
    return toNodeColor((data as { color?: unknown }).color);
  }
  return DEFAULT_NODE_COLOR;
}

export const TASK_MAP_NAME_MAX = 120;
export const TASK_MAP_DESCRIPTION_MAX = 500;
export const NODE_LABEL_MAX = 200;

/** Fallback label shown for a node that has no text yet. */
export const DEFAULT_NODE_LABEL = "Untitled node";

/** How long to wait after the last drag before persisting node positions. */
export const POSITION_SAVE_DEBOUNCE_MS = 500;
