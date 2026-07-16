"use client";

import {
  Archive,
  ArchiveRestore,
  Network,
  Pencil,
  Plus,
  Trash2,
  Waypoints,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type { TaskMap, TaskMapEdge, TaskMapNode } from "@/db/types";
import { cn } from "@/lib/utils";
import {
  archiveTaskMapAction,
  createTaskMapAction,
  deleteTaskMapAction,
  restoreTaskMapAction,
  updateTaskMapAction,
} from "@/app/(app)/task-maps/actions";

import type { TaskOption } from "./flow-canvas";

const FlowCanvas = dynamic(() => import("./flow-canvas"), {
  ssr: false,
  loading: () => <CanvasLoading />,
});

type Graph = { map: TaskMap; nodes: TaskMapNode[]; edges: TaskMapEdge[] };

export function TaskMapsWorkspace({
  maps,
  graph,
  activeMapId,
  tasks,
}: {
  maps: TaskMap[];
  graph: Graph | null;
  activeMapId: string | null;
  tasks: TaskOption[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editMap, setEditMap] = useState<TaskMap | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskMap | null>(null);
  const [pending, startTransition] = useTransition();

  const active = maps.filter((m) => !m.isArchived);
  const archived = maps.filter((m) => m.isArchived);

  function selectHref(id: string) {
    return `/task-maps?map=${id}`;
  }

  function handleArchive(map: TaskMap) {
    startTransition(async () => {
      const res = await archiveTaskMapAction(map.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Map archived.");
      router.refresh();
    });
  }

  function handleRestore(map: TaskMap) {
    startTransition(async () => {
      const res = await restoreTaskMapAction(map.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Map restored.");
      router.refresh();
    });
  }

  function handleDelete(map: TaskMap) {
    startTransition(async () => {
      const res = await deleteTaskMapAction(map.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Map deleted.");
      setDeleteTarget(null);
      if (map.id === activeMapId) router.push("/task-maps");
      else router.refresh();
    });
  }

  if (maps.length === 0) {
    return (
      <>
        <EmptyState
          icon={Waypoints}
          title="No task maps yet"
          description="Task maps let you sketch how tasks and ideas connect. Create your first map to start building a branching flow."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden /> New map
            </Button>
          }
        />
        <CreateMapModal open={createOpen} onClose={() => setCreateOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Explorer */}
        <aside className="flex max-h-[40vh] flex-col rounded-2xl border border-separator-opaque bg-surface shadow-e1 lg:max-h-none">
          <div className="flex items-center justify-between border-b border-separator px-4 py-3">
            <span className="text-caption uppercase text-label-secondary">
              Maps
            </span>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              aria-label="New map"
              className="hit-44 flex size-7 cursor-pointer items-center justify-center rounded-full text-label-secondary transition-colors hover:bg-surface-hover hover:text-blue"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {active.map((map) => (
              <ExplorerRow
                key={map.id}
                map={map}
                href={selectHref(map.id)}
                active={map.id === activeMapId}
                onEdit={() => setEditMap(map)}
                onArchive={() => handleArchive(map)}
              />
            ))}
            {active.length === 0 ? (
              <p className="px-3 py-6 text-center text-callout text-label-secondary">
                No active maps.
              </p>
            ) : null}

            {archived.length > 0 ? (
              <div className="pt-2">
                <p className="px-3 py-1 text-caption uppercase text-label-tertiary">
                  Archived
                </p>
                {archived.map((map) => (
                  <ArchivedRow
                    key={map.id}
                    map={map}
                    href={selectHref(map.id)}
                    active={map.id === activeMapId}
                    onRestore={() => handleRestore(map)}
                    onDelete={() => setDeleteTarget(map)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        {/* Editor */}
        <section className="flex h-[600px] flex-col overflow-hidden rounded-2xl border border-separator-opaque bg-surface shadow-e1 lg:h-[calc(100vh-13rem)]">
          {graph ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-separator px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Network className="size-4 shrink-0 text-blue" aria-hidden />
                  <h2 className="truncate text-title-3 text-label">{graph.map.name}</h2>
                  {graph.map.isArchived ? (
                    <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-footnote text-label-secondary">
                      Archived
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditMap(graph.map)}>
                    <Pencil className="size-4" aria-hidden /> Rename
                  </Button>
                  {graph.map.isArchived ? (
                    <Button variant="ghost" size="sm" onClick={() => handleRestore(graph.map)}>
                      <ArchiveRestore className="size-4" aria-hidden /> Restore
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handleArchive(graph.map)}>
                      <Archive className="size-4" aria-hidden /> Archive
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-error hover:text-error"
                    onClick={() => setDeleteTarget(graph.map)}
                  >
                    <Trash2 className="size-4" aria-hidden /> Delete
                  </Button>
                </div>
              </header>
              <div className="grid-pattern relative flex-1">
                <FlowCanvas
                  key={graph.map.id}
                  taskMapId={graph.map.id}
                  initialNodes={graph.nodes}
                  initialEdges={graph.edges}
                  initialViewport={graph.map.viewport ?? null}
                  tasks={tasks}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="text-body text-label-secondary">
                That map could not be found. Pick a map from the list or create a new one.
              </p>
            </div>
          )}
        </section>
      </div>

      <CreateMapModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {editMap ? (
        <EditMapModal key={editMap.id} map={editMap} onClose={() => setEditMap(null)} />
      ) : null}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this map?"
        description="This permanently removes the map and all of its nodes and connections. This cannot be undone."
      >
        <div className="flex justify-end gap-3 px-6 py-4">
          <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() => deleteTarget && handleDelete(deleteTarget)}
          >
            Delete map
          </Button>
        </div>
      </Modal>
    </>
  );
}

function ExplorerRow({
  map,
  href,
  active,
  onEdit,
  onArchive,
}: {
  map: TaskMap;
  href: string;
  active: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md pr-1 transition-colors",
        active ? "bg-blue/12" : "hover:bg-surface-hover",
      )}
    >
      <Link href={href} scroll={false} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
        <Network
          className={cn("size-4 shrink-0", active ? "text-blue" : "text-label-secondary")}
          aria-hidden
        />
        <span
          className={cn(
            "truncate text-callout font-medium",
            active ? "font-semibold text-blue" : "text-label-secondary",
          )}
        >
          {map.name}
        </span>
      </Link>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Rename ${map.name}`}
        className="hidden size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-label-secondary hover:bg-surface-hover hover:text-blue group-hover:flex"
      >
        <Pencil className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onArchive}
        aria-label={`Archive ${map.name}`}
        className="hidden size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-label-secondary hover:bg-surface-hover hover:text-blue group-hover:flex"
      >
        <Archive className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function ArchivedRow({
  map,
  href,
  active,
  onRestore,
  onDelete,
}: {
  map: TaskMap;
  href: string;
  active: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md pr-1 transition-colors",
        active ? "bg-surface-secondary" : "hover:bg-surface-hover",
      )}
    >
      <Link href={href} scroll={false} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
        <Network className="size-4 shrink-0 text-label-tertiary" aria-hidden />
        <span className="truncate text-callout font-medium text-outline">{map.name}</span>
      </Link>
      <button
        type="button"
        onClick={onRestore}
        aria-label={`Restore ${map.name}`}
        className="hidden size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-label-secondary hover:bg-surface-hover hover:text-blue group-hover:flex"
      >
        <ArchiveRestore className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${map.name}`}
        className="hidden size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-label-secondary hover:bg-surface-hover hover:text-red group-hover:flex"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function CreateMapModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await createTaskMapAction(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Map created.");
      setName("");
      onClose();
      router.push(`/task-maps?map=${res.data.id}`);
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="New task map" description="Give your map a name to get started.">
      <form
        className="space-y-4 px-6 py-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="space-y-1">
          <span className="text-caption uppercase text-label-secondary">Name</span>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dashboard redesign"
          />
        </label>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={name.trim().length === 0} loading={pending}>
            Create map
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditMapModal({ map, onClose }: { map: TaskMap; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(map.name);
  const [description, setDescription] = useState(map.description ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await updateTaskMapAction(map.id, { name, description });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Map updated.");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title="Edit map" description="Rename this map or update its description.">
      <form
        className="space-y-4 px-6 py-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="space-y-1">
          <span className="text-caption uppercase text-label-secondary">Name</span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-caption uppercase text-label-secondary">Description</span>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this map about? (optional)"
            rows={3}
          />
        </label>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={name.trim().length === 0} loading={pending}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CanvasLoading() {
  return (
    <div className="grid-pattern flex size-full items-center justify-center">
      <p className="rounded-full border border-separator-opaque bg-surface px-4 py-2 text-callout font-medium text-label-secondary shadow-e1">
        Loading canvas…
      </p>
    </div>
  );
}
