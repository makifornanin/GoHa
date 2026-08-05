"use client";

import { useRef, useState } from "react";

import type { ActionResult } from "@/app/(app)/habits/actions";
import type { Habit } from "@/db";
import type { HabitWithSchedule } from "@/db/repositories/habits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { lifeAreaIconMap } from "@/components/life-areas/icon";
import {
  HABIT_DESCRIPTION_MAX,
  HABIT_NAME_MAX,
  HABIT_SCHEDULE_TYPES,
  HABIT_TYPE_VALUES,
  habitScheduleTypeConfig,
  habitTypeConfig,
  toNumberOrNull,
  WEEK_ORDER_MON_FIRST,
  WEEKDAY_ABBR,
  type HabitScheduleType,
} from "@/lib/habits";
import {
  LIFE_AREA_COLOR_KEYS,
  LIFE_AREA_ICON_KEYS,
  lifeAreaColorConfig,
  toColorKey,
  toIconKey,
  type LifeAreaColorKey,
  type LifeAreaIconKey,
} from "@/lib/life-areas";
import {
  habitFormSchema,
  toHabitFieldErrors,
  type HabitFieldErrors,
  type HabitFormInput,
} from "@/lib/validations/habit";
import { cn } from "@/lib/utils";

export type HabitLifeAreaOption = { id: string; name: string };
export type HabitGoalOption = { id: string; title: string };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-body-sm text-error">
      {message}
    </p>
  );
}

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-label-md text-on-surface-variant">
      {children}
    </label>
  );
}

function scheduleTypeOf(habit: HabitWithSchedule | null | undefined): HabitScheduleType {
  const s = habit?.schedule;
  if (!s || s.frequency === "daily") return "daily";
  if (s.frequency === "weekly" && s.daysOfWeek && s.daysOfWeek.length > 0) return "weekly_days";
  if (s.frequency === "weekly" && s.timesPerPeriod) return "weekly_times";
  return "daily";
}

type FormProps = {
  mode: "create" | "edit";
  habit?: HabitWithSchedule | null;
  lifeAreas: HabitLifeAreaOption[];
  goals: HabitGoalOption[];
  onSubmit: (values: HabitFormInput) => Promise<ActionResult<Habit>>;
  onClose: () => void;
  nameRef: React.RefObject<HTMLInputElement | null>;
};

function HabitFormFields({ mode, habit, lifeAreas, goals, onSubmit, onClose, nameRef }: FormProps) {
  const [name, setName] = useState(() => habit?.name ?? "");
  const [description, setDescription] = useState(() => habit?.description ?? "");
  const [type, setType] = useState<(typeof HABIT_TYPE_VALUES)[number]>(() => habit?.type ?? "boolean");
  const [targetValue, setTargetValue] = useState(() => {
    const n = toNumberOrNull(habit?.targetValue ?? null);
    return n != null ? String(n) : "";
  });
  const [unit, setUnit] = useState(() => habit?.unit ?? "");
  const [higherIsBetter, setHigherIsBetter] = useState(() => habit?.higherIsBetter ?? true);
  const [color, setColor] = useState<LifeAreaColorKey>(() => toColorKey(habit?.color));
  const [icon, setIcon] = useState<LifeAreaIconKey>(() => toIconKey(habit?.icon));
  const [lifeAreaId, setLifeAreaId] = useState(() => habit?.lifeAreaId ?? "");
  const [goalId, setGoalId] = useState(() => habit?.goalId ?? "");
  const [scheduleType, setScheduleType] = useState<HabitScheduleType>(() => scheduleTypeOf(habit));
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(() => habit?.schedule?.daysOfWeek ?? [1, 3, 5]);
  const [timesPerWeek, setTimesPerWeek] = useState(() => habit?.schedule?.timesPerPeriod ?? 3);

  const [fieldErrors, setFieldErrors] = useState<HabitFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function values(): HabitFormInput {
    return {
      name,
      description,
      type,
      targetValue: type === "numeric" ? targetValue : "",
      unit: type === "numeric" ? unit : "",
      higherIsBetter,
      color,
      icon,
      lifeAreaId,
      goalId,
      scheduleType,
      daysOfWeek,
      timesPerWeek,
    };
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const input = values();
    const parsed = habitFormSchema.safeParse(input);
    if (!parsed.success) {
      setFieldErrors(toHabitFieldErrors(parsed.error));
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
        <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">
          {formError}
        </p>
      ) : null}

      <div>
        <Label htmlFor="habit-name">Name</Label>
        <Input
          id="habit-name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={HABIT_NAME_MAX}
          placeholder="e.g. Meditate, Drink water"
          aria-invalid={Boolean(fieldErrors.name)}
          disabled={submitting}
        />
        <FieldError id="habit-name-error" message={fieldErrors.name} />
      </div>

      <div>
        <Label htmlFor="habit-description">Description <span className="text-outline">(optional)</span></Label>
        <Textarea
          id="habit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={HABIT_DESCRIPTION_MAX}
          placeholder="What does doing this well look like?"
          disabled={submitting}
        />
      </div>

      <fieldset disabled={submitting}>
        <legend className="mb-2 text-label-md text-on-surface-variant">Measurement</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Measurement type">
          {HABIT_TYPE_VALUES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-label-md transition-colors",
                type === t ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant hover:border-primary",
              )}
            >
              {habitTypeConfig[t].label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-body-sm text-on-surface-variant">{habitTypeConfig[type].hint}</p>

        {type === "numeric" ? (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="habit-target">Target</Label>
              <Input
                id="habit-target"
                type="number"
                min={0}
                step="any"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="8"
                aria-invalid={Boolean(fieldErrors.targetValue)}
              />
              <FieldError id="habit-target-error" message={fieldErrors.targetValue} />
            </div>
            <div>
              <Label htmlFor="habit-unit">Unit</Label>
              <Input
                id="habit-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="glasses"
              />
            </div>
            <div>
              <Label htmlFor="habit-direction">Goal is</Label>
              <Select
                id="habit-direction"
                value={higherIsBetter ? "at_least" : "at_most"}
                onChange={(v) => setHigherIsBetter(v === "at_least")}
                options={[
                  { value: "at_least", label: "At least target" },
                  { value: "at_most", label: "At most target" },
                ]}
              />
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset disabled={submitting}>
        <legend className="mb-2 text-label-md text-on-surface-variant">Schedule</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Schedule type">
          {HABIT_SCHEDULE_TYPES.map((st) => (
            <button
              key={st}
              type="button"
              role="radio"
              aria-checked={scheduleType === st}
              onClick={() => setScheduleType(st)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-label-md transition-colors",
                scheduleType === st ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant hover:border-primary",
              )}
            >
              {habitScheduleTypeConfig[st].label}
            </button>
          ))}
        </div>

        {scheduleType === "weekly_days" ? (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Days of week">
              {WEEK_ORDER_MON_FIRST.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={daysOfWeek.includes(day)}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "h-10 w-11 rounded-lg border text-label-md transition-colors",
                    daysOfWeek.includes(day)
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant text-on-surface-variant hover:border-primary",
                  )}
                >
                  {WEEKDAY_ABBR[day]}
                </button>
              ))}
            </div>
            <FieldError id="habit-days-error" message={fieldErrors.daysOfWeek} />
          </div>
        ) : null}

        {scheduleType === "weekly_times" ? (
          <div className="mt-3 flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={7}
              value={String(timesPerWeek)}
              onChange={(e) => setTimesPerWeek(Number(e.target.value))}
              className="w-24"
              aria-label="Times per week"
            />
            <span className="text-body-md text-on-surface-variant">times per week</span>
            <FieldError id="habit-times-error" message={fieldErrors.timesPerWeek} />
          </div>
        ) : null}
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="habit-life-area">Life area <span className="text-outline">(optional)</span></Label>
          <Select
            id="habit-life-area"
            value={lifeAreaId}
            onChange={setLifeAreaId}
            disabled={submitting}
            options={[
              { value: "", label: "No life area" },
              ...lifeAreas.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
          <FieldError id="habit-life-area-error" message={fieldErrors.lifeAreaId} />
        </div>
        <div>
          <Label htmlFor="habit-goal">Goal <span className="text-outline">(optional)</span></Label>
          <Select
            id="habit-goal"
            value={goalId}
            onChange={setGoalId}
            disabled={submitting}
            options={[
              { value: "", label: "No goal" },
              ...goals.map((g) => ({ value: g.id, label: g.title })),
            ]}
          />
          <FieldError id="habit-goal-error" message={fieldErrors.goalId} />
        </div>
      </div>

      <fieldset disabled={submitting}>
        <legend className="mb-2 text-label-md text-on-surface-variant">Color &amp; icon</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
          {LIFE_AREA_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={color === key}
              aria-label={lifeAreaColorConfig[key].label}
              onClick={() => setColor(key)}
              className={cn(
                "flex size-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-surface-container-lowest transition-all",
                color === key ? "ring-on-surface" : "ring-transparent hover:ring-outline-variant",
              )}
            >
              <span className={cn("size-5 rounded-full", lifeAreaColorConfig[key].swatch)} aria-hidden />
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-6 gap-2" role="radiogroup" aria-label="Icon">
          {LIFE_AREA_ICON_KEYS.map((key) => {
            const Icon = lifeAreaIconMap[key];
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={icon === key}
                aria-label={key}
                onClick={() => setIcon(key)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-lg border transition-colors",
                  icon === key ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant hover:border-primary",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-1 flex items-center justify-end gap-3 border-t border-outline-variant pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {mode === "create" ? "Create habit" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export function HabitFormModal({
  open,
  mode,
  habit,
  lifeAreas,
  goals,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  habit?: HabitWithSchedule | null;
  lifeAreas: HabitLifeAreaOption[];
  goals: HabitGoalOption[];
  onSubmit: (values: HabitFormInput) => Promise<ActionResult<Habit>>;
  onClose: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New habit" : "Edit habit"}
      description={mode === "create" ? "Build a routine you can keep." : undefined}
      initialFocus={() => nameRef.current}
      className="sm:max-w-2xl"
    >
      <HabitFormFields
        mode={mode}
        habit={habit}
        lifeAreas={lifeAreas}
        goals={goals}
        onSubmit={onSubmit}
        onClose={onClose}
        nameRef={nameRef}
      />
    </Modal>
  );
}
