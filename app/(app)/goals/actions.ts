"use server";

import { revalidatePath } from "next/cache";

import { goalsRepo, lifeAreasRepo, type Goal } from "@/db";
import { descendantIds, PARENT_REJECTION_MESSAGE } from "@/lib/goal-tree";
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
 * A goal change is felt beyond /goals.
 *
 * `/goals/[goalId]` is a dynamic segment, so revalidating the list path alone
 * left every detail page showing the values it was rendered with, and Today
 * reads active goals and their progress. The route LITERAL (brackets and all)
 * is passed rather than a resolved id, which is how Next is told to invalidate
 * every page of that segment: one edit moves the goal's own page and its
 * parent's, whose rolled-up progress just changed too.
 */
function revalidateGoalSurfaces() {
  revalidatePath("/goals");
  revalidatePath("/goals/[goalId]", "page");
  revalidatePath("/today");
}

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
      fieldErrors.parentGoalId = PARENT_REJECTION_MESSAGE.self;
    } else {
      const parent = await goalsRepo.getGoal(userId, values.parentGoalId);
      if (!parent) {
        fieldErrors.parentGoalId = "Choose one of your goals.";
      } else if (parent.parentGoalId) {
        /*
         * Two levels, and the server is where that is enforced.
         *
         * The form only ever offers eligible parents, but the form is not the
         * boundary: this action is reachable directly, and a third level would
         * put work at a depth no breadcrumb, rollup or planner in the app is
         * built to read. Rejecting here means the tree can never acquire one.
         */
        fieldErrors.parentGoalId = PARENT_REJECTION_MESSAGE.too_deep;
      } else if (goalId) {
        // Would assigning this parent create a cycle? It does if the goal being
        // edited is itself an ancestor of the proposed parent.
        const parentAncestors = await goalsRepo.collectAncestorIds(userId, values.parentGoalId);
        if (parentAncestors.has(goalId)) {
          fieldErrors.parentGoalId = PARENT_REJECTION_MESSAGE.cycle;
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
    revalidateGoalSurfaces();
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

    revalidateGoalSurfaces();
    return { ok: true, data: goal };
  } catch (error) {
    console.error("updateGoalAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Archive a goal and everything nested under it.
 *
 * The dialog promised this and the code did not deliver it: only the named row
 * was archived, so its subgoals stayed on the board pointing at a parent that
 * had vanished. The descendant set is resolved from the caller's OWN goals
 * (`listGoals` is user-scoped) and the repository update is scoped again, so
 * the id list can only ever name rows this account already owns.
 *
 * To-dos are untouched. `tasks.goal_id` is `set null` on delete and nothing
 * here deletes, so the work survives the ambition being shelved, which is the
 * whole point of archiving instead of deleting (CLAUDE.md section 7).
 */
export async function archiveGoalAction(
  id: string,
): Promise<ActionResult<{ id: string; archivedCount: number }>> {
  const user = await requireUser();

  const idResult = goalIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That goal could not be found." };

  try {
    const goal = await goalsRepo.getGoal(user.id, idResult.data);
    if (!goal) return { ok: false, error: "That goal could not be found." };

    const all = await goalsRepo.listGoals(user.id);
    const ids = [goal.id, ...descendantIds(all, goal.id)];
    const archived = await goalsRepo.archiveGoals(user.id, ids);

    revalidateGoalSurfaces();
    return { ok: true, data: { id: goal.id, archivedCount: archived.length } };
  } catch (error) {
    console.error("archiveGoalAction failed", error);
    return { ok: false, error: "Could not archive that goal. Please try again." };
  }
}
