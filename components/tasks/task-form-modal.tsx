"use client";

import { useRef, useState } from "react";

import type { ActionResult } from "@/app/(app)/tasks/actions";
import type { Task } from "@/db";
import type { Priority, TaskStatus } from "@/db/schema/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { instantToZonedDateTimeInput, MANILA_TZ } from "@/lib/date";
import {
  TASK_DESCRIPTION_MAX,
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

export type TaskGoalOption = { id: string; title: string };
export type TaskLifeAreaOption = { id: string; name: string };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-body-sm text-error">
      {message}
    </p>
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
  /** Preselected goal for a new task (e.g. "Add task" from a goal's details). */
  defaultGoalId?: string;
  /** The user's saved timezone: due-at wall-clock times are shown/read in it. */
  timeZone?: string;
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
  timeZone = MANILA_TZ,
  onSubmit,
  onClose,
  titleRef,
}: FormProps) {
  const [title, setTitle] = useState(() => task?.title ?? "");
  const [description, setDescription] = useState(() => task?.description ?? "");
  const [goalId, setGoalId] = useState(() => task?.goalId ?? defaultGoalId ?? "");
  const [lifeAreaId, setLifeAreaId] = useState(() => task?.lifeAreaId ?? "");
  const [status, setStatus] = useState<TaskStatus>(() => task?.status ?? "todo");
  const [priority, setPriority] = useState<Priority>(() => task?.priority ?? "medium");
  const [scheduledFor, setScheduledFor] = useState(
    () => task?.scheduledFor ?? defaultScheduledFor ?? "",
  );
  const [dueAt, setDueAt] = useState(() => instantToZonedDateTimeInput(task?.dueAt, timeZone));

  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function values(): TaskFormInput {
    return { title, description, goalId, lifeAreaId, status, priority, scheduledFor, dueAt };
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
              ...goals.map((goal) => ({ value: goal.id, label: goal.title })),
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
            Scheduled for <span className="text-outline">(optional)</span>
          </Label>
          <Input
            id="task-scheduled"
            type="date"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            disabled={submitting}
          />
          <FieldError id="task-scheduled-error" message={fieldErrors.scheduledFor} />
        </div>
        <div>
          <Label htmlFor="task-due">Due <span className="text-outline">(optional)</span></Label>
          <Input
            id="task-due"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            disabled={submitting}
          />
          <FieldError id="task-due-error" message={fieldErrors.dueAt} />
        </div>
      </div>

      <div className="mt-1 flex items-center justify-end gap-3 border-t border-outline-variant pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {mode === "create" ? "Create task" : "Save changes"}
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
  timeZone,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  task?: Task | null;
  goals: TaskGoalOption[];
  lifeAreas: TaskLifeAreaOption[];
  defaultScheduledFor?: string;
  /** Preselected goal for a new task (e.g. "Add task" from a goal's details). */
  defaultGoalId?: string;
  timeZone?: string;
  onSubmit: (values: TaskFormInput) => Promise<ActionResult<Task>>;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New task" : "Edit task"}
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
        timeZone={timeZone}
        onSubmit={onSubmit}
        onClose={onClose}
        titleRef={titleRef}
      />
    </Modal>
  );
}
