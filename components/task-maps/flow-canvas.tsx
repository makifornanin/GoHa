"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  BackgroundVariant,
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
  Link2,
  Palette,
  Plus,
  Search,
  StickyNote,
  Target,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { TaskMapEdge, TaskMapNode } from "@/db/types";
import {
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_LABEL,
  LEGEND_LABEL_MAX,
  NODE_COLOR_KEYS,
  NODE_TYPE_LABELS,
  nodeColorConfig,
  nodeColorOf,
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
  moveNodesAction,
  saveLegendAction,
  saveViewportAction,
  updateNodeAction,
} from "@/app/(app)/task-maps/actions";

export type TaskOption = { id: string; title: string };

type GohaNodeData = {
  label: string;
  nodeType: TaskMapNodeTypeValue;
  taskId: string | null;
  color: NodeColorKey;
  /** What this colour means on this map, if the user has named it. */
  colorMeaning?: string;
};
type GohaNode = Node<GohaNodeData, "goha">;

const NODE_CHIP: Record<TaskMapNodeTypeValue, string> = {
  task: "bg-blue/15 text-blue",
  note: "bg-purple/15 text-purple",
  milestone: "bg-indigo/15 text-indigo",
  group: "bg-gray-5 text-label-secondary",
};

/**
 * Custom node. The colour is the node's own, tinting its surface, border and a
 * top rail, so a glance across the canvas reads as a map of what is hard, quick
 * or blocked rather than a wall of identical cards.
 */
function GohaNodeView({ data, selected }: NodeProps<GohaNode>) {
  const color = nodeColorConfig[data.color];
  const isNeutral = data.color === "neutral";

  return (
    <div
      // NOT `overflow-hidden`: React Flow's connect handles sit ON the node's
      // edges and are clipped by it, which silently made nodes impossible to
      // connect. The colour rail rounds its own corners instead.
      className={cn(
        "relative w-48 rounded-xl border p-3 shadow-e2 transition-shadow",
        isNeutral ? "bg-surface" : color.tint,
        selected ? "border-blue ring-[3px] ring-blue/40" : color.border,
      )}
      title={data.colorMeaning ? `${color.label}: ${data.colorMeaning}` : undefined}
    >
      {!isNeutral ? (
        <span
          className={cn("absolute inset-x-0 top-0 h-1 rounded-t-[11px]", color.dot)}
          aria-hidden
        />
      ) : null}
      <Handle type="target" position={Position.Top} className="!size-2 !border !border-surface !bg-blue" />
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-footnote", NODE_CHIP[data.nodeType])}>
          {NODE_TYPE_LABELS[data.nodeType]}
        </span>
        {data.taskId ? <Link2 className="size-3.5 text-blue" aria-label="Linked to a task" /> : null}
      </div>
      <p className="line-clamp-3 break-words text-body text-label">
        {data.label || DEFAULT_NODE_LABEL}
      </p>
      {data.colorMeaning ? (
        <p className="mt-1.5 truncate text-footnote text-label-secondary">{data.colorMeaning}</p>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!size-2 !border !border-surface !bg-blue" />
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
};

function dbNodeToFlow(n: TaskMapNode, legend: Record<string, string> = {}): GohaNode {
  const color = nodeColorOf(n.data);
  return {
    id: n.id,
    type: "goha",
    position: { x: n.positionX, y: n.positionY },
    data: {
      label: n.label ?? DEFAULT_NODE_LABEL,
      nodeType: n.nodeType,
      taskId: n.taskId,
      color,
      colorMeaning: legend[color] || undefined,
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
}: {
  taskMapId: string;
  initialNodes: TaskMapNode[];
  initialEdges: TaskMapEdge[];
  initialViewport: { x: number; y: number; zoom: number } | null;
  initialLegend: Record<string, string> | null;
  tasks: TaskOption[];
}) {
  const [legend, setLegend] = useState<Record<string, string>>(initialLegend ?? {});
  const [nodes, setNodes, onNodesChange] = useNodesState<GohaNode>(
    initialNodes.map((n) => dbNodeToFlow(n, initialLegend ?? {})),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges.map(dbEdgeToFlow));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isAdding, startAdd] = useTransition();
  const { screenToFlowPosition } = useReactFlow();
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
      setEdges((eds) => addEdge({ ...connection, id: res.data.id }, eds));
    },
    [taskMapId, setEdges],
  );

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    // Edges removed by node-cascade are also reported here; a missing edge is a
    // harmless no-op on the server.
    await Promise.all(deleted.map((e) => deleteEdgeAction(e.id)));
  }, []);

  // --- Delete nodes ---
  const onNodesDelete = useCallback(async (deleted: Node[]) => {
    for (const n of deleted) pending.current.delete(n.id);
    setSelectedId((cur) => (cur && deleted.some((n) => n.id === cur) ? null : cur));
    const results = await Promise.all(deleted.map((n) => deleteNodeAction(n.id)));
    const failure = results.find((r) => !r.ok);
    if (failure && !failure.ok) toast.error(failure.error);
  }, []);

  // --- Add node ---
  const addNode = useCallback(
    (nodeType: TaskMapNodeTypeValue) => {
      const wrapper = wrapperRef.current;
      const rect = wrapper?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 0, y: 0 };
      const jitter = () => Math.round((Math.random() - 0.5) * 48);
      const position = { x: center.x + jitter(), y: center.y + jitter() };
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
        setNodes((nds) => nds.concat(dbNodeToFlow(res.data, legend)));
        setSelectedId(res.data.id);
      });
    },
    [taskMapId, screenToFlowPosition, setNodes, legend],
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
        setNodes((nds) => nds.concat(res.data.map((n) => dbNodeToFlow(n, legend))));
        setImportOpen(false);
        toast.success(`Added ${res.data.length} ${res.data.length === 1 ? "task" : "tasks"} to the map.`);
      });
    },
    [taskMapId, screenToFlowPosition, setNodes, legend, nodes],
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
            n.id === id ? { ...dbNodeToFlow(res.data, legend), position: n.position } : n,
          ),
        );
        toast.success("Node saved.");
      }),
    [setNodes, legend],
  );

  const deleteNode = useCallback(
    (id: string) => {
      pending.current.delete(id);
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
      void deleteNodeAction(id).then((res) => {
        if (!res.ok) toast.error(res.error);
      });
    },
    [setNodes, setEdges],
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

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
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onMoveEnd={onMoveEnd}
        onNodeClick={(_e, node) => setSelectedId(node.id)}
        onPaneClick={() => setSelectedId(null)}
        defaultEdgeOptions={EDGE_OPTIONS}
        deleteKeyCode={["Backspace", "Delete"]}
        colorMode={isDark ? "dark" : "light"}
        defaultViewport={initialViewport ?? undefined}
        fitView={!initialViewport}
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--gray-3)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          className="!hidden md:!block"
          nodeColor="var(--outline-variant)"
          nodeStrokeColor="var(--outline)"
          maskColor="color-mix(in oklab, var(--surface) 55%, transparent)"
        />
        <Panel position="top-center">
          <div className="glass-regular flex flex-wrap items-center gap-1 rounded-full p-1 shadow-e2">
            <button type="button" onClick={() => addNode("task")} disabled={isAdding} className={toolbarButton}>
              <Plus className="size-4" aria-hidden /> Task
            </button>
            <button type="button" onClick={() => addNode("note")} disabled={isAdding} className={toolbarButton}>
              <StickyNote className="size-4" aria-hidden /> Note
            </button>
            <button type="button" onClick={() => addNode("milestone")} disabled={isAdding} className={toolbarButton}>
              <Target className="size-4" aria-hidden /> Milestone
            </button>
            <button type="button" onClick={() => addNode("group")} disabled={isAdding} className={toolbarButton}>
              <Boxes className="size-4" aria-hidden /> Group
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
              onClick={() => setLegendOpen((v) => !v)}
              className={cn(toolbarButton, legendOpen && "text-blue")}
            >
              <Palette className="size-4" aria-hidden /> Legend
            </button>
          </div>
        </Panel>

        {legendOpen ? (
          <Panel position="top-left">
            <LegendEditor legend={legend} onSave={saveLegend} onClose={() => setLegendOpen(false)} />
          </Panel>
        ) : (
          <LegendKey legend={legend} />
        )}
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
    </div>
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
      <div className="glass-thick relative flex max-h-full w-full max-w-md flex-col gap-3 rounded-3xl p-4 shadow-e3">
        <div className="flex items-center justify-between">
          <h3 className="text-headline text-label">Add tasks to this map</h3>
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
      nodeType: TaskMapNodeTypeValue;
      taskId: string | null;
      color: NodeColorKey;
    },
  ) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(node.data.label);
  const [nodeType, setNodeType] = useState<TaskMapNodeTypeValue>(node.data.nodeType);
  const [taskId, setTaskId] = useState<string>(node.data.taskId ?? "");
  const [color, setColor] = useState<NodeColorKey>(node.data.color);
  const [isSaving, startSave] = useTransition();

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
        <span className="text-subhead text-label-secondary">Type</span>
        <Select
          value={nodeType}
          onChange={(v) => setNodeType(v as TaskMapNodeTypeValue)}
          options={TASK_MAP_NODE_TYPES.map((t) => ({ value: t, label: NODE_TYPE_LABELS[t] }))}
        />
      </label>

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

      {taskId ? (
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 text-callout font-medium text-blue hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden /> Open in To-dos
        </Link>
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
              await onSave(node.id, { label: label.trim(), nodeType, taskId: taskId || null, color });
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
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
