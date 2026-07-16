"use server";

import { revalidatePath } from "next/cache";

import { goalsRepo, lifeAreasRepo, type Goal } from "@/db";
import { requireUser } from "@/lib/session";
import {
  goalFormSchema,
  goalIdSchema,
  toGoalFieldErrors,
  type GoalFieldErrors,
  type GoalFormInput,
  type GoalFormValues,
} from "@/lib/validations/goal";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: GoalFieldErrors };

const GENERIC_ERROR = "Something went wrong saving that. Please try again.";

/**
 * Verify that any referenced life area / parent goal belong to the caller
 * (CLAUDE.md section 5: ownership everywhere, including the parent goal). For a
 * parent, also reject self-reference and any assignment that would form a cycle.
 * `goalId` is the goal being edited (undefined when creating).
 */
async function validateReferences(
  userId: string,
  values: GoalFormValues,
  goalId?: string,
): Promise<GoalFieldErrors> {
  const fieldErrors: GoalFieldErrors = {};

  if (values.lifeAreaId) {
    const area = await lifeAreasRepo.getLifeArea(userId, values.lifeAreaId);
    if (!area) fieldErrors.lifeAreaId = "Choose one of your life areas.";
  }

  if (values.parentGoalId) {
    if (goalId && values.parentGoalId === goalId) {
      fieldErrors.parentGoalId = "A goal cannot be its own parent.";
    } else {
      const parent = await goalsRepo.getGoal(userId, values.parentGoalId);
      if (!parent) {
        fieldErrors.parentGoalId = "Choose one of your goals.";
      } else if (goalId) {
        // Would assigning this parent create a cycle? It does if the goal being
        // edited is itself an ancestor of the proposed parent.
        const parentAncestors = await goalsRepo.collectAncestorIds(userId, values.parentGoalId);
        if (parentAncestors.has(goalId)) {
          fieldErrors.parentGoalId = "That would create a loop in your goal hierarchy.";
        }
      }
    }
  }

  return fieldErrors;
}

export async function createGoalAction(input: GoalFormInput): Promise<ActionResult<Goal>> {
  const user = await requireUser();

  const parsed = goalFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: toGoalFieldErrors(parsed.error),
    };
  }

  const referenceErrors = await validateReferences(user.id, parsed.data);
  if (Object.keys(referenceErrors).length > 0) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: referenceErrors };
  }

  try {
    const goal = await goalsRepo.createGoal(user.id, parsed.data);
    revalidatePath("/goals");
    return { ok: true, data: goal };
  } catch (error) {
    console.error("createGoalAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updateGoalAction(
  id: string,
  input: GoalFormInput,
): Promise<ActionResult<Goal>> {
  const user = await requireUser();

  const idResult = goalIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That goal could not be found." };

  const parsed = goalFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: toGoalFieldErrors(parsed.error),
    };
  }

  const existing = await goalsRepo.getGoal(user.id, idResult.data);
  if (!existing) return { ok: false, error: "That goal could not be found." };

  const referenceErrors = await validateReferences(user.id, parsed.data, idResult.data);
  if (Object.keys(referenceErrors).length > 0) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: referenceErrors };
  }

  const becameCompleted = parsed.data.status === "completed" && existing.status !== "completed";
  const leftCompleted = parsed.data.status !== "completed" && existing.status === "completed";
  const manualChanged =
    parsed.data.progressMode === "manual" && parsed.data.manualProgress !== existing.manualProgress;

  try {
    const goal = await goalsRepo.updateGoal(user.id, idResult.data, {
      ...parsed.data,
      ...(becameCompleted ? { completedAt: new Date() } : {}),
      ...(leftCompleted ? { completedAt: null } : {}),
    });
    if (!goal) return { ok: false, error: "That goal could not be found." };

    // Journal only intentional progress changes, never on every render.
    if (becameCompleted) {
      await goalsRepo.addGoalProgressUpdate(user.id, goal.id, 100, "Marked completed");
    } else if (manualChanged) {
      await goalsRepo.addGoalProgressUpdate(
        user.id,
        goal.id,
        parsed.data.manualProgress,
        "Manual progress update",
      );
    }

    revalidatePath("/goals");
    return { ok: true, data: goal };
  } catch (error) {
    console.error("updateGoalAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function archiveGoalAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const idResult = goalIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That goal could not be found." };

  try {
    const goal = await goalsRepo.archiveGoal(user.id, idResult.data);
    if (!goal) return { ok: false, error: "That goal could not be found." };
    revalidatePath("/goals");
    return { ok: true, data: { id: goal.id } };
  } catch (error) {
    console.error("archiveGoalAction failed", error);
    return { ok: false, error: "Could not archive that goal. Please try again." };
  }
}
