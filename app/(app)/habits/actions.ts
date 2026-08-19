"use server";

import { revalidatePath } from "next/cache";

import { goalsRepo, habitsRepo, lifeAreasRepo, type Habit, type HabitEntry } from "@/db";
import { zonedToday } from "@/lib/date";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";
import {
  habitFormSchema,
  habitIdSchema,
  habitLogSchema,
  isoDateSchema,
  toHabitFieldErrors,
  type HabitFieldErrors,
  type HabitFormInput,
  type HabitFormValues,
} from "@/lib/validations/habit";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: HabitFieldErrors };

const GENERIC_ERROR = "Something went wrong saving that. Please try again.";

/** Habits show on both the Habits module and Today, so refresh both. */
function revalidateHabitSurfaces() {
  revalidatePath("/habits");
  revalidatePath("/today");
}

async function validateReferences(userId: string, values: HabitFormValues): Promise<HabitFieldErrors> {
  const fieldErrors: HabitFieldErrors = {};
  if (values.lifeAreaId) {
    const area = await lifeAreasRepo.getLifeArea(userId, values.lifeAreaId);
    if (!area) fieldErrors.lifeAreaId = "Choose one of your life areas.";
  }
  if (values.goalId) {
    const goal = await goalsRepo.getGoal(userId, values.goalId);
    if (!goal) fieldErrors.goalId = "Choose one of your goals.";
  }
  return fieldErrors;
}

function habitColumns(values: HabitFormValues) {
  const numeric = values.type === "numeric";
  return {
    name: values.name,
    description: values.description,
    type: values.type,
    targetValue: numeric && values.targetValue != null ? String(values.targetValue) : null,
    unit: numeric ? values.unit : null,
    higherIsBetter: values.higherIsBetter,
    color: values.color,
    icon: values.icon,
    lifeAreaId: values.lifeAreaId,
    goalId: values.goalId,
  };
}

/**
 * `startDate` is the day the habit begins counting. It is set once, on create,
 * and deliberately NOT rewritten on edit: changing a habit's cadence must not
 * erase the history it has already earned.
 *
 * Without it a habit was considered scheduled for all of recorded time, so every
 * day before it existed showed as "Missed".
 */
function scheduleColumns(values: HabitFormValues, startDate?: string) {
  const start = startDate ? { startDate } : {};
  if (values.scheduleType === "daily") {
    return { frequency: "daily" as const, daysOfWeek: null, timesPerPeriod: null, isActive: true, ...start };
  }
  if (values.scheduleType === "weekly_days") {
    return {
      frequency: "weekly" as const,
      daysOfWeek: values.daysOfWeek,
      timesPerPeriod: null,
      isActive: true,
      ...start,
    };
  }
  return {
    frequency: "weekly" as const,
    daysOfWeek: null,
    timesPerPeriod: values.timesPerWeek,
    isActive: true,
    ...start,
  };
}

export async function createHabitAction(input: HabitFormInput): Promise<ActionResult<Habit>> {
  const user = await requireUser();

  const parsed = habitFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: toHabitFieldErrors(parsed.error) };
  }
  const refErrors = await validateReferences(user.id, parsed.data);
  if (Object.keys(refErrors).length > 0) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: refErrors };
  }

  try {
    const { timeZone } = await getUserDatePrefs(user.id);
    const habit = await habitsRepo.createHabit(user.id, habitColumns(parsed.data));
    await habitsRepo.upsertHabitSchedule(
      user.id,
      habit.id,
      scheduleColumns(parsed.data, zonedToday(new Date(), timeZone)),
    );
    revalidateHabitSurfaces();
    return { ok: true, data: habit };
  } catch (error) {
    console.error("createHabitAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updateHabitAction(id: string, input: HabitFormInput): Promise<ActionResult<Habit>> {
  const user = await requireUser();

  const idResult = habitIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That habit could not be found." };

  const parsed = habitFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: toHabitFieldErrors(parsed.error) };
  }

  const existing = await habitsRepo.getHabit(user.id, idResult.data);
  if (!existing) return { ok: false, error: "That habit could not be found." };

  const refErrors = await validateReferences(user.id, parsed.data);
  if (Object.keys(refErrors).length > 0) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: refErrors };
  }

  try {
    const habit = await habitsRepo.updateHabit(user.id, idResult.data, habitColumns(parsed.data));
    if (!habit) return { ok: false, error: "That habit could not be found." };
    await habitsRepo.upsertHabitSchedule(user.id, habit.id, scheduleColumns(parsed.data));
    revalidateHabitSurfaces();
    return { ok: true, data: habit };
  } catch (error) {
    console.error("updateHabitAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function archiveHabitAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = habitIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That habit could not be found." };

  try {
    const habit = await habitsRepo.archiveHabit(user.id, idResult.data);
    if (!habit) return { ok: false, error: "That habit could not be found." };
    revalidateHabitSurfaces();
    return { ok: true, data: { id: habit.id } };
  } catch (error) {
    console.error("archiveHabitAction failed", error);
    return { ok: false, error: "Could not archive that habit. Please try again." };
  }
}

/**
 * Log a habit for a day. Upserts on (habitId, entryDate) so repeated clicks never
 * duplicate. Writes to the same habit_entries seen in the Habits module and on
 * Today (CLAUDE.md section 7). Ownership: the habit must belong to the caller.
 */
export async function logHabitEntryAction(
  habitId: string,
  entryDate: string,
  input: { status?: "done" | "missed" | "skipped"; value?: number | null; note?: string | null },
): Promise<ActionResult<HabitEntry>> {
  const user = await requireUser();

  const idResult = habitIdSchema.safeParse(habitId);
  const dateResult = isoDateSchema.safeParse(entryDate);
  if (!idResult.success || !dateResult.success) {
    return { ok: false, error: "That habit could not be found." };
  }
  const logResult = habitLogSchema.safeParse(input);
  if (!logResult.success) {
    return { ok: false, error: logResult.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const habit = await habitsRepo.getHabit(user.id, idResult.data);
  if (!habit) return { ok: false, error: "That habit could not be found." };
  if (
    habit.type === "numeric" &&
    logResult.data.status === "done" &&
    logResult.data.value == null
  ) {
    return { ok: false, error: "Enter a value before marking this habit done." };
  }

  try {
    const entry = await habitsRepo.logHabitEntry(user.id, idResult.data, dateResult.data, {
      status: logResult.data.status,
      value: logResult.data.value != null ? String(logResult.data.value) : null,
      note: logResult.data.note,
    });
    revalidateHabitSurfaces();
    return { ok: true, data: entry };
  } catch (error) {
    console.error("logHabitEntryAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Clear a habit's log for a day (removes the entry entirely). */
export async function clearHabitEntryAction(
  habitId: string,
  entryDate: string,
): Promise<ActionResult<{ cleared: boolean }>> {
  const user = await requireUser();

  const idResult = habitIdSchema.safeParse(habitId);
  const dateResult = isoDateSchema.safeParse(entryDate);
  if (!idResult.success || !dateResult.success) {
    return { ok: false, error: "That habit could not be found." };
  }

  const habit = await habitsRepo.getHabit(user.id, idResult.data);
  if (!habit) return { ok: false, error: "That habit could not be found." };

  try {
    const cleared = await habitsRepo.deleteHabitEntry(user.id, idResult.data, dateResult.data);
    revalidateHabitSurfaces();
    return { ok: true, data: { cleared } };
  } catch (error) {
    console.error("clearHabitEntryAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
