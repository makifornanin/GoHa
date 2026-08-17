/**
 * Shared Task Map constants and helpers. Client-safe (no server-only imports),
 * so both the canvas UI and the server actions/validations can use them.
 */

export const TASK_MAP_NODE_TYPES = [
  "task",
  "decision",
  "milestone",
  "blocker",
  "note",
  "phase",
  "group",
] as const;
export type TaskMapNodeTypeValue = (typeof TASK_MAP_NODE_TYPES)[number];

export const NODE_TYPE_LABELS: Record<TaskMapNodeTypeValue, string> = {
  task: "Task",
  decision: "Decision",
  milestone: "Milestone",
  blocker: "Blocker",
  note: "Note",
  phase: "Phase",
  group: "Group",
};

/**
 * What each node type is FOR, and how it should be drawn.
 *
 * Four interchangeable rounded rectangles could only ever draw an inventory of
 * boxes. A map has to show a route, so the shapes differ on purpose: a decision
 * is a branch, a blocker is an obstruction, a phase is a band the rest sits
 * inside. `accent` is the type's inherent colour, used only where the user has
 * not chosen one of their own.
 *
 * `body` marks the types whose note field is the point rather than an extra.
 */
export const nodeTypeConfig: Record<
  TaskMapNodeTypeValue,
  {
    hint: string;
    chip: string;
    accent: string;
    /** Tailwind shape overrides applied to the node card. */
    shape: string;
    /** True when the note body is this type's primary content. */
    body: boolean;
  }
> = {
  task: {
    hint: "A concrete piece of work. Link it to a real task to track it.",
    chip: "bg-blue/15 text-blue",
    accent: "border-blue/40",
    shape: "rounded-xl",
    body: false,
  },
  decision: {
    hint: "A branch. Label the edges leaving it with the answers.",
    chip: "bg-yellow/20 text-orange",
    accent: "border-yellow/60",
    // Chamfered corners read as "choose a path" without an unreadable diamond.
    shape: "rounded-xl [clip-path:polygon(14px_0,calc(100%-14px)_0,100%_14px,100%_calc(100%-14px),calc(100%-14px)_100%,14px_100%,0_calc(100%-14px),0_14px)]",
    body: false,
  },
  milestone: {
    hint: "A point worth reaching. Everything before it is the route.",
    chip: "bg-indigo/15 text-indigo",
    accent: "border-indigo/40",
    shape: "rounded-3xl",
    body: false,
  },
  blocker: {
    hint: "Something in the way. What has to clear before the rest can move?",
    chip: "bg-red/15 text-red",
    accent: "border-red/50",
    shape: "rounded-xl border-dashed",
    body: true,
  },
  note: {
    hint: "Context, a caveat, a link, a reminder. Write it in the body.",
    chip: "bg-purple/15 text-purple",
    accent: "border-purple/40",
    // A folded-corner sheet, so a note reads as paper next to the work.
    shape: "rounded-xl [clip-path:polygon(0_0,calc(100%-16px)_0,100%_16px,100%_100%,0_100%)]",
    body: true,
  },
  phase: {
    hint: "A stage of the plan. Use it as a heading for the work under it.",
    chip: "bg-system-teal/15 text-system-teal",
    accent: "border-system-teal/40",
    shape: "rounded-lg",
    body: false,
  },
  group: {
    hint: "A loose cluster. No sequencing implied.",
    chip: "bg-gray-5 text-label-secondary",
    accent: "border-separator-opaque",
    shape: "rounded-2xl border-dashed",
    body: false,
  },
};

/** Body text limit for a node's note. */
export const NODE_NOTE_MAX = 2000;

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
