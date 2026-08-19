"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnNodeDrag,
} from "@xyflow/react";
import {
  Boxes,
  Check,
  Download,
  ExternalLink,
  GitBranch,
  Layers,
  Link2,
  ListChecks,
  Octagon,
  Palette,
  Plus,
  Search,
  Sparkles,
  SquareCheck,
  StickyNote,
  Target,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TaskMapEdge, TaskMapNode } from "@/db/types";
import { findFreeSpot, layoutMap, NODE_HEIGHT, NODE_WIDTH } from "@/lib/task-map-layout";
import {
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_LABEL,
  LEGEND_LABEL_MAX,
  NODE_COLOR_KEYS,
  NODE_NOTE_MAX,
  NODE_TYPE_LABELS,
  nodeColorConfig,
  nodeColorOf,
  nodeTypeConfig,
  POSITION_SAVE_DEBOUNCE_MS,
  SUGGESTED_LEGEND,
  TASK_MAP_NODE_TYPES,
  type NodeColorKey,
  type TaskMapNodeTypeValue,
} from "@/lib/task-maps";
import { cn } from "@/lib/utils";
import {
  addEdgeAction,
  addNodeAction,
  deleteEdgeAction,
  deleteNodeAction,
  importTasksAction,
  layoutMapAction,
  moveNodesAction,
  saveLegendAction,
  saveViewportAction,
  updateEdgeLabelAction,
  updateNodeAction,
} from "@/app/(app)/task-maps/actions";

export type TaskStatusLike = "todo" | "in_progress" | "completed" | "cancelled";
/** Tasks carry their live state so a linked node can show it on the canvas. */
export type TaskOption = {
  id: string;
  title: string;
  status?: TaskStatusLike;
  priority?: string;
};

type GohaNodeData = {
  label: string;
  note: string | null;
  nodeType: TaskMapNodeTypeValue;
  taskId: string | null;
  color: NodeColorKey;
  /** What this colour means on this map, if the user has named it. */
  colorMeaning?: string;
  /** Live state of the linked task, so the map reflects reality. */
  taskStatus?: TaskStatusLike;
  taskPriority?: string;
};
type GohaNode = Node<GohaNodeData, "goha">;

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  todo: { label: "To do", className: "bg-gray-5 text-label-secondary" },
  in_progress: { label: "Doing", className: "bg-blue/15 text-blue" },
  completed: { label: "Done", className: "bg-green/15 text-green" },
  cancelled: { label: "Cancelled", className: "bg-gray-5 text-label-tertiary" },
};

const NODE_TYPE_ICON: Record<TaskMapNodeTypeValue, typeof Plus> = {
  task: SquareCheck,
  decision: GitBranch,
  milestone: Target,
  blocker: Octagon,
  note: StickyNote,
  phase: Layers,
  group: Boxes,
};

/**
 * A node on the canvas.
 *
 * Shape carries the TYPE (a decision is chamfered, a note is a folded sheet, a
 * blocker and a group are dashed) and colour carries the user's own meaning
 * from the legend. Keeping those on separate channels means a map can say "this
 * is a branch" and "this is hard" at the same time, which one rounded rectangle
 * in seven colours could not.
 *
 * A node linked to a real task shows that task's live status, so the map is a
 * view of the work rather than a drawing that slowly goes stale.
 */
function GohaNodeView({ data, selected }: NodeProps<GohaNode>) {
  const color = nodeColorConfig[data.color];
  const type = nodeTypeConfig[data.nodeType];
  const isNeutral = data.color === "neutral";
  const status = data.taskStatus ? STATUS_CHIP[data.taskStatus] : null;
  const isDone = data.taskStatus === "completed";

  return (
    <div
      // NOT `overflow-hidden`: React Flow's connect handles sit ON the node's
      // edges and are clipped by it, which silently made nodes impossible to
      // connect.
      className={cn(
        "group relative w-52 border p-3 shadow-e2 transition-shadow",
        type.shape,
        isNeutral ? "bg-surface" : color.tint,
        selected
          ? "border-blue ring-[3px] ring-blue/40"
          : isNeutral
            ? type.accent
            : color.border,
        isDone && "opacity-70",
      )}
      title={data.colorMeaning ? `${color.label}: ${data.colorMeaning}` : type.hint}
    >
      {/* The colour rail is skipped on clipped shapes, where it would be cut. */}
      {!isNeutral && data.nodeType !== "decision" && data.nodeType !== "note" ? (
        <span className={cn("absolute inset-x-0 top-0 h-1", color.dot)} aria-hidden />
      ) : null}

      {/* 12px visual dot, but a grab zone stretched ALONG the node's edge
          (-inset-x-10) rather than a circle: that is the direction you are
          imprecise in, and stretching it sideways costs almost none of the card
          body you still need for dragging the node. The dot also grows on hover
          so it is easy to see. With `connectionRadius` on the canvas handling
          the drop, you aim at the node rather than at a 12px target. */}
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-surface !bg-blue transition-transform after:absolute after:-inset-y-3 after:-inset-x-10 after:rounded-full after:content-[''] group-hover:!scale-150"
      />

      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-footnote", type.chip)}>
          {NODE_TYPE_LABELS[data.nodeType]}
        </span>
        <span className="flex items-center gap-1">
          {status ? (
            <span className={cn("rounded-sm px-1.5 py-0.5 text-footnote", status.className)}>
              {status.label}
            </span>
          ) : null}
          {data.taskId ? (
            <Link2 className="size-3.5 shrink-0 text-blue" aria-label="Linked to a task" />
          ) : null}
        </span>
      </div>

      <p
        className={cn(
          "line-clamp-3 break-words text-body text-label",
          isDone && "text-label-tertiary line-through",
        )}
      >
        {data.label || DEFAULT_NODE_LABEL}
      </p>

      {/* The body. This is the whole point of a Note node. */}
      {data.note ? (
        <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-footnote text-label-secondary">
          {data.note}
        </p>
      ) : null}

      {data.colorMeaning ? (
        <p className="mt-1.5 flex items-center gap-1.5 truncate text-footnote text-label-tertiary">
          <span className={cn("size-1.5 shrink-0 rounded-full", color.dot)} aria-hidden />
          {data.colorMeaning}
        </p>
      ) : null}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !border-2 !border-surface !bg-blue transition-transform after:absolute after:-inset-y-3 after:-inset-x-10 after:rounded-full after:content-[''] group-hover:!scale-150"
      />
    </div>
  );
}

const nodeTypes = { goha: GohaNodeView };

/**
 * React Flow renders edges, the dotted backdrop, controls, and the minimap with
 * literal colors, not Tailwind classes. Rather than hardcode hex per theme, we
 * (a) push our design tokens into React Flow's own `--xy-*` variables inline on
 * the canvas element (inline wins over the dynamically loaded stylesheet, and is
 * theme-adaptive because the values are `var(--token)`), and (b) pass token-based
 * colors to the props that take a color string. This keeps the canvas on-brand
 * in light and dark with no scattered hex (CLAUDE.md section 9).
 */
const REACT_FLOW_VARS = {
  "--xy-edge-stroke-default": "var(--gray-2)",
  "--xy-edge-stroke-selected-default": "var(--blue)",
  "--xy-connectionline-stroke-default": "var(--blue)",
  "--xy-background-color-default": "var(--canvas)",
  "--xy-attribution-background-color-default": "transparent",
  "--xy-controls-button-background-color-default": "var(--surface)",
  "--xy-controls-button-background-color-hover-default": "var(--surface-secondary)",
  "--xy-controls-button-color-default": "var(--label-secondary)",
  "--xy-controls-button-color-hover-default": "var(--label)",
  "--xy-controls-button-border-color-default": "var(--separator-opaque)",
  "--xy-minimap-background-color-default": "var(--surface)",
} as CSSProperties;

const EDGE_OPTIONS = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "var(--gray-2)" },
  style: { stroke: "var(--gray-2)", strokeWidth: 2 },
  // A labelled edge needs a readable plate, not text sitting on the line. These
  // live here rather than in `dbEdgeToFlow` so an edge drawn just now and the
  // same edge after a reload look identical.
  labelBgPadding: [6, 3] as [number, number],
  labelBgBorderRadius: 6,
  labelBgStyle: { fill: "var(--surface)", stroke: "var(--separator-opaque)" },
  labelStyle: { fill: "var(--label)", fontSize: 11, fontWeight: 500 },
};

function dbNodeToFlow(
  n: TaskMapNode,
  legend: Record<string, string> = {},
  taskById?: Map<string, TaskOption>,
): GohaNode {
  const color = nodeColorOf(n.data);
  const task = n.taskId ? taskById?.get(n.taskId) : undefined;
  return {
    id: n.id,
    type: "goha",
    position: { x: n.positionX, y: n.positionY },
    data: {
      label: n.label ?? DEFAULT_NODE_LABEL,
      note: n.note ?? null,
      nodeType: n.nodeType,
      taskId: n.taskId,
      color,
      colorMeaning: legend[color] || undefined,
      taskStatus: task?.status,
      taskPriority: task?.priority,
    },
  };
}

function dbEdgeToFlow(e: TaskMapEdge): Edge {
  return {
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    label: e.label ?? undefined,
  };
}

/** The editor. Must live inside a ReactFlowProvider (see the default export). */
function FlowCanvasInner({
  taskMapId,
  initialNodes,
  initialEdges,
  initialViewport,
  initialLegend,
  tasks,
  readOnly = false,
}: {
  taskMapId: string;
  initialNodes: TaskMapNode[];
  initialEdges: TaskMapEdge[];
  initialViewport: { x: number; y: number; zoom: number } | null;
  initialLegend: Record<string, string> | null;
  tasks: TaskOption[];
  /**
   * Archived maps are frozen (audit R-12). The repository refuses graph writes
   * for them in SQL, so this is purely so the canvas stops OFFERING edits it
   * knows will be rejected.
   */
  readOnly?: boolean;
}) {
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const [legend, setLegend] = useState<Record<string, string>>(initialLegend ?? {});
  /*
   * A failed delete is resolved by refetching, not by rebuilding the graph by
   * hand (audit R-12). Removal was optimistic with no rollback at all, so a
   * rejected delete (now the normal outcome on an archived map) left the node
   * gone from the canvas and present in the database until a reload. Restoring
   * a node also means restoring the edges that cascaded with it, and
   * reconstructing that from client state is exactly the kind of guesswork that
   * drifts; the server already knows the answer.
   */
  const router = useRouter();

  const [nodes, setNodes, onNodesChange] = useNodesState<GohaNode>(
    initialNodes.map((n) => dbNodeToFlow(n, initialLegend ?? {}, taskById)),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges.map(dbEdgeToFlow));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [isAdding, startAdd] = useTransition();
  const [isTidying, startTidy] = useTransition();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const wrapperRef = useRef<HTMLDivElement>(null);

  // --- Debounced position persistence (final drag position only) ---
  const pending = useRef(new Map<string, { x: number; y: number }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPositions = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current.size === 0) return;
    const positions = [...pending.current.entries()].map(([id, p]) => ({
      id,
      positionX: p.x,
      positionY: p.y,
    }));
    pending.current.clear();
    const res = await moveNodesAction({ taskMapId, positions });
    if (!res.ok) toast.error(res.error);
  }, [taskMapId]);

  const scheduleFlush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushPositions(), POSITION_SAVE_DEBOUNCE_MS);
  }, [flushPositions]);

  const onNodeDragStop = useCallback<OnNodeDrag<GohaNode>>(
    (_event, node, draggedNodes) => {
      const moved = draggedNodes.length > 0 ? draggedNodes : [node];
      for (const n of moved) pending.current.set(n.id, { x: n.position.x, y: n.position.y });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  // Escape closes the add menu. React Flow owns Backspace/Delete on the canvas,
  // so Escape is the only key this component needs to claim.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAddOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Flush any pending position on unmount and before the tab unloads.
  useEffect(() => {
    const handler = () => void flushPositions();
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      void flushPositions();
    };
  }, [flushPositions]);

  // --- Viewport persistence (debounced) ---
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMoveEnd = useCallback(
    (_event: unknown, viewport: { x: number; y: number; zoom: number }) => {
      if (viewportTimer.current) clearTimeout(viewportTimer.current);
      viewportTimer.current = setTimeout(() => {
        void saveViewportAction(taskMapId, viewport);
      }, 600);
    },
    [taskMapId],
  );

  // --- Connect / delete edges ---
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      const res = await addEdgeAction({
        taskMapId,
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Handle ids are dropped on purpose. Loose mode lets the drag start from
      // either handle, so `connection` can name the top handle as the source.
      // Only the two node ids are persisted, so a reload always redraws the edge
      // bottom-to-top; keeping the drag's handles here would make the line jump
      // the first time the page reloaded. What you see is what is stored.
      setEdges((eds) =>
        addEdge(
          { source: connection.source!, target: connection.target!, sourceHandle: null, targetHandle: null, id: res.data.id },
          eds,
        ),
      );
    },
    [taskMapId, setEdges],
  );

  /**
   * Confirm before a keyboard/selection delete, which React Flow performs
   * BEFORE it calls onNodesDelete, so this is the only place a prompt can
   * actually prevent it.
   */
  const onBeforeDelete = useCallback(
    async ({ nodes: doomedNodes, edges: doomedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      const parts: string[] = [];
      if (doomedNodes.length > 0) {
        parts.push(`${doomedNodes.length} node${doomedNodes.length === 1 ? "" : "s"}`);
      }
      if (doomedEdges.length > 0) {
        parts.push(`${doomedEdges.length} connection${doomedEdges.length === 1 ? "" : "s"}`);
      }
      if (parts.length === 0) return true;
      // Deleting a node takes its connections with it, which is not obvious
      // from a selection outline.
      const cascade =
        doomedNodes.length > 0 ? " Connections attached to a deleted node go with it." : "";
      return window.confirm(`Delete ${parts.join(" and ")}?${cascade}`);
    },
    [],
  );

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    // Edges removed by node-cascade are also reported here; a missing edge is a
    // harmless no-op on the server.
    const results = await Promise.all(deleted.map((e) => deleteEdgeAction(e.id)));
    const failure = results.find((r) => !r.ok);
    if (failure && !failure.ok) {
      toast.error(failure.error);
      router.refresh();
    }
  }, [router]);

  // --- Delete nodes ---
  const onNodesDelete = useCallback(async (deleted: Node[]) => {
    for (const n of deleted) pending.current.delete(n.id);
    setSelectedId((cur) => (cur && deleted.some((n) => n.id === cur) ? null : cur));
    const results = await Promise.all(deleted.map((n) => deleteNodeAction(n.id)));
    const failure = results.find((r) => !r.ok);
    if (failure && !failure.ok) {
      toast.error(failure.error);
      router.refresh();
    }
  }, [router]);

  // --- Add node ---
  const addNode = useCallback(
    (nodeType: TaskMapNodeTypeValue) => {
      const wrapper = wrapperRef.current;
      const rect = wrapper?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 0, y: 0 };
      // The visible slice of canvas, in flow coordinates. Insetting by the
      // toolbar's height keeps a new node from landing underneath it, where it
      // would be there but unclickable.
      const TOOLBAR_INSET = 56;
      const topLeft = rect
        ? screenToFlowPosition({ x: rect.left + 16, y: rect.top + TOOLBAR_INSET })
        : null;
      const bottomRight = rect
        ? screenToFlowPosition({ x: rect.right - 16, y: rect.bottom - 16 })
        : null;
      const bounds =
        topLeft && bottomRight
          ? { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y }
          : undefined;

      // Land clear of what is already there AND inside the viewport. Adding
      // three nodes used to stack them at the same point; spiralling without
      // bounds then pushed later nodes off screen entirely, where they could not
      // even be dragged back.
      const position = findFreeSpot(
        nodes.map((n) => n.position),
        center,
        bounds,
      );
      const offScreen = Boolean(
        bounds &&
          (position.x < bounds.minX ||
            position.y < bounds.minY ||
            position.x + NODE_WIDTH > bounds.maxX ||
            position.y + NODE_HEIGHT > bounds.maxY),
      );

      setAddOpen(false);
      startAdd(async () => {
        const res = await addNodeAction({
          taskMapId,
          nodeType,
          label: NODE_TYPE_LABELS[nodeType],
          color: DEFAULT_NODE_COLOR,
          positionX: position.x,
          positionY: position.y,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setNodes((nds) => nds.concat(dbNodeToFlow(res.data, legend, taskById)));
        setSelectedEdgeId(null);
        setSelectedId(res.data.id);
        // The visible area was full, so the node had to go outside it. Fit the
        // whole map rather than centring on the new node: centring hides the
        // nodes that were on screen a moment ago, and a node you cannot see is
        // also a node you cannot drag. Fitting keeps everything reachable.
        if (offScreen) {
          requestAnimationFrame(() => void fitView({ padding: 0.2, maxZoom: 1, duration: 300 }));
        }
      });
    },
    [taskMapId, screenToFlowPosition, setNodes, legend, taskById, nodes, fitView],
  );

  /** Drop a batch of existing tasks onto the canvas as linked nodes. */
  const importTasks = useCallback(
    (taskIds: string[]) => {
      const wrapper = wrapperRef.current;
      const rect = wrapper?.getBoundingClientRect();
      const viewOrigin = rect
        ? screenToFlowPosition({ x: rect.left + 80, y: rect.top + 80 })
        : { x: 0, y: 0 };
      // Land BELOW whatever is already on the canvas. Importing into the
      // viewport's corner every time dropped each batch straight on top of the
      // last one, so a second import looked like it had done nothing.
      const lowest = nodes.reduce((max, n) => Math.max(max, n.position.y), Number.NEGATIVE_INFINITY);
      const origin = {
        x: viewOrigin.x,
        y: nodes.length > 0 ? lowest + 200 : viewOrigin.y,
      };
      startAdd(async () => {
        const res = await importTasksAction({
          taskMapId,
          taskIds,
          originX: origin.x,
          originY: origin.y,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setNodes((nds) => nds.concat(res.data.map((n) => dbNodeToFlow(n, legend, taskById))));
        setImportOpen(false);
        toast.success(`Added ${res.data.length} ${res.data.length === 1 ? "task" : "tasks"} to the map.`);
      });
    },
    [taskMapId, screenToFlowPosition, setNodes, legend, nodes, taskById],
  );

  /**
   * Arrange the map by its connections. Positions are applied locally first so
   * the canvas moves immediately, then persisted through the same move endpoint
   * a drag uses.
   */
  const tidyUp = useCallback(() => {
    if (nodes.length === 0) return;
    // Anchor the layout at the map's existing top-left, so a tidy-up rearranges
    // the map in place instead of teleporting it away from the viewport.
    const origin = {
      x: Math.min(...nodes.map((n) => n.position.x)),
      y: Math.min(...nodes.map((n) => n.position.y)),
    };
    const positioned = layoutMap(
      nodes.map((n) => ({ id: n.id })),
      edges.map((e) => ({ source: e.source, target: e.target })),
      origin,
    );
    const byId = new Map(positioned.map((p) => [p.id, p]));
    setNodes((nds) =>
      nds.map((n) => {
        const p = byId.get(n.id);
        return p ? { ...n, position: { x: p.x, y: p.y } } : n;
      }),
    );
    // A queued drag would otherwise overwrite the new layout a moment later.
    pending.current.clear();
    // Then bring the result into view. A tidy-up of a wide map otherwise pushes
    // most of it outside the viewport, so the button looked like it had thrown
    // the map away. Deferred a frame so React Flow measures the new positions.
    requestAnimationFrame(() => void fitView({ padding: 0.2, maxZoom: 1, duration: 400 }));
    startTidy(async () => {
      const res = await layoutMapAction({
        taskMapId,
        positions: positioned.map((p) => ({ id: p.id, positionX: p.x, positionY: p.y })),
      });
      if (!res.ok) toast.error(res.error);
    });
  }, [nodes, edges, setNodes, taskMapId, fitView]);

  /** Rename a connection, e.g. the "Yes" and "No" leaving a decision. */
  const saveEdgeLabel = useCallback(
    async (id: string, label: string) => {
      const trimmed = label.trim();
      setEdges((eds) =>
        eds.map((e) => (e.id === id ? { ...e, label: trimmed || undefined } : e)),
      );
      const res = await updateEdgeLabelAction(id, trimmed || null);
      if (!res.ok) toast.error(res.error);
    },
    [setEdges],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      if (!window.confirm("Delete this connection?")) return;
      setEdges((eds) => eds.filter((e) => e.id !== id));
      setSelectedEdgeId((cur) => (cur === id ? null : cur));
      void deleteEdgeAction(id).then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          router.refresh();
        }
      });
    },
    [setEdges, router],
  );

  /** Persist the colour legend and re-label every node that uses those colours. */
  const saveLegend = useCallback(
    async (next: Record<string, string>) => {
      setLegend(next);
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, colorMeaning: next[n.data.color] || undefined },
        })),
      );
      const res = await saveLegendAction(taskMapId, next);
      if (!res.ok) toast.error(res.error);
    },
    [taskMapId, setNodes],
  );

  // --- Edit / delete a single node from the inspector ---
  const saveNode = useCallback(
    (
      id: string,
      input: {
        label: string;
        note: string | null;
        nodeType: TaskMapNodeTypeValue;
        taskId: string | null;
        color: NodeColorKey;
      },
    ) =>
      updateNodeAction(id, input).then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setNodes((nds) =>
          nds.map((n) =>
            // Keep the on-canvas position: a drag may not have flushed to the
            // database yet, and taking the server's coordinates here would snap
            // the node back to where it was before the user moved it.
            n.id === id
              ? { ...dbNodeToFlow(res.data, legend, taskById), position: n.position }
              : n,
          ),
        );
        toast.success("Node saved.");
      }),
    [setNodes, legend, taskById],
  );

  const deleteNode = useCallback(
    (id: string) => {
      if (!window.confirm("Delete this node? Connections attached to it go with it.")) {
        return;
      }
      pending.current.delete(id);
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
      void deleteNodeAction(id).then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          router.refresh();
        }
      });
    },
    [setNodes, setEdges, router],
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  /**
   * How much of this map is actually done, counted from the linked tasks rather
   * than from the drawing. A map with no linked task has nothing to report and
   * stays silent instead of showing a hollow 0%.
   */
  const progress = useMemo(() => {
    /*
     * Count each linked TASK once, and ignore cancelled work (audit R-12).
     *
     * Nodes were counted, not tasks, so linking the same task from two nodes
     * (a legitimate way to show one job feeding two branches) counted it twice
     * and could put the map at 50% when its only task was done. Cancelled tasks
     * were also counted in the denominator, so dropping work made the map look
     * less complete, which is the opposite of what happened. This mirrors
     * lib/goal-progress, where cancelled tasks are excluded from both sides.
     */
    const statusByTaskId = new Map<string, TaskStatusLike>();
    for (const node of nodes) {
      const taskId = node.data.taskId;
      const status = node.data.taskStatus;
      if (!taskId || !status) continue;
      statusByTaskId.set(taskId, status);
    }

    const statuses = [...statusByTaskId.values()].filter((s) => s !== "cancelled");
    if (statuses.length === 0) return null;

    const done = statuses.filter((s) => s === "completed").length;
    const doing = statuses.filter((s) => s === "in_progress").length;
    return {
      done,
      doing,
      total: statuses.length,
      percent: Math.round((done / statuses.length) * 100),
    };
  }, [nodes]);

  const toolbarButton =
    "flex h-7 cursor-pointer items-center gap-1 rounded-full px-3 text-footnote font-medium text-label-secondary transition-colors hover:bg-surface-hover hover:text-blue disabled:opacity-50";

  return (
    <div ref={wrapperRef} className="relative size-full">
      <ReactFlow
        style={REACT_FLOW_VARS}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onBeforeDelete={onBeforeDelete}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onMoveEnd={onMoveEnd}
        onNodeClick={(_e, node) => {
          setSelectedEdgeId(null);
          setSelectedId(node.id);
        }}
        onEdgeClick={(_e, edge) => {
          setSelectedId(null);
          setSelectedEdgeId(edge.id);
        }}
        onPaneClick={() => {
          setSelectedId(null);
          setSelectedEdgeId(null);
          setAddOpen(false);
        }}
        defaultEdgeOptions={EDGE_OPTIONS}
        deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesReconnectable={!readOnly}
        // Connecting made forgiving, which was the whole complaint:
        // - `connectionRadius` 60 (default 20) snaps the drop to the nearest
        //   handle from three times further away, so you aim at the NODE rather
        //   than at a 12px dot.
        // - `ConnectionMode.Loose` lets a drag start from either handle, so you
        //   do not have to remember that out is the bottom and in is the top.
        connectionRadius={60}
        connectionMode={ConnectionMode.Loose}
        colorMode={isDark ? "dark" : "light"}
        defaultViewport={initialViewport ?? undefined}
        fitView={!initialViewport}
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        {/* A squared grid rather than dots: graph paper, with a heavier line
            every fifth cell so the canvas keeps a sense of scale as you zoom.
            The cell is 40px rather than the 20 I first tried, because a map is
            usually viewed zoomed OUT: at 0.6x a 20px cell collapses to 11px on
            screen and reads as a grey wash instead of squares. Both tiers are
            token-coloured, so they follow light and dark with everything else. */}
        <Background
          id="grid-cells"
          variant={BackgroundVariant.Lines}
          gap={40}
          lineWidth={1}
          color="var(--grid-line)"
        />
        <Background
          id="grid-major"
          variant={BackgroundVariant.Lines}
          gap={200}
          lineWidth={1}
          color="var(--grid-line-strong)"
        />
        {/* React Flow ships 26px control buttons. On a phone that is under any
            reasonable tap size, so the buttons are sized from here instead. */}
        <Controls showInteractive={false} className="[&_button]:!size-9 md:[&_button]:!size-7" />
        {/* Sized and themed explicitly: React Flow's default is a large opaque
            white panel that reads as a hole punched in the canvas. */}
        <MiniMap
          pannable
          zoomable
          className="!hidden overflow-hidden rounded-xl border border-separator-opaque !bg-surface-secondary shadow-e2 md:!block"
          style={{ width: 180, height: 120 }}
          nodeColor="var(--gray-3)"
          nodeStrokeColor="var(--gray-2)"
          nodeBorderRadius={3}
          maskColor="color-mix(in oklab, var(--canvas) 70%, transparent)"
        />
        {readOnly ? null : (
        <Panel position="top-center">
          <div className="relative">
            <div className="glass-regular flex flex-wrap items-center gap-1 rounded-full p-1 shadow-e2">
              {/* Seven types behind one button: the toolbar stays a toolbar, and
                  each type gets room to explain what it is for. */}
              <button
                type="button"
                onClick={() => setAddOpen((v) => !v)}
                disabled={isAdding}
                aria-expanded={addOpen}
                className={cn(toolbarButton, addOpen && "bg-surface-hover text-blue")}
              >
                <Plus className="size-4" aria-hidden /> Add node
              </button>

              <span className="mx-1 h-4 w-px bg-separator" aria-hidden />

              {/* The fast way to a map with real work on it. */}
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                disabled={isAdding || tasks.length === 0}
                className={toolbarButton}
                title={tasks.length === 0 ? "No tasks to import yet" : "Add existing tasks to this map"}
              >
                <Download className="size-4" aria-hidden /> Import tasks
              </button>
              <button
                type="button"
                onClick={tidyUp}
                disabled={isTidying || nodes.length === 0}
                className={toolbarButton}
                title="Arrange the map by its connections"
              >
                <Sparkles className="size-4" aria-hidden /> Tidy up
              </button>
              <button
                type="button"
                onClick={() => setLegendOpen((v) => !v)}
                className={cn(toolbarButton, legendOpen && "text-blue")}
              >
                <Palette className="size-4" aria-hidden /> Legend
              </button>
            </div>

            {addOpen ? (
              <div
                role="group"
                aria-label="Node types"
                className="glass-thick absolute left-0 top-10 z-10 flex w-72 flex-col rounded-2xl p-1.5 shadow-e3"
              >
                {TASK_MAP_NODE_TYPES.map((type) => {
                  const Icon = NODE_TYPE_ICON[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addNode(type)}
                      disabled={isAdding}
                      // Named explicitly: the visible hint would otherwise run
                      // into the accessible name and make it a paragraph.
                      aria-label={`Add ${NODE_TYPE_LABELS[type]} node`}
                      className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface-hover disabled:opacity-50"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg",
                          nodeTypeConfig[type].chip,
                        )}
                        aria-hidden
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-callout font-medium text-label">
                          {NODE_TYPE_LABELS[type]}
                        </span>
                        <span className="block text-footnote text-label-secondary">
                          {nodeTypeConfig[type].hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </Panel>
        )}

        {legendOpen && !readOnly ? (
          <Panel position="top-left">
            <LegendEditor legend={legend} onSave={saveLegend} onClose={() => setLegendOpen(false)} />
          </Panel>
        ) : (
          <LegendKey legend={legend} />
        )}

        {progress ? (
          <Panel position="bottom-center">
            <MapProgress {...progress} />
          </Panel>
        ) : null}
      </ReactFlow>

      {importOpen ? (
        <ImportTasksDialog
          tasks={tasks}
          alreadyOnMap={new Set(nodes.map((n) => n.data.taskId).filter(Boolean) as string[])}
          busy={isAdding}
          onImport={importTasks}
          onClose={() => setImportOpen(false)}
        />
      ) : null}

      {selectedNode ? (
        <NodeInspector
          key={selectedNode.id}
          node={selectedNode}
          tasks={tasks}
          legend={legend}
          onSave={saveNode}
          onDelete={deleteNode}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {selectedEdge ? (
        <EdgeInspector
          key={selectedEdge.id}
          edge={selectedEdge}
          sourceLabel={nodes.find((n) => n.id === selectedEdge.source)?.data.label ?? ""}
          targetLabel={nodes.find((n) => n.id === selectedEdge.target)?.data.label ?? ""}
          onSave={saveEdgeLabel}
          onDelete={deleteEdge}
          onClose={() => setSelectedEdgeId(null)}
        />
      ) : null}
    </div>
  );
}

/** Done / doing / total across every node linked to a real task. */
function MapProgress({
  done,
  doing,
  total,
  percent,
}: {
  done: number;
  doing: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="glass-regular flex items-center gap-3 rounded-full py-1.5 pl-3 pr-4 shadow-e2">
      <ListChecks className="size-4 shrink-0 text-label-secondary" aria-hidden />
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-fill-tertiary"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Map progress"
      >
        <span
          className="block h-full rounded-full bg-green transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-footnote tabular-nums text-label">
        {done}/{total}
      </span>
      <span className="text-footnote text-label-secondary">
        {doing > 0 ? `${doing} in progress` : percent === 100 ? "Map complete" : "linked tasks done"}
      </span>
    </div>
  );
}

/** Rename or remove a connection. A decision's branches live here. */
function EdgeInspector({
  edge,
  sourceLabel,
  targetLabel,
  onSave,
  onDelete,
  onClose,
}: {
  edge: Edge;
  sourceLabel: string;
  targetLabel: string;
  onSave: (id: string, label: string) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(typeof edge.label === "string" ? edge.label : "");
  const [isSaving, startSave] = useTransition();

  function commit() {
    startSave(async () => {
      await onSave(edge.id, label);
      onClose();
    });
  }

  return (
    <aside className="absolute bottom-3 right-3 z-10 flex w-72 max-w-[calc(100%-1.5rem)] flex-col gap-3 rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e3">
      <div className="flex items-center justify-between">
        <h3 className="text-headline text-label">Connection</h3>
        <button
          type="button"
          onClick={onClose}
          className="hit-44 cursor-pointer rounded-md px-2 text-footnote font-medium text-blue hover:underline"
        >
          Done
        </button>
      </div>

      <p className="text-footnote text-label-secondary">
        <span className="text-label">{sourceLabel || "Node"}</span> to{" "}
        <span className="text-label">{targetLabel || "node"}</span>
      </p>

      <label className="space-y-1">
        <span className="text-subhead text-label-secondary">Label</span>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          maxLength={40}
          placeholder="Yes, No, then..."
        />
      </label>

      <div className="flex flex-wrap gap-1.5">
        {["Yes", "No", "Then", "If blocked"].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setLabel(preset)}
            className="cursor-pointer rounded-full bg-fill-tertiary px-2.5 py-1 text-footnote text-label-secondary transition-colors hover:bg-fill-secondary hover:text-label"
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-red hover:text-red"
          onClick={() => onDelete(edge.id)}
        >
          <Trash2 className="size-4" aria-hidden /> Remove
        </Button>
        <Button size="sm" loading={isSaving} onClick={commit}>
          Save
        </Button>
      </div>
    </aside>
  );
}

/**
 * Name what each colour means on THIS map. Empty labels are dropped, so an
 * unused colour never clutters the key.
 */
function LegendEditor({
  legend,
  onSave,
  onClose,
}: {
  legend: Record<string, string>;
  onSave: (next: Record<string, string>) => void | Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(legend);

  function commit(next: Record<string, string>) {
    const cleaned = Object.fromEntries(
      Object.entries(next)
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v.length > 0),
    );
    void onSave(cleaned);
  }

  return (
    <aside className="glass-regular flex w-64 flex-col gap-2 rounded-2xl p-3 shadow-e3">
      <div className="flex items-center justify-between">
        <h3 className="text-headline text-label">What colours mean</h3>
        <button
          type="button"
          onClick={() => {
            commit(draft);
            onClose();
          }}
          className="hit-44 cursor-pointer rounded-md px-2 text-footnote font-medium text-blue hover:underline"
        >
          Done
        </button>
      </div>
      <p className="text-footnote text-label-secondary">
        Yours to define. Leave one blank to hide it.
      </p>

      {NODE_COLOR_KEYS.filter((key) => key !== "neutral").map((key) => (
        <label key={key} className="flex items-center gap-2">
          <span className={cn("size-4 shrink-0 rounded-full", nodeColorConfig[key].swatch)} aria-hidden />
          <input
            value={draft[key] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            onBlur={() => commit(draft)}
            maxLength={LEGEND_LABEL_MAX}
            placeholder={SUGGESTED_LEGEND[key] ?? nodeColorConfig[key].label}
            aria-label={`What ${nodeColorConfig[key].label} means`}
            className="h-7 w-full min-w-0 rounded-md bg-fill-tertiary px-2 text-callout text-label placeholder:text-label-tertiary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
          />
        </label>
      ))}

      <button
        type="button"
        onClick={() => {
          setDraft(SUGGESTED_LEGEND);
          commit(SUGGESTED_LEGEND);
        }}
        className="mt-1 cursor-pointer self-start text-footnote font-medium text-blue hover:underline"
      >
        Use suggested labels
      </button>
    </aside>
  );
}

/** The read-only key, shown on the canvas once colours have been named. */
function LegendKey({ legend }: { legend: Record<string, string> }) {
  const entries = NODE_COLOR_KEYS.filter((key) => legend[key]);
  if (entries.length === 0) return null;

  return (
    <Panel position="top-left">
      <div className="glass-regular flex max-w-56 flex-col gap-1.5 rounded-xl p-2.5 shadow-e2">
        {entries.map((key) => (
          <span key={key} className="flex items-center gap-2 text-footnote text-label-secondary">
            <span className={cn("size-2.5 shrink-0 rounded-full", nodeColorConfig[key].swatch)} aria-hidden />
            <span className="truncate">{legend[key]}</span>
          </span>
        ))}
      </div>
    </Panel>
  );
}

/** Pick existing tasks to drop onto the canvas, laid out for you. */
function ImportTasksDialog({
  tasks,
  alreadyOnMap,
  busy,
  onImport,
  onClose,
}: {
  tasks: TaskOption[];
  alreadyOnMap: Set<string>;
  busy: boolean;
  onImport: (taskIds: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  // Escape closes it, like every other dialog in the app.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const available = tasks.filter((t) => !alreadyOnMap.has(t.id));
  const visible = query.trim()
    ? available.filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()))
    : available;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-overlay"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-tasks-title"
        className="glass-thick relative flex max-h-full w-full max-w-md flex-col gap-3 rounded-3xl p-4 shadow-e3"
      >
        <div className="flex items-center justify-between">
          <h3 id="import-tasks-title" className="text-headline text-label">
            Add tasks to this map
          </h3>
          <span className="font-mono text-footnote tabular-nums text-label-secondary">
            {selected.size} selected
          </span>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-label-tertiary"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your tasks..."
            aria-label="Search tasks"
            className="pl-8"
          />
        </div>

        {available.length === 0 ? (
          <p className="rounded-lg bg-fill-quaternary px-3 py-6 text-center text-callout text-label-secondary">
            Every one of your tasks is already on this map.
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col overflow-y-auto">
            {visible.map((task) => {
              const isSelected = selected.has(task.id);
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => toggle(task.id)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-sm border-[1.5px] transition-colors",
                        isSelected ? "border-transparent bg-blue text-white" : "border-gray-3",
                      )}
                      aria-hidden
                    >
                      {isSelected ? <Check className="size-3 stroke-2" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body text-label">{task.title}</span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 ? (
              <li className="px-2 py-6 text-center text-callout text-label-secondary">
                Nothing matches “{query}”.
              </li>
            ) : null}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-separator pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={busy}
            disabled={selected.size === 0}
            onClick={() => onImport([...selected])}
          >
            Add {selected.size > 0 ? selected.size : ""} to map
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Right-hand editor for the selected node. Remounted per node id (key) so its
 * fields initialise from the node without a reset effect. */
function NodeInspector({
  node,
  tasks,
  legend,
  onSave,
  onDelete,
  onClose,
}: {
  node: GohaNode;
  tasks: TaskOption[];
  legend: Record<string, string>;
  onSave: (
    id: string,
    input: {
      label: string;
      note: string | null;
      nodeType: TaskMapNodeTypeValue;
      taskId: string | null;
      color: NodeColorKey;
    },
  ) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(node.data.label);
  const [note, setNote] = useState(node.data.note ?? "");
  const [nodeType, setNodeType] = useState<TaskMapNodeTypeValue>(node.data.nodeType);
  const [taskId, setTaskId] = useState<string>(node.data.taskId ?? "");
  const [color, setColor] = useState<NodeColorKey>(node.data.color);
  const [isSaving, startSave] = useTransition();
  const type = nodeTypeConfig[nodeType];
  const linkedTask = taskId ? tasks.find((t) => t.id === taskId) : undefined;

  return (
    // Anchored BOTTOM-right: pinned to the top it overlapped the centred
    // add-node toolbar on a narrower canvas and swallowed its clicks, so
    // "Milestone" could not be pressed while a node was selected.
    <aside className="absolute bottom-3 right-3 z-10 flex max-h-[calc(100%-1.5rem)] w-72 max-w-[calc(100%-1.5rem)] flex-col gap-3 overflow-y-auto rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e3">
      <div className="flex items-center justify-between">
        <h3 className="text-headline text-label">Edit node</h3>
        <button
          type="button"
          onClick={onClose}
          className="hit-44 cursor-pointer rounded-md px-2 text-footnote font-medium text-blue hover:underline"
        >
          Done
        </button>
      </div>

      <label className="space-y-1">
        <span className="text-subhead text-label-secondary">Label</span>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Node label" />
      </label>

      <label className="space-y-1">
        <span className="text-subhead text-label-secondary">
          {type.body ? "Note" : "Note (optional)"}
        </span>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NODE_NOTE_MAX}
          rows={4}
          placeholder={
            type.body
              ? "Write it here. It shows on the node."
              : "Detail, a caveat, a link. Shows on the node."
          }
        />
      </label>

      <label className="space-y-1">
        <span className="text-subhead text-label-secondary">Type</span>
        <Select
          value={nodeType}
          onChange={(v) => setNodeType(v as TaskMapNodeTypeValue)}
          options={TASK_MAP_NODE_TYPES.map((t) => ({ value: t, label: NODE_TYPE_LABELS[t] }))}
        />
      </label>
      <p className="-mt-1.5 text-footnote text-label-secondary">{type.hint}</p>

      <div className="space-y-1.5">
        <span className="text-subhead text-label-secondary">Colour</span>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Node colour">
          {NODE_COLOR_KEYS.map((key) => {
            const meaning = legend[key];
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={color === key}
                aria-label={meaning ? `${nodeColorConfig[key].label}: ${meaning}` : nodeColorConfig[key].label}
                title={meaning ?? nodeColorConfig[key].label}
                onClick={() => setColor(key)}
                className={cn(
                  "size-6 cursor-pointer rounded-full transition-transform hover:scale-110",
                  nodeColorConfig[key].swatch,
                  color === key && "outline-solid outline-2 outline-offset-2 outline-label-tertiary",
                )}
              />
            );
          })}
        </div>
        {legend[color] ? (
          <p className="text-footnote text-label-secondary">Means: {legend[color]}</p>
        ) : null}
      </div>

      <label className="space-y-1">
        <span className="text-subhead text-label-secondary">Linked task</span>
        <Select
          value={taskId}
          onChange={setTaskId}
          options={[
            { value: "", label: "No linked task" },
            ...tasks.map((t) => ({ value: t.id, label: t.title })),
          ]}
        />
      </label>

      {linkedTask ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-fill-quaternary px-2.5 py-2">
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-footnote",
              STATUS_CHIP[linkedTask.status ?? "todo"]?.className ?? "bg-gray-5 text-label-secondary",
            )}
          >
            {STATUS_CHIP[linkedTask.status ?? "todo"]?.label ?? "To do"}
          </span>
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 text-callout font-medium text-blue hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden /> Open in To-dos
          </Link>
        </div>
      ) : null}

      <div className="mt-1 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-red hover:text-red"
          onClick={() => onDelete(node.id)}
        >
          <Trash2 className="size-4" aria-hidden /> Delete
        </Button>
        <Button
          size="sm"
          loading={isSaving}
          onClick={() =>
            startSave(async () => {
              await onSave(node.id, {
                label: label.trim(),
                note: note.trim() || null,
                nodeType,
                taskId: taskId || null,
                color,
              });
            })
          }
        >
          Save
        </Button>
      </div>
    </aside>
  );
}

export default function FlowCanvas(props: {
  taskMapId: string;
  initialNodes: TaskMapNode[];
  initialEdges: TaskMapEdge[];
  initialViewport: { x: number; y: number; zoom: number } | null;
  initialLegend: Record<string, string> | null;
  tasks: TaskOption[];
  /**
   * Archived maps are frozen (audit R-12). The repository refuses graph writes
   * for them in SQL, so this is purely so the canvas stops OFFERING edits it
   * knows will be rejected.
   */
  readOnly?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
