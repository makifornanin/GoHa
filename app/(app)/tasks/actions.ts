"use server";

import { revalidatePath } from "next/cache";

import { goalsRepo, lifeAreasRepo, tasksRepo, type Task } from "@/db";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";
import {
  completionNoteSchema,
  makeTaskFormSchema,
  subtaskTitleSchema,
  taskIdSchema,
  toTaskFieldErrors,
  type TaskFieldErrors,
  type TaskFormInput,
  type TaskFormValues,
} from "@/lib/validations/task";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: TaskFieldErrors };

const GENERIC_ERROR = "Something went wrong saving that. Please try again.";

/**
 * A task change ripples through the connected system: it can change derived goal
 * progress and the Today dashboard's aggregates. Refresh all three surfaces.
 */
function revalidateTaskSurfaces() {
  revalidatePath("/tasks");
  revalidatePath("/goals");
  revalidatePath("/today");
}

/** Ensure any referenced goal / life area belong to the caller (CLAUDE.md section 5). */
async function validateReferences(
  userId: string,
  values: TaskFormValues,
): Promise<TaskFieldErrors> {
  const fieldErrors: TaskFieldErrors = {};
  if (values.goalId) {
    const goal = await goalsRepo.getGoal(userId, values.goalId);
    if (!goal) fieldErrors.goalId = "Choose one of your goals.";
  }
  if (values.lifeAreaId) {
    const area = await lifeAreasRepo.getLifeArea(userId, values.lifeAreaId);
    if (!area) fieldErrors.lifeAreaId = "Choose one of your life areas.";
  }
  return fieldErrors;
}

export async function createTaskAction(input: TaskFormInput): Promise<ActionResult<Task>> {
  const user = await requireUser();

  // Due-at wall-clock input is interpreted in the user's saved timezone.
  const { timeZone } = await getUserDatePrefs(user.id);
  const parsed = makeTaskFormSchema(timeZone).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: toTaskFieldErrors(parsed.error),
    };
  }

  const referenceErrors = await validateReferences(user.id, parsed.data);
  if (Object.keys(referenceErrors).length > 0) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: referenceErrors };
  }

  try {
    const task = await tasksRepo.createTask(user.id, parsed.data);
    revalidateTaskSurfaces();
    return { ok: true, data: task };
  } catch (error) {
    console.error("createTaskAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updateTaskAction(
  id: string,
  input: TaskFormInput,
): Promise<ActionResult<Task>> {
  const user = await requireUser();

  const idResult = taskIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That task could not be found." };

  const { timeZone } = await getUserDatePrefs(user.id);
  const parsed = makeTaskFormSchema(timeZone).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: toTaskFieldErrors(parsed.error),
    };
  }

  const existing = await tasksRepo.getTask(user.id, idResult.data);
  if (!existing) return { ok: false, error: "That task could not be found." };

  const referenceErrors = await validateReferences(user.id, parsed.data);
  if (Object.keys(referenceErrors).length > 0) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: referenceErrors };
  }

  const becameCompleted = parsed.data.status === "completed" && existing.status !== "completed";
  const leftCompleted = parsed.data.status !== "completed" && existing.status === "completed";

  try {
    const task = await tasksRepo.updateTask(user.id, idResult.data, {
      ...parsed.data,
      ...(becameCompleted ? { completedAt: new Date() } : {}),
      ...(leftCompleted ? { completedAt: null } : {}),
    });
    if (!task) return { ok: false, error: "That task could not be found." };
    revalidateTaskSurfaces();
    return { ok: true, data: task };
  } catch (error) {
    console.error("updateTaskAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Mark a task complete, optionally capturing completion feedback in one step. */
export async function completeTaskAction(
  id: string,
  note?: string,
): Promise<ActionResult<Task>> {
  const user = await requireUser();

  const idResult = taskIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That task could not be found." };

  const noteResult = completionNoteSchema.safeParse(note);
  if (!noteResult.success) {
    return { ok: false, error: noteResult.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  try {
    const task = await tasksRepo.completeTask(user.id, idResult.data, {
      completionNote: noteResult.data,
    });
    if (!task) return { ok: false, error: "That task could not be found." };
    revalidateTaskSurfaces();
    return { ok: true, data: task };
  } catch (error) {
    console.error("completeTaskAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function reopenTaskAction(id: string): Promise<ActionResult<Task>> {
  const user = await requireUser();
  const idResult = taskIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That task could not be found." };

  try {
    const task = await tasksRepo.reopenTask(user.id, idResult.data);
    if (!task) return { ok: false, error: "That task could not be found." };
    revalidateTaskSurfaces();
    return { ok: true, data: task };
  } catch (error) {
    console.error("reopenTaskAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function cancelTaskAction(id: string): Promise<ActionResult<Task>> {
  const user = await requireUser();
  const idResult = taskIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That task could not be found." };

  try {
    const task = await tasksRepo.cancelTask(user.id, idResult.data);
    if (!task) return { ok: false, error: "That task could not be found." };
    revalidateTaskSurfaces();
    return { ok: true, data: task };
  } catch (error) {
    console.error("cancelTaskAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Add a checklist step to a task. The parent must belong to the caller, and a
 * step may not itself be a parent: one level keeps the checkbox meaning
 * "this step is done" rather than opening an unbounded tree.
 */
export async function createSubtaskAction(
  parentTaskId: string,
  title: string,
): Promise<ActionResult<Task>> {
  const user = await requireUser();

  const idResult = taskIdSchema.safeParse(parentTaskId);
  if (!idResult.success) return { ok: false, error: "That task could not be found." };

  const titleResult = subtaskTitleSchema.safeParse(title);
  if (!titleResult.success) {
    return { ok: false, error: titleResult.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const parent = await tasksRepo.getTask(user.id, idResult.data);
  if (!parent) return { ok: false, error: "That task could not be found." };
  if (parent.parentTaskId) {
    return { ok: false, error: "A step cannot have steps of its own." };
  }

  try {
    const subtask = await tasksRepo.createSubtask(user.id, idResult.data, titleResult.data);
    revalidateTaskSurfaces();
    return { ok: true, data: subtask };
  } catch (error) {
    console.error("createSubtaskAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Add or edit persistent completion feedback (the "after completion" path). */
export async function saveCompletionNoteAction(
  id: string,
  note?: string,
): Promise<ActionResult<Task>> {
  const user = await requireUser();
  const idResult = taskIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That task could not be found." };

  const noteResult = completionNoteSchema.safeParse(note);
  if (!noteResult.success) {
    return { ok: false, error: noteResult.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  try {
    const task = await tasksRepo.setCompletionNote(user.id, idResult.data, noteResult.data);
    if (!task) return { ok: false, error: "That task could not be found." };
    revalidatePath("/tasks");
    return { ok: true, data: task };
  } catch (error) {
    console.error("saveCompletionNoteAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function deleteTaskAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = taskIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That task could not be found." };

  try {
    const deleted = await tasksRepo.deleteTask(user.id, idResult.data);
    if (!deleted) return { ok: false, error: "That task could not be found." };
    revalidateTaskSurfaces();
    return { ok: true, data: { id: idResult.data } };
  } catch (error) {
    console.error("deleteTaskAction failed", error);
    return { ok: false, error: "Could not delete that task. Please try again." };
  }
}
