"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CheckCircle2, Circle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { DetailPanel, DetailRow } from "@/components/ui/detail-panel";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Goal, LifeArea, Task } from "@/db";
import { instantToZonedDateTimeInput, MANILA_TZ, zonedToday, type Weekday } from "@/lib/date";
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
  weekStartsOn = 1,
  onClose,
  handlers,
}: {
  task: Task | null;
  subtasks: Task[];
  goals: Goal[];
  lifeAreas: LifeArea[];
  timeZone?: string;
  weekStartsOn?: Weekday;
  onClose: () => void;
  handlers: TaskDetailHandlers;
}) {
  return (
    <DetailPanel
      open={Boolean(task)}
      onClose={onClose}
      title={task ? `Details for ${task.title}` : "Task details"}
      /*
        The task's own name, in the header row with the close button.
        
        It used to be the first thing in the scrolling body, so it slid out of
        sight the moment you looked at the subtasks and you lost track of which
        task you were editing. In the header it stays put, and it is still the
        editable field it always was.
      */
      eyebrow={
        task ? (
          <TaskTitleField
            key={task.id}
            task={task}
            timeZone={timeZone}
            onSave={handlers.onSave}
          />
        ) : null
      }
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
          weekStartsOn={weekStartsOn}
          onClose={onClose}
          handlers={handlers}
        />
      ) : null}
    </DetailPanel>
  );
}

/** One step's title, edited in place. Same rules as the task's own name. */
function SubtaskTitle({
  subtask,
  timeZone,
  onSave,
}: {
  subtask: Task;
  timeZone: string;
  onSave: TaskDetailHandlers["onSave"];
}) {
  const [value, setValue] = useState(subtask.title);
  const done = subtask.status === "completed";
  /*
   * Escape reverts and then blurs, and blur is what commits. The state reset
   * has not flushed by then, so without this flag the discarded text would be
   * saved by the very keypress meant to throw it away.
   */
  const discarding = useRef(false);

  async function commit() {
    if (discarding.current) {
      discarding.current = false;
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      setValue(subtask.title);
      return;
    }
    if (trimmed === subtask.title) return;
    const result = await onSave(subtask.id, {
      ...toFormValues(subtask, timeZone),
      title: trimmed,
    });
    if (!result.ok) {
      setValue(subtask.title);
      toast.error(result.error ?? "Could not rename that step.");
    }
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          // Same rule as the task title: only claim the key when there is an
          // edit to discard, so Escape can still close the panel otherwise.
          if (value === subtask.title) return;
          e.preventDefault();
          discarding.current = true;
          setValue(subtask.title);
          e.currentTarget.blur();
        }
      }}
      aria-label={`Rename ${subtask.title}`}
      className={cn(
        "min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-body transition-colors hover:bg-fill-quaternary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue/40",
        done ? "text-label-tertiary line-through" : "text-label",
      )}
    />
  );
}

/** The task name, edited in place. Commits on blur; Escape reverts. */
function TaskTitleField({
  task,
  timeZone,
  onSave,
}: {
  task: Task;
  timeZone: string;
  onSave: TaskDetailHandlers["onSave"];
}) {
  const [title, setTitle] = useState(task.title);
  const isCompleted = task.status === "completed";
  /** See SubtaskTitle: Escape reverts, blur commits, and blur wins the race. */
  const discarding = useRef(false);

  async function commit() {
    if (discarding.current) {
      discarding.current = false;
      return;
    }
    const trimmed = title.trim();
    // An empty title would leave a nameless row in the list, so a cleared field
    // reverts rather than saving nothing.
    if (!trimmed) {
      setTitle(task.title);
      return;
    }
    if (trimmed === task.title) return;
    const result = await onSave(task.id, { ...toFormValues(task, timeZone), title: trimmed });
    if (!result.ok) {
      setTitle(task.title);
      toast.error(result.error ?? "Could not rename that task.");
    }
  }

  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          /*
           * Claim the key ONLY when there is an edit to throw away.
           *
           * The panel skips an Escape that has already been handled, so
           * claiming it unconditionally would trap the user: with the cursor in
           * the title, which is where the panel puts it on open, Escape would
           * revert nothing and the panel would never close.
           */
          if (title === task.title) return;
          e.preventDefault();
          discarding.current = true;
          setTitle(task.title);
          e.currentTarget.blur();
        }
      }}
      aria-label="Task title"
      className={cn(
        "w-full min-w-0 rounded-lg bg-transparent px-1.5 py-0.5 text-title-3 text-label transition-colors hover:bg-fill-quaternary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
        isCompleted && "text-label-tertiary line-through",
      )}
    />
  );
}

function TaskDetailBody({
  task,
  subtasks,
  goals,
  lifeAreas,
  timeZone,
  weekStartsOn,
  onClose,
  handlers,
}: {
  task: Task;
  subtasks: Task[];
  goals: Goal[];
  lifeAreas: LifeArea[];
  timeZone: string;
  weekStartsOn: Weekday;
  onClose: () => void;
  handlers: TaskDetailHandlers;
}) {
  const [description, setDescription] = useState(task.description ?? "");
  const [newSubtask, setNewSubtask] = useState("");
  /*
   * The composer is revealed, not permanently parked at the bottom of the list.
   *
   * An always-open input with its own Add button reads as an unfinished row and
   * competes with the real steps above it. Behind "+ Add subtask" the checklist
   * is just the checklist until you want to extend it.
   */
  const [composing, setComposing] = useState(false);
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
  // Resolved from the SAVED zone, not the browser's: at 23:30 in Manila a
  // traveller's browser would already say tomorrow.
  const today = zonedToday(new Date(), timeZone);
  const existingDue = instantToZonedDateTimeInput(task.dueAt, timeZone);
  const dueDate = existingDue.slice(0, 10);
  const dueClock = existingDue ? existingDue.slice(11, 16) : "23:59";

  async function patch(changes: Partial<TaskFormInput>) {
    const values = { ...toFormValues(task, timeZone), ...changes };
    const result = await handlers.onSave(task.id, values);
    if (!result.ok) toast.error(result.error ?? "Could not save that change.");
  }

  function addSubtask() {
    const value = newSubtask.trim();
    if (!value || addingSubtask) return;
    /*
     * Cleared NOW, not after the round trip.
     *
     * Clearing on success meant the clear landed whenever the server replied,
     * which could be several hundred milliseconds later, on top of whatever the
     * user had already started typing. Breaking a task down is exactly the
     * moment people type fast, so the next step would silently lose its opening
     * characters. The test suite caught this as an intermittent failure long
     * before it was understood as a real one.
     *
     * The composer stays open and focused either way: several steps in a row
     * should not need a click between each one.
     */
    setNewSubtask("");
    startAddSubtask(async () => {
      const result = await handlers.onAddSubtask(task.id, value);
      if (result.ok) {
        subtaskInputRef.current?.focus();
      } else {
        toast.error(result.error ?? "Could not add that step.");
        // Put the text back only if nothing has been typed since, so recovering
        // from a failure never overwrites the step already under way.
        setNewSubtask((current) => (current === "" ? value : current));
      }
    });
  }

  function openComposer() {
    setComposing(true);
    // The input mounts in the same commit, so focus waits a frame for it.
    requestAnimationFrame(() => subtaskInputRef.current?.focus());
  }

  function cancelComposer() {
    setNewSubtask("");
    setComposing(false);
  }

  return (
    <div className="flex flex-col gap-6">
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

        <DetailRow label="Start">
          <DateField
            value={task.scheduledFor ?? ""}
            onChange={(next) =>
              void patch(
                // Clearing the day clears any stored hour with it: a time with
                // no date has nowhere to be shown.
                next ? { scheduledFor: next } : { scheduledFor: "", scheduledTime: "" },
              )
            }
            today={today}
            weekStartsOn={weekStartsOn}
            placeholder="No start date"
            ariaLabel="Start date"
          />
        </DetailRow>

        <DetailRow label="Due date">
          {/*
            A date, not an instant.
            
            `dueAt` stays a real timestamp because deadline automation keys on it
            (`deadline:{taskId}:{dueAtIso}`) and computes `minutesUntil` from it.
            So the hour is preserved rather than shown: a task that already had
            one keeps it, and a task given a due date here for the first time
            gets end of local day, which is what "due on the 28th" means.
          */}
          <DateField
            value={dueDate}
            onChange={(next) => void patch({ dueAt: next ? `${next}T${dueClock}` : "" })}
            today={today}
            weekStartsOn={weekStartsOn}
            placeholder="No due date"
            ariaLabel="Due date"
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
                {/*
                  Editable in place. A step written in a hurry is exactly the
                  thing you want to reword later, and until now the only way was
                  to delete it and type it again, which lost the tick with it.
                */}
                <SubtaskTitle
                  subtask={subtask}
                  timeZone={timeZone}
                  onSave={handlers.onSave}
                />
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

        {composing ? (
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
                  return;
                }
                if (e.key === "Escape") {
                  // Stopped here so the key does not travel on and close the
                  // whole panel: cancelling a step is not cancelling the task.
                  e.preventDefault();
                  e.stopPropagation();
                  cancelComposer();
                }
              }}
              onBlur={() => {
                // Clicking away from an empty composer means "never mind".
                // A typed-but-unsaved value is kept rather than thrown away.
                if (!newSubtask.trim()) setComposing(false);
              }}
              placeholder="What is the next step?"
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
        ) : (
          <button
            type="button"
            onClick={openComposer}
            className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg px-1.5 text-left text-callout text-label-secondary transition-colors hover:bg-surface-hover hover:text-blue focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 sm:min-h-9"
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            Add subtask
          </button>
        )}
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

      {/*
        Completing is a decision, so it reads as one.

        It used to be a checkbox tucked beside the title, which is the right
        control in a LIST where you are ticking things off in passing, and the
        wrong one here: on a detail view it sat next to the title competing with
        it, and a mis-click silently completed the task you had opened to read.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-separator pt-4">
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
        <Button
          variant={isCompleted ? "secondary" : "default"}
          onClick={() => handlers.onToggleComplete(task)}
        >
          {isCompleted ? (
            <>
              <RotateCcw className="size-4" aria-hidden />
              Reopen task
            </>
          ) : (
            <>
              <Check className="size-4" aria-hidden />
              Mark done
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
