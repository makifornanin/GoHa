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
import { ExternalLink, Link2, Plus, StickyNote, Target, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { TaskMapEdge, TaskMapNode } from "@/db/types";
import {
  DEFAULT_NODE_LABEL,
  NODE_TYPE_LABELS,
  POSITION_SAVE_DEBOUNCE_MS,
  TASK_MAP_NODE_TYPES,
  type TaskMapNodeTypeValue,
} from "@/lib/task-maps";
import { cn } from "@/lib/utils";
import {
  addEdgeAction,
  addNodeAction,
  deleteEdgeAction,
  deleteNodeAction,
  moveNodesAction,
  saveViewportAction,
  updateNodeAction,
} from "@/app/(app)/task-maps/actions";

export type TaskOption = { id: string; title: string };

type GohaNodeData = {
  label: string;
  nodeType: TaskMapNodeTypeValue;
  taskId: string | null;
};
type GohaNode = Node<GohaNodeData, "goha">;

const NODE_CHIP: Record<TaskMapNodeTypeValue, string> = {
  task: "bg-primary-container text-on-primary-container",
  note: "bg-tertiary-container text-on-tertiary-container",
  milestone: "bg-secondary-container text-on-secondary-container",
  group: "bg-surface-variant text-on-surface-variant",
};

/** Custom node: a card matching the design's step/note tiles, with connect handles. */
function GohaNodeView({ data, selected }: NodeProps<GohaNode>) {
  return (
    <div
      className={cn(
        "raised node-shadow w-48 rounded-lg border bg-surface-container-lowest p-3 transition-shadow",
        selected ? "border-primary ring-2 ring-primary/40" : "border-outline-variant/70",
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !border !border-surface !bg-primary" />
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-label-sm", NODE_CHIP[data.nodeType])}>
          {NODE_TYPE_LABELS[data.nodeType]}
        </span>
        {data.taskId ? <Link2 className="size-3.5 text-primary" aria-label="Linked to a task" /> : null}
      </div>
      <p className="line-clamp-3 break-words text-body-md text-on-surface">
        {data.label || DEFAULT_NODE_LABEL}
      </p>
      <Handle type="source" position={Position.Bottom} className="!size-2 !border !border-surface !bg-primary" />
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
  "--xy-edge-stroke-default": "var(--outline)",
  "--xy-edge-stroke-selected-default": "var(--primary)",
  "--xy-connectionline-stroke-default": "var(--primary)",
  "--xy-background-color-default": "var(--surface)",
  "--xy-attribution-background-color-default": "transparent",
  "--xy-controls-button-background-color-default": "var(--surface-container)",
  "--xy-controls-button-background-color-hover-default": "var(--surface-container-high)",
  "--xy-controls-button-color-default": "var(--on-surface-variant)",
  "--xy-controls-button-color-hover-default": "var(--on-surface)",
  "--xy-controls-button-border-color-default": "var(--outline-variant)",
  "--xy-minimap-background-color-default": "var(--surface-container-low)",
} as CSSProperties;

const EDGE_OPTIONS = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "var(--outline)" },
  style: { stroke: "var(--outline)", strokeWidth: 2 },
};

function dbNodeToFlow(n: TaskMapNode): GohaNode {
  return {
    id: n.id,
    type: "goha",
    position: { x: n.positionX, y: n.positionY },
    data: {
      label: n.label ?? DEFAULT_NODE_LABEL,
      nodeType: n.nodeType,
      taskId: n.taskId,
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
  tasks,
}: {
  taskMapId: string;
  initialNodes: TaskMapNode[];
  initialEdges: TaskMapEdge[];
  initialViewport: { x: number; y: number; zoom: number } | null;
  tasks: TaskOption[];
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<GohaNode>(initialNodes.map(dbNodeToFlow));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges.map(dbEdgeToFlow));
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
          positionX: position.x,
          positionY: position.y,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setNodes((nds) => nds.concat(dbNodeToFlow(res.data)));
        setSelectedId(res.data.id);
      });
    },
    [taskMapId, screenToFlowPosition, setNodes],
  );

  // --- Edit / delete a single node from the inspector ---
  const saveNode = useCallback(
    (id: string, input: { label: string; nodeType: TaskMapNodeTypeValue; taskId: string | null }) =>
      updateNodeAction(id, input).then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    label: res.data.label ?? DEFAULT_NODE_LABEL,
                    nodeType: res.data.nodeType,
                    taskId: res.data.taskId,
                  },
                }
              : n,
          ),
        );
        toast.success("Node saved.");
      }),
    [setNodes],
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
    "flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary disabled:opacity-50";

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
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--outline-variant)" />
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
          <div className="raised node-shadow flex items-center gap-1 rounded-full border border-outline-variant/70 bg-surface-container-lowest p-1">
            <button type="button" onClick={() => addNode("task")} disabled={isAdding} className={toolbarButton}>
              <Plus className="size-4" aria-hidden /> Task
            </button>
            <button type="button" onClick={() => addNode("note")} disabled={isAdding} className={toolbarButton}>
              <StickyNote className="size-4" aria-hidden /> Note
            </button>
            <button type="button" onClick={() => addNode("milestone")} disabled={isAdding} className={toolbarButton}>
              <Target className="size-4" aria-hidden /> Milestone
            </button>
          </div>
        </Panel>
      </ReactFlow>

      {selectedNode ? (
        <NodeInspector
          key={selectedNode.id}
          node={selectedNode}
          tasks={tasks}
          onSave={saveNode}
          onDelete={deleteNode}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

/** Right-hand editor for the selected node. Remounted per node id (key) so its
 * fields initialise from the node without a reset effect. */
function NodeInspector({
  node,
  tasks,
  onSave,
  onDelete,
  onClose,
}: {
  node: GohaNode;
  tasks: TaskOption[];
  onSave: (
    id: string,
    input: { label: string; nodeType: TaskMapNodeTypeValue; taskId: string | null },
  ) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(node.data.label);
  const [nodeType, setNodeType] = useState<TaskMapNodeTypeValue>(node.data.nodeType);
  const [taskId, setTaskId] = useState<string>(node.data.taskId ?? "");
  const [isSaving, startSave] = useTransition();

  return (
    <aside className="raised card-shadow absolute right-3 top-3 z-10 flex w-72 max-w-[calc(100%-1.5rem)] flex-col gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-label-md text-on-surface">Edit node</h3>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-md px-2 text-label-sm text-on-surface-variant hover:text-on-surface"
        >
          Done
        </button>
      </div>

      <label className="space-y-1">
        <span className="text-label-sm uppercase text-on-surface-variant">Label</span>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Node label" />
      </label>

      <label className="space-y-1">
        <span className="text-label-sm uppercase text-on-surface-variant">Type</span>
        <Select value={nodeType} onChange={(e) => setNodeType(e.target.value as TaskMapNodeTypeValue)}>
          {TASK_MAP_NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {NODE_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </label>

      <label className="space-y-1">
        <span className="text-label-sm uppercase text-on-surface-variant">Linked task</span>
        <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
          <option value="">No linked task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>
      </label>

      {taskId ? (
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 text-label-md text-primary hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden /> Open in To-dos
        </Link>
      ) : null}

      <div className="mt-1 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-error hover:text-error"
          onClick={() => onDelete(node.id)}
        >
          <Trash2 className="size-4" aria-hidden /> Delete
        </Button>
        <Button
          size="sm"
          loading={isSaving}
          onClick={() =>
            startSave(async () => {
              await onSave(node.id, { label: label.trim(), nodeType, taskId: taskId || null });
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
  tasks: TaskOption[];
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
