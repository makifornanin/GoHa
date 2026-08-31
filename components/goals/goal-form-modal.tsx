"use client";

import { Target } from "lucide-react";
import { useRef, useState } from "react";

import type { ActionResult } from "@/app/(app)/goals/actions";
import type { Goal } from "@/db";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MANILA_TZ, zonedToday, type Weekday } from "@/lib/date";
import { goalLevel, type GoalLevel } from "@/lib/goal-tree";
import {
  DEFAULT_TIMEFRAME,
  GOAL_DESCRIPTION_MAX,
  GOAL_PROGRESS_MODES,
  GOAL_STATUS_ORDER,
  GOAL_TIMEFRAME_ORDER,
  GOAL_TITLE_MAX,
  goalLevelConfig,
  goalProgressModeConfig,
  goalStatusConfig,
  goalTimeframeConfig,
} from "@/lib/goals";
import type { GoalProgressMode, GoalStatus, GoalTimeframe } from "@/db/schema/enums";
import {
  goalFormSchema,
  toGoalFieldErrors,
  type GoalFieldErrors,
  type GoalFormInput,
} from "@/lib/validations/goal";
import { cn } from "@/lib/utils";

export type ParentOption = { id: string; title: string };
export type LifeAreaOption = { id: string; name: string };

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
  goal?: Goal | null;
  /**
   * Which level is being created. Only meaningful for `create`; an edit reads
   * the level off the goal itself, because that is the truth on the row.
   */
  level: GoalLevel;
  defaultParentGoalId?: string | null;
  defaultLifeAreaId?: string | null;
  lifeAreas: LifeAreaOption[];
  parentOptions: ParentOption[];
  /** The user's saved timezone, so "today" is their today. */
  timeZone?: string;
  /** Their saved week start, so the picker's week matches theirs. */
  weekStartsOn?: Weekday;
  onSubmit: (values: GoalFormInput) => Promise<ActionResult<Goal>>;
  onClose: () => void;
  titleRef: React.RefObject<HTMLInputElement | null>;
};

function GoalFormFields({
  mode,
  goal,
  level,
  defaultParentGoalId,
  defaultLifeAreaId,
  lifeAreas,
  parentOptions,
  timeZone = MANILA_TZ,
  weekStartsOn = 1,
  onSubmit,
  onClose,
  titleRef,
}: FormProps) {
  // Resolved from the SAVED zone, not the browser's: at 23:30 in Manila a
  // traveller's browser would already say tomorrow.
  const today = zonedToday(new Date(), timeZone);
  const [title, setTitle] = useState(() => goal?.title ?? "");
  const [description, setDescription] = useState(() => goal?.description ?? "");
  const [lifeAreaId, setLifeAreaId] = useState(() => goal?.lifeAreaId ?? defaultLifeAreaId ?? "");
  const [parentGoalId, setParentGoalId] = useState(
    () => goal?.parentGoalId ?? defaultParentGoalId ?? "",
  );
  /*
   * The parent this form was OPENED with, if any.
   *
   * "+ Add > Subgoal" from inside a goal already answered "under what", so
   * asking again in a dropdown is the app forgetting where the user just was.
   * The relationship is shown as context instead. It is still sent with the
   * form and still re-checked server-side; only the control is gone.
   */
  const lockedParent = mode === "create" && defaultParentGoalId
    ? (parentOptions.find((option) => option.id === defaultParentGoalId) ?? null)
    : null;
  const meta = goalLevelConfig[mode === "edit" && goal ? goalLevel(goal) : level];
  const [timeframe, setTimeframe] = useState<GoalTimeframe>(() => goal?.timeframe ?? DEFAULT_TIMEFRAME);
  const [status, setStatus] = useState<GoalStatus>(() => goal?.status ?? "not_started");
  const [progressMode, setProgressMode] = useState<GoalProgressMode>(() => goal?.progressMode ?? "auto");
  const [manualProgress, setManualProgress] = useState(() => goal?.manualProgress ?? 0);
  const [startDate, setStartDate] = useState(() => goal?.startDate ?? "");
  const [targetDate, setTargetDate] = useState(() => goal?.targetDate ?? "");

  const [fieldErrors, setFieldErrors] = useState<GoalFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function currentValues(): GoalFormInput {
    return {
      title,
      description,
      lifeAreaId,
      parentGoalId,
      timeframe,
      status,
      progressMode,
      manualProgress,
      startDate,
      targetDate,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const values = currentValues();
    const parsed = goalFormSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(toGoalFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const result = await onSubmit(values);
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
        <Label htmlFor="goal-title">Title</Label>
        <Input
          id="goal-title"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={GOAL_TITLE_MAX}
          placeholder={
            meta.label === "Subgoal" ? "e.g. Finish my resume" : "e.g. Find a new job"
          }
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={fieldErrors.title ? "goal-title-error" : undefined}
          disabled={submitting}
        />
        <FieldError id="goal-title-error" message={fieldErrors.title} />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <Label htmlFor="goal-description">
            Description <span className="text-outline">(optional)</span>
          </Label>
          <span className="text-label-sm text-outline">
            {description.length}/{GOAL_DESCRIPTION_MAX}
          </span>
        </div>
        <Textarea
          id="goal-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={GOAL_DESCRIPTION_MAX}
          placeholder={
            meta.label === "Subgoal"
              ? "What has to be true for this milestone to be done?"
              : "Why does this matter, and what does success look like?"
          }
          aria-invalid={Boolean(fieldErrors.description)}
          disabled={submitting}
        />
        <FieldError id="goal-description-error" message={fieldErrors.description} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="goal-life-area">Life area</Label>
          <Select
            id="goal-life-area"
            value={lifeAreaId}
            onChange={setLifeAreaId}
            disabled={submitting}
            options={[
              { value: "", label: "No life area" },
              ...lifeAreas.map((area) => ({ value: area.id, label: area.name })),
            ]}
          />
          <FieldError id="goal-life-area-error" message={fieldErrors.lifeAreaId} />
        </div>
        <div>
          <Label htmlFor="goal-parent">Part of</Label>
          {lockedParent ? (
            <>
              {/* Context, not a question. The relationship travels with the
                  form via the hidden input below. */}
              <p className="flex min-h-9 items-center gap-1.5 rounded-lg bg-fill-quaternary px-3 text-body text-label">
                <Target className="size-3.5 shrink-0 text-label-tertiary" aria-hidden />
                <span className="truncate">{lockedParent.title}</span>
              </p>
              <input type="hidden" name="parentGoalId" value={parentGoalId} />
              <p className="mt-1 text-footnote text-label-tertiary">
                {goalLevelConfig.subgoal.meaning}
              </p>
            </>
          ) : (
            <Select
              id="goal-parent"
              value={parentGoalId}
              onChange={setParentGoalId}
              disabled={submitting}
              options={[
                { value: "", label: "Nothing (this is a goal)" },
                ...parentOptions.map((option) => ({
                  value: option.id,
                  label: option.title,
                })),
              ]}
            />
          )}
          <FieldError id="goal-parent-error" message={fieldErrors.parentGoalId} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="goal-timeframe">Timeframe</Label>
          <Select
            id="goal-timeframe"
            value={timeframe}
            onChange={(v) => setTimeframe(v as GoalTimeframe)}
            disabled={submitting}
            options={GOAL_TIMEFRAME_ORDER.map((tf) => ({
              value: tf,
              label: goalTimeframeConfig[tf].label,
            }))}
          />
        </div>
        <div>
          <Label htmlFor="goal-status">Status</Label>
          <Select
            id="goal-status"
            value={status}
            onChange={(v) => setStatus(v as GoalStatus)}
            disabled={submitting}
            options={GOAL_STATUS_ORDER.map((s) => ({ value: s, label: goalStatusConfig[s].label }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="goal-start">
            Start date <span className="text-outline">(optional)</span>
          </Label>
          {/*
            The same picker the tasks use. Goals kept the native
            `<input type="date">` through two rounds of this work because the
            fix was applied to the component that had been reported rather than
            to every place the pattern lived.
          */}
          <DateField
            id="goal-start"
            value={startDate}
            onChange={setStartDate}
            today={today}
            weekStartsOn={weekStartsOn}
            placeholder="No start date"
            disabled={submitting}
            ariaLabel="Start date"
            ariaDescribedBy="goal-start-error"
            // A goal spans time, so its week matters in a way a task's does not.
            presets="week"
          />
          <FieldError id="goal-start-error" message={fieldErrors.startDate} />
        </div>
        <div>
          <Label htmlFor="goal-target">
            Target date <span className="text-outline">(optional)</span>
          </Label>
          <DateField
            id="goal-target"
            value={targetDate}
            onChange={setTargetDate}
            today={today}
            weekStartsOn={weekStartsOn}
            placeholder="No target date"
            disabled={submitting}
            ariaLabel="Target date"
            ariaDescribedBy="goal-target-error"
            presets="week"
          />
          <FieldError id="goal-target-error" message={fieldErrors.targetDate} />
        </div>
      </div>

      <fieldset disabled={submitting}>
        <legend className="mb-2 text-label-md text-on-surface-variant">Progress</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Progress mode">
          {GOAL_PROGRESS_MODES.map((pm) => {
            const selected = progressMode === pm;
            return (
              <button
                key={pm}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setProgressMode(pm)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-label-md transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-outline-variant text-on-surface-variant hover:border-primary",
                )}
              >
                {goalProgressModeConfig[pm].label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-body-sm text-on-surface-variant">
          {goalProgressModeConfig[progressMode].hint}
        </p>

        {progressMode === "manual" ? (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="goal-manual">Manual progress</Label>
              <span className="text-label-md text-on-surface">{manualProgress}%</span>
            </div>
            <input
              id="goal-manual"
              type="range"
              min={0}
              max={100}
              step={1}
              value={manualProgress}
              onChange={(e) => setManualProgress(Number(e.target.value))}
              className="w-full accent-primary"
              aria-describedby={fieldErrors.manualProgress ? "goal-manual-error" : undefined}
            />
            <FieldError id="goal-manual-error" message={fieldErrors.manualProgress} />
          </div>
        ) : null}
      </fieldset>

      <div className="mt-1 flex items-center justify-end gap-3 border-t border-outline-variant pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {mode === "create" ? `Create ${meta.label.toLowerCase()}` : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Create/edit modal for a goal. Mirrors the Life Areas modal pattern: the inner
 * form mounts only while open, so it always initializes from the current goal
 * without a reset effect. Validation uses the shared Zod schema; ownership of the
 * life area and parent goal is re-checked server-side.
 */
export function GoalFormModal({
  open,
  mode,
  goal,
  level = "goal",
  defaultParentGoalId,
  defaultLifeAreaId,
  lifeAreas,
  parentOptions,
  timeZone,
  weekStartsOn,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  goal?: Goal | null;
  /** Which level a NEW record is. Ignored when editing; the row decides. */
  level?: GoalLevel;
  /** Preselected parent, e.g. "Add subgoal" from inside a goal. */
  defaultParentGoalId?: string | null;
  /** Preselected life area, inherited from the parent goal when there is one. */
  defaultLifeAreaId?: string | null;
  lifeAreas: LifeAreaOption[];
  parentOptions: ParentOption[];
  /** The user's saved timezone, so "today" is their today. */
  timeZone?: string;
  /** Their saved week start, so the picker's week matches theirs. */
  weekStartsOn?: Weekday;
  onSubmit: (values: GoalFormInput) => Promise<ActionResult<Goal>>;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const meta = goalLevelConfig[mode === "edit" && goal ? goalLevel(goal) : level];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? `New ${meta.label.toLowerCase()}` : `Edit ${meta.label.toLowerCase()}`}
      description={mode === "create" ? meta.meaning : undefined}
      initialFocus={() => titleRef.current}
      className="sm:max-w-xl"
    >
      <GoalFormFields
        mode={mode}
        goal={goal}
        level={level}
        defaultParentGoalId={defaultParentGoalId}
        defaultLifeAreaId={defaultLifeAreaId}
        lifeAreas={lifeAreas}
        parentOptions={parentOptions}
        timeZone={timeZone}
        weekStartsOn={weekStartsOn}
        onSubmit={onSubmit}
        onClose={onClose}
        titleRef={titleRef}
      />
    </Modal>
  );
}
