"use client";

import { useRef, useState } from "react";

import type { ActionResult } from "@/app/(app)/tasks/actions";
import type { Task } from "@/db";
import type { Priority, TaskStatus } from "@/db/schema/enums";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { instantToZonedDateTimeInput, MANILA_TZ, zonedToday, type Weekday } from "@/lib/date";
import { goalPickerOptions } from "@/lib/goal-tree";
import { cn } from "@/lib/utils";
import {
  formatEstimate,
  TASK_DESCRIPTION_MAX,
  TASK_ESTIMATE_OPTIONS,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_ORDER,
  TASK_TITLE_MAX,
  taskPriorityConfig,
  taskStatusConfig,
} from "@/lib/tasks";
import {
  makeTaskFormSchema,
  toTaskFieldErrors,
  type TaskFieldErrors,
  type TaskFormInput,
} from "@/lib/validations/task";

/**
 * The hour a newly given due date lands on, in the user's own zone.
 *
 * "Due on the 29th" means by the end of the 29th, not 00:00 as it starts. The
 * form no longer asks for a time, so this is the assumption it makes, and it is
 * only ever applied to a task that had no due instant before.
 */
const DEFAULT_DUE_CLOCK = "23:59";

export type TaskGoalOption = {
  id: string;
  title: string;
  parentGoalId: string | null;
  isArchived?: boolean;
};
export type TaskLifeAreaOption = { id: string; name: string };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-body-sm text-error">
      {message}
    </p>
  );
}

/** One duration choice. A radio in behaviour, a chip in appearance. */
function EstimateChip({
  selected,
  onSelect,
  disabled,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "touch-target cursor-pointer rounded-lg border px-3 text-callout transition-colors",
        selected
          ? "border-blue bg-blue/10 font-medium text-blue"
          : "border-separator-opaque text-label-secondary hover:border-blue/40 hover:text-label",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {label}
    </button>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-label-md text-on-surface-variant">
      {children}
    </label>
  );
}

type FormProps = {
  mode: "create" | "edit";
  task?: Task | null;
  goals: TaskGoalOption[];
  lifeAreas: TaskLifeAreaOption[];
  defaultScheduledFor?: string;
  /** Preselected goal for a new to-do (e.g. "+ Add > To-do" inside a goal). */
  defaultGoalId?: string;
  /** Preselected life area, inherited from the goal or the area in view. */
  defaultLifeAreaId?: string;
  /** The user's saved timezone: due-at wall-clock times are shown/read in it. */
  timeZone?: string;
  /** Their saved week start, so the date picker's week matches theirs. */
  weekStartsOn?: Weekday;
  onSubmit: (values: TaskFormInput) => Promise<ActionResult<Task>>;
  onClose: () => void;
  titleRef: React.RefObject<HTMLInputElement | null>;
};

function TaskFormFields({
  mode,
  task,
  goals,
  lifeAreas,
  defaultScheduledFor,
  defaultGoalId,
  defaultLifeAreaId,
  timeZone = MANILA_TZ,
  weekStartsOn = 1,
  onSubmit,
  onClose,
  titleRef,
}: FormProps) {
  // Resolved from the saved zone, not the browser's: at 23:30 in Manila the
  // browser of someone travelling would already say tomorrow.
  const today = zonedToday(new Date(), timeZone);
  const [title, setTitle] = useState(() => task?.title ?? "");
  const [description, setDescription] = useState(() => task?.description ?? "");
  const [goalId, setGoalId] = useState(() => task?.goalId ?? defaultGoalId ?? "");
  const [lifeAreaId, setLifeAreaId] = useState(
    () => task?.lifeAreaId ?? defaultLifeAreaId ?? "",
  );
  const [status, setStatus] = useState<TaskStatus>(() => task?.status ?? "todo");
  const [priority, setPriority] = useState<Priority>(() => task?.priority ?? "medium");
  const [scheduledFor, setScheduledFor] = useState(
    () => task?.scheduledFor ?? defaultScheduledFor ?? "",
  );
  /*
   * Read, never edited. Planning is dates now, so the start-time control is
   * gone, but a task that already carries one keeps it: removing the input must
   * not silently erase data entered under an earlier build. The column and the
   * value both stay; only the control went away.
   */
  const scheduledTime = task?.scheduledTime ? task.scheduledTime.slice(0, 5) : "";
  /*
   * Due is chosen as a DATE, but stored as an instant.
   *
   * `dueAt` is a real timestamp that deadline automation depends on: the dedupe
   * key is `deadline:{taskId}:{dueAtIso}` and the reminder computes
   * `minutesUntil` from it. So the time of day is kept rather than shown. An
   * existing task keeps whatever hour it already had, and a task given a due
   * date for the first time gets end of local day, which is what "due on the
   * 29th" means to a person.
   */
  const existingDue = instantToZonedDateTimeInput(task?.dueAt, timeZone);
  const [estimateMinutes, setEstimateMinutes] = useState(
    () => (task?.estimateMinutes != null ? String(task.estimateMinutes) : ""),
  );
  const [dueDate, setDueDate] = useState(() => existingDue.slice(0, 10));
  const [dueClock] = useState(() => (existingDue ? existingDue.slice(11, 16) : DEFAULT_DUE_CLOCK));

  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function values(): TaskFormInput {
    return {
      title,
      description,
      goalId,
      lifeAreaId,
      status,
      priority,
      scheduledFor,
      /*
       * Planning is dates now, so this form no longer offers a start time. The
       * COLUMN is untouched and any value a task already has is sent straight
       * back: dropping the control must not quietly wipe data that earlier
       * builds let people enter.
       */
      scheduledTime: scheduledFor ? scheduledTime : "",
      dueAt: dueDate ? `${dueDate}T${dueClock}` : "",
      estimateMinutes,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const input = values();
    const parsed = makeTaskFormSchema(timeZone).safeParse(input);
    if (!parsed.success) {
      setFieldErrors(toTaskFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const result = await onSubmit(input);
    if (!result.ok) {
      setSubmitting(false);
      setFieldErrors(result.fieldErrors ?? {});
      setFormError(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-6 py-5" noValidate>
      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error"
        >
          {formError}
        </p>
      ) : null}

      <div>
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TASK_TITLE_MAX}
          placeholder="e.g. Draft the launch email"
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={fieldErrors.title ? "task-title-error" : undefined}
          disabled={submitting}
        />
        <FieldError id="task-title-error" message={fieldErrors.title} />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <Label htmlFor="task-description">
            Description <span className="text-outline">(optional)</span>
          </Label>
          <span className="text-label-sm text-outline">
            {description.length}/{TASK_DESCRIPTION_MAX}
          </span>
        </div>
        <Textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={TASK_DESCRIPTION_MAX}
          placeholder="Any detail that helps you act on this."
          disabled={submitting}
        />
        <FieldError id="task-description-error" message={fieldErrors.description} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="task-status">Status</Label>
          <Select
            id="task-status"
            value={status}
            onChange={(v) => setStatus(v as TaskStatus)}
            disabled={submitting}
            options={TASK_STATUS_ORDER.map((s) => ({ value: s, label: taskStatusConfig[s].label }))}
          />
        </div>
        <div>
          <Label htmlFor="task-priority">Priority</Label>
          <Select
            id="task-priority"
            value={priority}
            onChange={(v) => setPriority(v as Priority)}
            disabled={submitting}
            options={TASK_PRIORITY_ORDER.map((p) => ({ value: p, label: taskPriorityConfig[p].label }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="task-goal">Goal <span className="text-outline">(optional)</span></Label>
          <Select
            id="task-goal"
            value={goalId}
            onChange={setGoalId}
            disabled={submitting}
            options={[
              { value: "", label: "No goal" },
              // Subgoals read as "Find a new job > Finish resume", so a to-do
              // can be filed against a milestone on purpose.
              ...goalPickerOptions(goals, goalId || task?.goalId).map((g) => ({ value: g.id, label: g.label })),
            ]}
          />
          <FieldError id="task-goal-error" message={fieldErrors.goalId} />
        </div>
        <div>
          <Label htmlFor="task-life-area">Life area <span className="text-outline">(optional)</span></Label>
          <Select
            id="task-life-area"
            value={lifeAreaId}
            onChange={setLifeAreaId}
            disabled={submitting}
            options={[
              { value: "", label: "No life area" },
              ...lifeAreas.map((area) => ({ value: area.id, label: area.name })),
            ]}
          />
          <FieldError id="task-life-area-error" message={fieldErrors.lifeAreaId} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="task-scheduled">
            Start <span className="text-outline">(optional)</span>
          </Label>
          <DateField
            id="task-scheduled"
            value={scheduledFor}
            onChange={setScheduledFor}
            today={today}
            weekStartsOn={weekStartsOn}
            placeholder="No start date"
            disabled={submitting}
            ariaDescribedBy="task-scheduled-error"
          />
          <FieldError id="task-scheduled-error" message={fieldErrors.scheduledFor} />
        </div>
        <div>
          <Label htmlFor="task-due">
            Due <span className="text-outline">(optional)</span>
          </Label>
          <DateField
            id="task-due"
            value={dueDate}
            onChange={setDueDate}
            today={today}
            weekStartsOn={weekStartsOn}
            placeholder="No due date"
            disabled={submitting}
            ariaDescribedBy="task-due-error"
          />
          <FieldError id="task-due-error" message={fieldErrors.dueAt} />
        </div>
      </div>

      <div>
        <Label htmlFor="task-estimate">
          How long will this take? <span className="text-outline">(optional)</span>
        </Label>
        {/*
          A short ladder, not a number field.

          The column has existed since the first migration and nothing ever
          wrote to it, because there was no control. The Day Planner needs this
          value and needs it to be honest, so "Not sure" is a real answer rather
          than a default of zero: the planner would rather ask later than add up
          a number nobody chose.
        */}
        <div
          id="task-estimate"
          role="radiogroup"
          aria-label="Estimated time"
          className="flex flex-wrap gap-1.5"
        >
          <EstimateChip
            selected={estimateMinutes === ""}
            onSelect={() => setEstimateMinutes("")}
            disabled={submitting}
            label="Not sure"
          />
          {TASK_ESTIMATE_OPTIONS.map((minutes) => (
            <EstimateChip
              key={minutes}
              selected={estimateMinutes === String(minutes)}
              onSelect={() => setEstimateMinutes(String(minutes))}
              disabled={submitting}
              label={formatEstimate(minutes) ?? ""}
            />
          ))}
        </div>
        <FieldError id="task-estimate-error" message={fieldErrors.estimateMinutes} />
      </div>

      <div className="mt-1 flex items-center justify-end gap-3 border-t border-outline-variant pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {mode === "create" ? "Create to-do" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/** Create/edit modal for a task (mount-on-open resets state from `task`). */
export function TaskFormModal({
  open,
  mode,
  task,
  goals,
  lifeAreas,
  defaultScheduledFor,
  defaultGoalId,
  defaultLifeAreaId,
  timeZone,
  weekStartsOn,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  task?: Task | null;
  goals: TaskGoalOption[];
  lifeAreas: TaskLifeAreaOption[];
  defaultScheduledFor?: string;
  /** Preselected goal for a new to-do (e.g. "+ Add > To-do" inside a goal). */
  defaultGoalId?: string;
  /** Preselected life area, inherited from the goal or the area in view. */
  defaultLifeAreaId?: string;
  timeZone?: string;
  /** The user's saved week start, so the picker's week matches theirs. */
  weekStartsOn?: Weekday;
  onSubmit: (values: TaskFormInput) => Promise<ActionResult<Task>>;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New to-do" : "Edit to-do"}
      description={
        mode === "create" ? "Capture what needs doing and when." : undefined
      }
      initialFocus={() => titleRef.current}
      className="sm:max-w-xl"
    >
      <TaskFormFields
        mode={mode}
        task={task}
        goals={goals}
        lifeAreas={lifeAreas}
        defaultScheduledFor={defaultScheduledFor}
        defaultGoalId={defaultGoalId}
        defaultLifeAreaId={defaultLifeAreaId}
        timeZone={timeZone}
        weekStartsOn={weekStartsOn}
        onSubmit={onSubmit}
        onClose={onClose}
        titleRef={titleRef}
      />
    </Modal>
  );
}
