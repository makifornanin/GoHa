"use client";

import { ListTodo, Plus } from "lucide-react";
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
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import type { Goal, LifeArea, Task } from "@/db";
import type { TaskStatus } from "@/db/schema/enums";
import { MANILA_TZ, zonedToday, type Weekday } from "@/lib/date";
import { listContainer, listItem } from "@/lib/motion";
import {
  isTaskLate,
  taskEffectiveDate,
  taskMatchesProgress,
  taskMatchesTimeframe,
  type TaskProgressKey,
  type TaskTimeframeKey,
} from "@/lib/task-buckets";
import { taskPriorityConfig } from "@/lib/tasks";
import { useNow } from "@/lib/use-now";
import type { TaskFormInput } from "@/lib/validations/task";

import { CompletionNoteModal } from "./completion-note-modal";
import { TaskCalendar } from "./task-calendar";
import { TaskCard } from "./task-card";
import { TaskFormModal } from "./task-form-modal";

/** WHEN. One dropdown instead of a column of mutually exclusive buttons. */
const TIMEFRAMES: { key: TaskTimeframeKey; label: string }[] = [
  { key: "all", label: "Any time" },
  { key: "today", label: "Today" },
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "this_year", label: "This year" },
  { key: "inbox", label: "No date (Inbox)" },
];

/** WHAT STATE. Separate axis, so "this week's in-progress work" is expressible. */
const PROGRESS: { key: TaskProgressKey; label: string }[] = [
  { key: "all", label: "All open + done" },
  { key: "todo", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "late", label: "Late" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
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
  openCreateOnMount?: boolean;
}) {
  const [layout, setLayout] = useState<"list" | "calendar">("list");
  const [timeframe, setTimeframe] = useState<TaskTimeframeKey>("all");
  const [progress, setProgress] = useState<TaskProgressKey>("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [lifeAreaFilter, setLifeAreaFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(openCreateOnMount);
  const [editing, setEditing] = useState<Task | null>(null);
  const [createDate, setCreateDate] = useState<string | undefined>(undefined);
  const [noteTask, setNoteTask] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [, startTransition] = useTransition();

  // Live, not frozen at mount: lateness and the date buckets below are derived
  // from this (see lib/use-now.ts).
  const now = useNow();

  const [optimisticTasks, applyOptimistic] = useOptimistic(tasks, (state, action: OptimisticAction) => {
    if (action.type === "remove") return state.filter((t) => t.id !== action.id);
    return state.map((t) =>
      t.id === action.id
        ? { ...t, status: action.status, completedAt: action.status === "completed" ? new Date() : null }
        : t,
    );
  });

  const goalTitleById = useMemo(() => new Map(goals.map((g) => [g.id, g.title])), [goals]);
  const lifeAreaById = useMemo(() => new Map(lifeAreas.map((a) => [a.id, a])), [lifeAreas]);
  const goalOptions = useMemo(() => goals.map((g) => ({ id: g.id, title: g.title })), [goals]);
  const lifeAreaOptions = useMemo(() => lifeAreas.map((a) => ({ id: a.id, name: a.name })), [lifeAreas]);

  /** Life-area scoping applies to both layouts. */
  const scoped = useMemo(
    () =>
      lifeAreaFilter === "all"
        ? optimisticTasks
        : optimisticTasks.filter((t) => t.lifeAreaId === lifeAreaFilter),
    [optimisticTasks, lifeAreaFilter],
  );

  /** Live counts so each dropdown option states how much work it holds. */
  const timeframeCounts = useMemo(() => {
    const map = new Map<TaskTimeframeKey, number>();
    for (const t of TIMEFRAMES) {
      map.set(
        t.key,
        scoped.filter(
          (task) =>
            taskMatchesTimeframe(task, t.key, now, weekStartsOn, timeZone) &&
            taskMatchesProgress(task, progress, now, timeZone),
        ).length,
      );
    }
    return map;
  }, [scoped, now, weekStartsOn, timeZone, progress]);

  const progressCounts = useMemo(() => {
    const map = new Map<TaskProgressKey, number>();
    for (const p of PROGRESS) {
      map.set(
        p.key,
        scoped.filter(
          (task) =>
            taskMatchesTimeframe(task, timeframe, now, weekStartsOn, timeZone) &&
            taskMatchesProgress(task, p.key, now, timeZone),
        ).length,
      );
    }
    return map;
  }, [scoped, now, weekStartsOn, timeZone, timeframe]);

  const visibleTasks = useMemo(
    () =>
      sortTasks(
        scoped.filter(
          (t) =>
            taskMatchesTimeframe(t, timeframe, now, weekStartsOn, timeZone) &&
            taskMatchesProgress(t, progress, now, timeZone),
        ),
        sort,
      ),
    [scoped, timeframe, progress, sort, now, weekStartsOn, timeZone],
  );

  /** Calendar spans a month of its own, so only the state filter applies. */
  const calendarTasks = useMemo(
    () => scoped.filter((t) => taskMatchesProgress(t, progress, now, timeZone)),
    [scoped, progress, now, timeZone],
  );

  const lateCount = useMemo(
    () => scoped.filter((t) => isTaskLate(t, now, timeZone)).length,
    [scoped, now, timeZone],
  );

  function openCreate(date?: string) {
    setEditing(null);
    setCreateDate(date);
    setFormOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setCreateDate(undefined);
    setFormOpen(true);
  }

  async function handleCreate(values: TaskFormInput) {
    const result = await createTaskAction(values);
    if (result.ok) {
      const task = result.data;
      // A task must never save into a filter the user isn't looking at and then
      // seem to vanish. Widen the filters until it is on screen.
      const visible =
        taskMatchesTimeframe(task, timeframe, now, weekStartsOn, timeZone) &&
        taskMatchesProgress(task, progress, now, timeZone);
      if (!visible) {
        setTimeframe("all");
        setProgress("all");
        setLifeAreaFilter("all");
        toast.success(`Added "${task.title}" — showing all tasks so you can see it`);
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

  const modals = (
    <>
      <TaskFormModal
        open={formOpen}
        mode={editing ? "edit" : "create"}
        task={editing}
        goals={goalOptions}
        lifeAreas={lifeAreaOptions}
        defaultScheduledFor={
          editing ? undefined : (createDate ?? (timeframe === "today" ? zonedToday(now, timeZone) : undefined))
        }
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
    </>
  );

  if (optimisticTasks.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="To-dos" description="Plan, schedule, and complete the work that moves your goals." />
        <EmptyState
          icon={ListTodo}
          title="No tasks yet"
          description="Tasks are the actions that move your goals forward. Add your first one and schedule when you'll do it."
          action={
            <Button data-testid="new-task" onClick={() => openCreate()}>
              <Plus />
              Create your first task
            </Button>
          }
        />
        {modals}
      </div>
    );
  }

  const label = (base: string, count: number) => (count > 0 ? `${base} · ${count}` : base);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="To-dos"
        description="Plan, schedule, and complete the work that moves your goals."
        action={
          <Button data-testid="new-task" onClick={() => openCreate()}>
            <Plus />
            Add Task
          </Button>
        }
      />

      {/* One toolbar: how to look at the work, then how to narrow it. */}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={layout}
          onChange={(v) => setLayout(v as "list" | "calendar")}
          ariaLabel="View as"
          options={[
            { value: "list", label: "List" },
            { value: "calendar", label: "Calendar" },
          ]}
        />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {layout === "list" ? (
            <Select
              aria-label="Filter by timeframe"
              value={timeframe}
              onChange={(v) => setTimeframe(v as TaskTimeframeKey)}
              className="w-44"
              options={TIMEFRAMES.map((t) => ({
                value: t.key,
                label: label(t.label, timeframeCounts.get(t.key) ?? 0),
              }))}
            />
          ) : null}
          <Select
            aria-label="Filter by progress"
            value={progress}
            onChange={(v) => setProgress(v as TaskProgressKey)}
            className="w-44"
            options={PROGRESS.map((p) => ({
              value: p.key,
              label: label(p.label, progressCounts.get(p.key) ?? 0),
            }))}
          />
          <Select
            aria-label="Filter by life area"
            value={lifeAreaFilter}
            onChange={setLifeAreaFilter}
            className="w-40"
            options={[
              { value: "all", label: "All life areas" },
              ...lifeAreas.map((area) => ({ value: area.id, label: area.name })),
            ]}
          />
          {layout === "list" ? (
            <Select
              aria-label="Sort tasks"
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              className="w-36"
              options={SORTS.map((s) => ({ value: s.key, label: `Sort: ${s.label}` }))}
            />
          ) : null}
        </div>
      </div>

      {/* Overdue work is the one thing worth interrupting for. */}
      {lateCount > 0 && progress !== "late" ? (
        <button
          type="button"
          onClick={() => {
            setProgress("late");
            setTimeframe("all");
          }}
          className="flex cursor-pointer items-center gap-2 self-start rounded-full bg-red/12 px-3 py-1.5 text-callout font-medium text-red transition-colors hover:bg-red/20"
        >
          <span className="font-mono tabular-nums">{lateCount}</span>
          {lateCount === 1 ? "task is late" : "tasks are late"} — review
        </button>
      ) : null}

      {layout === "calendar" ? (
        <TaskCalendar
          tasks={calendarTasks}
          today={zonedToday(now, timeZone)}
          weekStartsOn={weekStartsOn}
          timeZone={timeZone}
          onOpenTask={openEdit}
          onCreateOn={(date) => openCreate(date)}
        />
      ) : visibleTasks.length === 0 ? (
        /* On the canvas, so it carries its own border (see goals-view). */
        <div className="rounded-2xl border border-separator-opaque bg-surface px-6 py-12 text-center">
          <p className="text-callout text-label-secondary">
            Nothing matches these filters.{" "}
            <button
              type="button"
              onClick={() => openCreate()}
              className="cursor-pointer font-medium text-blue hover:underline"
            >
              Add a task
            </button>
            .
          </p>
          <button
            type="button"
            onClick={() => {
              setTimeframe("all");
              setProgress("all");
              setLifeAreaFilter("all");
            }}
            className="mt-2 cursor-pointer text-callout font-medium text-blue hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <motion.ul
          key={`${timeframe}-${progress}-${sort}-${lifeAreaFilter}`}
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
                onEdit={openEdit}
                onCancel={handleCancel}
                onDelete={setDeleting}
                onEditNote={setNoteTask}
              />
            </motion.li>
          ))}
        </motion.ul>
      )}

      {modals}
    </div>
  );
}
