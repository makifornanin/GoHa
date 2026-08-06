"use client";

import {
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CircleCheckBig,
  Inbox,
  ListTodo,
  Plus,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cancelTaskAction,
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
  reopenTaskAction,
  saveCompletionNoteAction,
  updateTaskAction,
} from "@/app/(app)/tasks/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import type { Goal, LifeArea, Task } from "@/db";
import type { TaskStatus } from "@/db/schema/enums";
import { MANILA_TZ, zonedToday, type Weekday } from "@/lib/date";
import { listContainer, listItem } from "@/lib/motion";
import { taskEffectiveDate, taskMatchesView, type TaskViewKey } from "@/lib/task-buckets";
import { taskPriorityConfig } from "@/lib/tasks";
import type { TaskFormInput } from "@/lib/validations/task";
import { cn } from "@/lib/utils";

import { CompletionNoteModal } from "./completion-note-modal";
import { TaskCard } from "./task-card";
import { TaskFormModal } from "./task-form-modal";

const VIEWS: { key: TaskViewKey; label: string; icon: LucideIcon }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "today", label: "Today", icon: Sun },
  { key: "this_week", label: "This Week", icon: CalendarRange },
  { key: "this_month", label: "This Month", icon: CalendarDays },
  { key: "this_quarter", label: "Quarterly", icon: CalendarClock },
  { key: "this_year", label: "Yearly", icon: Calendar },
  { key: "done", label: "Done", icon: CircleCheckBig },
  { key: "all", label: "All", icon: ListTodo },
];

type SortKey = "date" | "priority" | "created" | "alpha";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "priority", label: "Priority" },
  { key: "created", label: "Newest" },
  { key: "alpha", label: "A–Z" },
];

type OptimisticAction = { type: "status"; id: string; status: TaskStatus } | { type: "remove"; id: string };

function sortTasks(list: Task[], sort: SortKey): Task[] {
  const byDate = (a: Task, b: Task) => {
    const da = taskEffectiveDate(a);
    const db = taskEffectiveDate(b);
    if (da && db) return da < db ? -1 : da > db ? 1 : 0;
    if (da) return -1;
    if (db) return 1;
    return 0;
  };
  const byPriority = (a: Task, b: Task) =>
    taskPriorityConfig[b.priority].weight - taskPriorityConfig[a.priority].weight;

  const copy = [...list];
  switch (sort) {
    case "date":
      return copy.sort((a, b) => byDate(a, b) || byPriority(a, b));
    case "priority":
      return copy.sort((a, b) => byPriority(a, b) || byDate(a, b));
    case "created":
      return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case "alpha":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
  }
}

export function TasksView({
  tasks,
  goals,
  lifeAreas,
  timeZone = MANILA_TZ,
  weekStartsOn = 1,
  openCreateOnMount = false,
}: {
  tasks: Task[];
  goals: Goal[];
  lifeAreas: LifeArea[];
  timeZone?: string;
  weekStartsOn?: Weekday;
  /** Opens the create form immediately (from `/tasks?new=1`, e.g. the header
   *  "Add Task" button and the mobile "+" action). */
  openCreateOnMount?: boolean;
}) {
  const [view, setView] = useState<TaskViewKey>("today");
  const [sort, setSort] = useState<SortKey>("date");
  const [lifeAreaFilter, setLifeAreaFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(openCreateOnMount);
  const [editing, setEditing] = useState<Task | null>(null);
  const [noteTask, setNoteTask] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [, startTransition] = useTransition();

  const now = useMemo(() => new Date(), []);

  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (state, action: OptimisticAction) => {
      if (action.type === "remove") return state.filter((t) => t.id !== action.id);
      return state.map((t) =>
        t.id === action.id
          ? { ...t, status: action.status, completedAt: action.status === "completed" ? new Date() : null }
          : t,
      );
    },
  );

  const goalTitleById = useMemo(() => new Map(goals.map((g) => [g.id, g.title])), [goals]);
  const lifeAreaById = useMemo(() => new Map(lifeAreas.map((a) => [a.id, a])), [lifeAreas]);
  const goalOptions = useMemo(() => goals.map((g) => ({ id: g.id, title: g.title })), [goals]);
  const lifeAreaOptions = useMemo(() => lifeAreas.map((a) => ({ id: a.id, name: a.name })), [lifeAreas]);

  const counts = useMemo(() => {
    const map = new Map<TaskViewKey, number>();
    for (const v of VIEWS) {
      map.set(
        v.key,
        optimisticTasks.filter((t) => taskMatchesView(t, v.key, now, weekStartsOn, timeZone)).length,
      );
    }
    return map;
  }, [optimisticTasks, now, weekStartsOn, timeZone]);

  const visibleTasks = useMemo(() => {
    let list = optimisticTasks.filter((t) => taskMatchesView(t, view, now, weekStartsOn, timeZone));
    if (lifeAreaFilter !== "all") list = list.filter((t) => t.lifeAreaId === lifeAreaFilter);
    return sortTasks(list, sort);
  }, [optimisticTasks, view, now, lifeAreaFilter, sort, weekStartsOn, timeZone]);

  const activeView = VIEWS.find((v) => v.key === view)!;

  /**
   * When the current view is empty, the nearest view that DOES hold tasks.
   * Inbox first (undated tasks are the ones users most often think vanished),
   * then All. Prevents the "my task disappeared" dead end. Two map lookups,
   * so it is computed inline rather than memoized.
   */
  const elsewhere = (() => {
    if (visibleTasks.length > 0) return null;
    for (const key of ["inbox", "all"] as const) {
      if (key === view) continue;
      const count = counts.get(key) ?? 0;
      if (count > 0) {
        return { key, count, label: VIEWS.find((v) => v.key === key)!.label };
      }
    }
    return null;
  })();

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  async function handleCreate(values: TaskFormInput) {
    const result = await createTaskAction(values);
    if (result.ok) {
      const task = result.data;
      // A task must never save into a view the user isn't looking at and then
      // seem to vanish. If the new task doesn't belong to the current view,
      // switch to one where it IS visible and say where it went.
      if (!taskMatchesView(task, view, now, weekStartsOn, timeZone)) {
        const target: TaskViewKey =
          taskEffectiveDate(task, timeZone) === null ? "inbox" : "all";
        setView(target);
        setLifeAreaFilter("all");
        toast.success(
          `Added "${task.title}" to ${VIEWS.find((v) => v.key === target)!.label}`,
        );
      } else {
        toast.success(`Added "${task.title}"`);
      }
      setFormOpen(false);
    }
    return result;
  }

  async function handleUpdate(values: TaskFormInput) {
    if (!editing) return { ok: false as const, error: "Nothing to update." };
    const result = await updateTaskAction(editing.id, values);
    if (result.ok) {
      toast.success(`Updated "${result.data.title}"`);
      setFormOpen(false);
    }
    return result;
  }

  function handleToggleComplete(task: Task) {
    startTransition(async () => {
      if (task.status === "completed") {
        applyOptimistic({ type: "status", id: task.id, status: "todo" });
        const result = await reopenTaskAction(task.id);
        if (!result.ok) toast.error(result.error);
      } else {
        applyOptimistic({ type: "status", id: task.id, status: "completed" });
        const result = await completeTaskAction(task.id);
        if (result.ok) {
          toast.success(`Completed "${task.title}"`, {
            action: {
              label: "Add reflection",
              onClick: () => setNoteTask({ ...task, status: "completed", completionNote: null }),
            },
          });
        } else {
          toast.error(result.error);
        }
      }
    });
  }

  function handleCancel(task: Task) {
    startTransition(async () => {
      applyOptimistic({ type: "status", id: task.id, status: "cancelled" });
      const result = await cancelTaskAction(task.id);
      if (result.ok) toast.success(`Cancelled "${task.title}"`);
      else toast.error(result.error);
    });
  }

  function confirmDelete() {
    const task = deleting;
    if (!task) return;
    setDeleting(null);
    startTransition(async () => {
      applyOptimistic({ type: "remove", id: task.id });
      const result = await deleteTaskAction(task.id);
      if (result.ok) toast.success(`Deleted "${task.title}"`);
      else toast.error(result.error);
    });
  }

  async function handleSaveNote(note: string) {
    const task = noteTask;
    if (!task) return { ok: false as const, error: "Nothing to save." };
    const result = await saveCompletionNoteAction(task.id, note);
    if (result.ok) {
      toast.success("Reflection saved");
      setNoteTask(null);
    }
    return result;
  }

  const addButton = (
    <Button data-testid="new-task" onClick={openCreate}>
      <Plus />
      Add Task
    </Button>
  );

  if (optimisticTasks.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="To-dos" description="Plan, schedule, and complete the work that moves your goals." />
        <EmptyState
          icon={ListTodo}
          title="No tasks yet"
          description="Tasks are the actions that move your goals forward. Add your first one and schedule when you'll do it."
          action={
            <Button data-testid="new-task" onClick={openCreate}>
              <Plus />
              Create your first task
            </Button>
          }
        />
        <TaskFormModal
          open={formOpen}
          mode="create"
          goals={goalOptions}
          lifeAreas={lifeAreaOptions}
          timeZone={timeZone}
          onSubmit={handleCreate}
          onClose={() => setFormOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="To-dos"
        description="Plan, schedule, and complete the work that moves your goals."
        action={addButton}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <aside className="lg:col-span-3">
          <nav
            aria-label="Task views"
            className="flex gap-2 overflow-x-auto pb-2 lg:sticky lg:top-6 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
          >
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = view === v.key;
              const count = counts.get(v.key) ?? 0;
              return (
                <button
                  key={v.key}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setView(v.key)}
                  className={cn(
                    "flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-callout font-medium transition-colors",
                    active
                      ? "bg-blue/12 text-blue"
                      : "text-label-secondary hover:bg-surface-hover hover:text-label",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span>{v.label}</span>
                  {count > 0 ? (
                    <span
                      className={cn(
                        "ml-auto rounded-full px-1.5 py-0.5 font-mono text-footnote tabular-nums",
                        active ? "bg-blue text-white" : "bg-surface-secondary text-label-secondary",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="lg:col-span-9">
          <div className="mb-6 flex flex-col gap-3 border-b border-separator pb-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-title-3 text-label">{activeView.label}</h2>
            <div className="flex items-center gap-2">
              <Select
                aria-label="Filter by life area"
                value={lifeAreaFilter}
                onChange={setLifeAreaFilter}
                className="w-44"
                options={[
                  { value: "all", label: "All life areas" },
                  ...lifeAreas.map((area) => ({ value: area.id, label: area.name })),
                ]}
              />
              <Select
                aria-label="Sort tasks"
                value={sort}
                onChange={(v) => setSort(v as SortKey)}
                className="w-36"
                options={SORTS.map((s) => ({ value: s.key, label: `Sort: ${s.label}` }))}
              />
            </div>
          </div>

          {visibleTasks.length === 0 ? (
            <div className="rounded-2xl bg-surface-secondary px-6 py-12 text-center">
              <p className="text-callout text-label-secondary">
                Nothing here yet.{" "}
                <button
                  type="button"
                  onClick={openCreate}
                  className="cursor-pointer font-medium text-blue hover:underline"
                >
                  Add a task
                </button>
                .
              </p>
              {/* Never leave the user thinking their tasks vanished: if other
                  views hold tasks, point straight at them. */}
              {elsewhere ? (
                <p className="mt-2 text-callout text-label-secondary">
                  You have{" "}
                  <button
                    type="button"
                    onClick={() => setView(elsewhere.key)}
                    className="cursor-pointer font-medium text-blue hover:underline"
                  >
                    {elsewhere.count} task{elsewhere.count === 1 ? "" : "s"} in {elsewhere.label}
                  </button>
                  .
                </p>
              ) : null}
            </div>
          ) : (
            <motion.ul
              key={`${view}-${sort}-${lifeAreaFilter}`}
              variants={listContainer}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-2"
            >
              {visibleTasks.map((task) => (
                <motion.li key={task.id} variants={listItem} layout>
                  <TaskCard
                    task={task}
                    goalTitle={task.goalId ? goalTitleById.get(task.goalId) ?? null : null}
                    lifeArea={task.lifeAreaId ? lifeAreaById.get(task.lifeAreaId) ?? null : null}
                    timeZone={timeZone}
                    onToggleComplete={handleToggleComplete}
                    onEdit={(t) => {
                      setEditing(t);
                      setFormOpen(true);
                    }}
                    onCancel={handleCancel}
                    onDelete={setDeleting}
                    onEditNote={setNoteTask}
                  />
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>
      </div>

      <TaskFormModal
        open={formOpen}
        mode={editing ? "edit" : "create"}
        task={editing}
        goals={goalOptions}
        lifeAreas={lifeAreaOptions}
        defaultScheduledFor={!editing && view === "today" ? zonedToday(now, timeZone) : undefined}
        timeZone={timeZone}
        onSubmit={editing ? handleUpdate : handleCreate}
        onClose={() => setFormOpen(false)}
      />

      <CompletionNoteModal task={noteTask} onSave={handleSaveNote} onClose={() => setNoteTask(null)} />

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this task?"
        description={
          deleting ? `"${deleting.title}" will be permanently removed. This cannot be undone.` : undefined
        }
      >
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
