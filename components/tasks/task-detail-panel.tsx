"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { DetailPanel, DetailRow } from "@/components/ui/detail-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Goal, LifeArea, Task } from "@/db";
import { instantToZonedDateTimeInput, MANILA_TZ } from "@/lib/date";
import { lifeAreaColorConfig, resolveColorKey } from "@/lib/life-areas";
import { listEntrance, rowExit, spring } from "@/lib/motion";
import {
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  taskPriorityConfig,
  taskStatusConfig,
} from "@/lib/tasks";
import type { TaskFormInput } from "@/lib/validations/task";
import { cn } from "@/lib/utils";

export type TaskDetailHandlers = {
  onSave: (id: string, values: TaskFormInput) => Promise<{ ok: boolean; error?: string }>;
  onToggleComplete: (task: Task) => void;
  onAddSubtask: (parentId: string, title: string) => Promise<{ ok: boolean; error?: string }>;
  onToggleSubtask: (subtask: Task) => void;
  onDeleteSubtask: (subtask: Task) => void;
  onDelete: (task: Task) => void;
};

/** The task's current values as the edit form expects them. */
function toFormValues(task: Task, timeZone: string): TaskFormInput {
  return {
    title: task.title,
    description: task.description ?? "",
    goalId: task.goalId ?? "",
    lifeAreaId: task.lifeAreaId ?? "",
    status: task.status,
    priority: task.priority,
    scheduledFor: task.scheduledFor ?? "",
    dueAt: instantToZonedDateTimeInput(task.dueAt, timeZone),
  };
}

/**
 * The task, opened.
 *
 * Everything about a task used to be reachable only by pressing Edit, which
 * threw a centred form over the list: fine for typing a new task, wrong for
 * looking one up. This is the read-and-tinker surface instead. Fields commit as
 * you change them (no Save button to forget), and the subtask checklist lives
 * here because steps belong to their task, not to the global to-do list.
 *
 * Deliberately no assignee: GoHa is a single-owner system, so a field that can
 * only ever say "me" is noise.
 */
export function TaskDetailPanel({
  task,
  subtasks,
  goals,
  lifeAreas,
  timeZone = MANILA_TZ,
  onClose,
  handlers,
}: {
  task: Task | null;
  subtasks: Task[];
  goals: Goal[];
  lifeAreas: LifeArea[];
  timeZone?: string;
  onClose: () => void;
  handlers: TaskDetailHandlers;
}) {
  return (
    <DetailPanel
      open={Boolean(task)}
      onClose={onClose}
      title={task ? `Details for ${task.title}` : "Task details"}
    >
      {task ? (
        <TaskDetailBody
          // Remount per task so every field re-initialises from the new task
          // without a reset effect.
          key={task.id}
          task={task}
          subtasks={subtasks}
          goals={goals}
          lifeAreas={lifeAreas}
          timeZone={timeZone}
          onClose={onClose}
          handlers={handlers}
        />
      ) : null}
    </DetailPanel>
  );
}

function TaskDetailBody({
  task,
  subtasks,
  goals,
  lifeAreas,
  timeZone,
  onClose,
  handlers,
}: {
  task: Task;
  subtasks: Task[];
  goals: Goal[];
  lifeAreas: LifeArea[];
  timeZone: string;
  onClose: () => void;
  handlers: TaskDetailHandlers;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [newSubtask, setNewSubtask] = useState("");
  const [addingSubtask, startAddSubtask] = useTransition();
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const isCompleted = task.status === "completed";
  const area = task.lifeAreaId ? lifeAreas.find((a) => a.id === task.lifeAreaId) ?? null : null;
  const areaColor = area ? lifeAreaColorConfig[resolveColorKey(area.color, area.id)] : null;

  const doneSubtasks = subtasks.filter((s) => s.status === "completed").length;
  const subtaskPercent = subtasks.length === 0 ? 0 : Math.round((doneSubtasks / subtasks.length) * 100);

  // No effect syncs `title`/`description` back from the task on purpose. This
  // body is keyed by task id, so opening a different task remounts it with
  // fresh values, and while one task is open the only thing editing those two
  // fields is the user typing in them. Re-syncing would fight their cursor, and
  // on a failed save it would silently discard what they had just written.

  /** Commit one field, leaving the rest of the task exactly as it is. */
  async function patch(changes: Partial<TaskFormInput>) {
    const values = { ...toFormValues(task, timeZone), ...changes };
    const result = await handlers.onSave(task.id, values);
    if (!result.ok) toast.error(result.error ?? "Could not save that change.");
  }

  function addSubtask() {
    const value = newSubtask.trim();
    if (!value || addingSubtask) return;
    startAddSubtask(async () => {
      const result = await handlers.onAddSubtask(task.id, value);
      if (result.ok) {
        setNewSubtask("");
        subtaskInputRef.current?.focus();
      } else {
        toast.error(result.error ?? "Could not add that step.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Complete + title, the two things you came for. */}
      <div className="flex items-start gap-3">
        <div className="pt-1">
          <Checkbox
            checked={isCompleted}
            onToggle={() => handlers.onToggleComplete(task)}
            color={areaColor?.fill}
            aria-label={isCompleted ? `Reopen ${task.title}` : `Complete ${task.title}`}
          />
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const trimmed = title.trim();
            if (!trimmed) {
              setTitle(task.title);
              return;
            }
            if (trimmed !== task.title) void patch({ title: trimmed });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setTitle(task.title);
          }}
          aria-label="Task title"
          className={cn(
            "min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-0.5 text-title-3 text-label transition-colors hover:bg-fill-quaternary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
            isCompleted && "text-label-tertiary line-through",
          )}
        />
      </div>

      {/* The fields. Each commits on change; there is nothing to submit. */}
      <div className="flex flex-col gap-1">
        <DetailRow label="Status">
          <Select
            aria-label="Status"
            value={task.status}
            onChange={(v) => void patch({ status: v as TaskFormInput["status"] })}
            options={TASK_STATUS_VALUES.map((s) => ({ value: s, label: taskStatusConfig[s].label }))}
          />
        </DetailRow>

        <DetailRow label="Priority">
          <Select
            aria-label="Priority"
            value={task.priority}
            onChange={(v) => void patch({ priority: v as TaskFormInput["priority"] })}
            options={TASK_PRIORITY_VALUES.map((p) => ({
              value: p,
              label: taskPriorityConfig[p].label,
            }))}
          />
        </DetailRow>

        <DetailRow label="Scheduled">
          <Input
            type="date"
            aria-label="Scheduled for"
            defaultValue={task.scheduledFor ?? ""}
            onChange={(e) => void patch({ scheduledFor: e.target.value })}
          />
        </DetailRow>

        <DetailRow label="Due date">
          <Input
            type="datetime-local"
            aria-label="Due date"
            defaultValue={instantToZonedDateTimeInput(task.dueAt, timeZone)}
            onChange={(e) => void patch({ dueAt: e.target.value })}
          />
        </DetailRow>

        <DetailRow label="Life area">
          <Select
            aria-label="Life area"
            value={task.lifeAreaId ?? ""}
            onChange={(v) => void patch({ lifeAreaId: v })}
            options={[
              { value: "", label: "No life area" },
              ...lifeAreas.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </DetailRow>

        <DetailRow label="Goal">
          <Select
            aria-label="Goal"
            value={task.goalId ?? ""}
            onChange={(v) => void patch({ goalId: v })}
            options={[
              { value: "", label: "No goal" },
              ...goals.map((g) => ({ value: g.id, label: g.title })),
            ]}
          />
        </DetailRow>
      </div>

      {/* Description */}
      <section>
        <h3 className="mb-2 text-subhead text-label-secondary">Description</h3>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description.trim() !== (task.description ?? "")) {
              void patch({ description: description.trim() });
            }
          }}
          maxLength={TASK_DESCRIPTION_MAX}
          placeholder="What is this task about?"
          aria-label="Description"
          className="min-h-24"
        />
      </section>

      {/* Subtasks */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-subhead text-label-secondary">
            Subtasks
            {subtasks.length > 0 ? (
              <span className="rounded-full bg-fill-tertiary px-1.5 py-0.5 font-mono text-footnote tabular-nums text-label">
                {doneSubtasks}/{subtasks.length}
              </span>
            ) : null}
          </h3>
          {subtasks.length > 0 ? (
            <span className="font-mono text-footnote tabular-nums text-label-secondary">
              {subtaskPercent}%
            </span>
          ) : null}
        </div>

        {subtasks.length > 0 ? (
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-fill-tertiary">
            <motion.div
              className={cn("h-full rounded-full", areaColor ? areaColor.dot : "bg-blue")}
              initial={false}
              animate={{ width: `${subtaskPercent}%` }}
              transition={spring.smooth}
            />
          </div>
        ) : null}

        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {subtasks.map((subtask, index) => (
              <motion.li
                key={subtask.id}
                layout
                variants={listEntrance}
                initial="hidden"
                animate="visible"
                custom={index}
                exit={rowExit}
                className="group/sub relative flex min-h-9 items-center gap-3 overflow-hidden rounded-lg px-1.5 transition-colors hover:bg-surface-hover"
              >
                <Checkbox
                  checked={subtask.status === "completed"}
                  onToggle={() => handlers.onToggleSubtask(subtask)}
                  color={areaColor?.fill}
                  aria-label={
                    subtask.status === "completed"
                      ? `Reopen ${subtask.title}`
                      : `Complete ${subtask.title}`
                  }
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-body",
                    subtask.status === "completed"
                      ? "text-label-tertiary line-through"
                      : "text-label",
                  )}
                >
                  {subtask.title}
                </span>
                <button
                  type="button"
                  onClick={() => handlers.onDeleteSubtask(subtask)}
                  aria-label={`Delete ${subtask.title}`}
                  className="hit-44 hit-44-narrow flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-label-tertiary opacity-0 transition-opacity hover:text-red focus-visible:opacity-100 group-hover/sub:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <div className="mt-2 flex items-center gap-2">
          <Plus className="size-4 shrink-0 text-label-tertiary" aria-hidden />
          <Input
            ref={subtaskInputRef}
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSubtask();
              }
            }}
            placeholder="Add a step..."
            aria-label="Add a subtask"
            disabled={addingSubtask}
          />
          <Button
            size="sm"
            onClick={addSubtask}
            disabled={newSubtask.trim().length === 0}
            loading={addingSubtask}
          >
            Add
          </Button>
        </div>
      </section>

      {/* Reflection, once there is something to reflect on. */}
      {isCompleted ? (
        <section className="rounded-xl bg-fill-quaternary p-3">
          <p className="flex items-center gap-2 text-subhead text-green">
            <CheckCircle2 className="size-4" aria-hidden />
            Completed
          </p>
          {task.completionNote ? (
            <p className="mt-1.5 text-callout text-label-secondary">{task.completionNote}</p>
          ) : (
            <p className="mt-1.5 flex items-center gap-1.5 text-callout text-label-tertiary">
              <Circle className="size-3" aria-hidden />
              No reflection saved for this one.
            </p>
          )}
        </section>
      ) : null}

      <div className="flex justify-end border-t border-separator pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-red hover:bg-red/12 hover:text-red"
          onClick={() => {
            onClose();
            handlers.onDelete(task);
          }}
        >
          <Trash2 className="size-4" aria-hidden />
          Delete task
        </Button>
      </div>
    </div>
  );
}
