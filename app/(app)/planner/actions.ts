"use server";

import { revalidatePath } from "next/cache";

import { lifeAreasRepo, plannerRepo, tasksRepo } from "@/db";
import type { DayPlanAllocation, DayPlanItem } from "@/db";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";
import { STARTER_CATEGORIES } from "@/lib/planner";
import {
  acceptItemSchema,
  plannerIdSchema,
  savePlanSchema,
  toPlannerFieldErrors,
  type AcceptItemInput,
  type PlannerFieldErrors,
  type SavePlanInput,
} from "@/lib/validations/planner";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: PlannerFieldErrors };

const GENERIC_ERROR = "Something went wrong saving that. Please try again.";

/**
 * A plan change moves the planner and, once confirmed, Today and To-dos.
 * Confirming writes `scheduled_for` on real task rows, so those surfaces are
 * refreshed by the same call rather than by a second one nobody remembers.
 */
function revalidatePlannerSurfaces() {
  revalidatePath("/planner");
  revalidatePath("/today");
  revalidatePath("/tasks");
}

/**
 * Save the day's categories.
 *
 * The only place allocation rows are written. Life-area categories are checked
 * against the caller's OWN life areas: a `lifeAreaId` arriving in a form is
 * user input, and without this check a forged one would let a plan display
 * another account's area name (CLAUDE.md section 5).
 */
export async function savePlanAction(
  input: SavePlanInput,
): Promise<ActionResult<{ allocations: DayPlanAllocation[] }>> {
  const user = await requireUser();

  const parsed = savePlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: toPlannerFieldErrors(parsed.error),
    };
  }

  const areaIds = parsed.data.allocations
    .map((a) => a.lifeAreaId)
    .filter((id): id is string => Boolean(id));
  if (areaIds.length > 0) {
    const owned = await lifeAreasRepo.listLifeAreas(user.id, { includeArchived: true });
    const ownedIds = new Set(owned.map((area) => area.id));
    if (areaIds.some((id) => !ownedIds.has(id))) {
      return { ok: false, error: "One of those categories is not one of your life areas." };
    }
  }

  /*
   * Two categories cannot share a name in one day.
   *
   * The database enforces it too, but a unique-violation surfaces as a generic
   * failure with no idea which row caused it. Catching it here means the user
   * is told what is actually wrong.
   */
  const seen = new Set<string>();
  for (const allocation of parsed.data.allocations) {
    const key = allocation.label.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `You have two categories called "${allocation.label}".` };
    }
    seen.add(key);
  }

  /*
   * One life area backs at most one category in a day.
   *
   * Enforced by `day_plan_allocations_life_area_uq`, and the right rule: two
   * categories drawing on the same area would suggest the same work twice and
   * double-count the day. Caught here as well as in the database so the user is
   * told WHICH area collided; the constraint alone surfaces as a generic
   * failure, which is exactly how this reached browser QA.
   */
  const seenAreas = new Set<string>();
  for (const allocation of parsed.data.allocations) {
    if (!allocation.lifeAreaId) continue;
    if (seenAreas.has(allocation.lifeAreaId)) {
      return {
        ok: false,
        error: `Another category is already linked to that life area today.`,
      };
    }
    seenAreas.add(allocation.lifeAreaId);
  }

  try {
    const plan = await plannerRepo.getOrCreatePlan(user.id, parsed.data.planDate);
    const allocations = await plannerRepo.syncAllocations(
      user.id,
      plan.id,
      parsed.data.allocations,
    );
    revalidatePlannerSurfaces();
    return { ok: true, data: { allocations } };
  } catch (error) {
    console.error("savePlanAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Give a brand-new day a shape to react to.
 *
 * Reuses yesterday's categories when there are any, because most days are alike
 * and retyping them every morning is a tax on using the feature. Falls back to
 * a recognisable 24 hours, so the first thing anybody sees is a full day they
 * can adjust rather than an empty form and a question they have never been
 * asked. Nothing here touches a to-do.
 */
export async function seedPlanAction(
  planDate: string,
): Promise<ActionResult<{ allocations: DayPlanAllocation[] }>> {
  const user = await requireUser();

  const dateResult = savePlanSchema.shape.planDate.safeParse(planDate);
  if (!dateResult.success) return { ok: false, error: "Pick a valid date." };

  try {
    const plan = await plannerRepo.getOrCreatePlan(user.id, dateResult.data);
    const existing = await plannerRepo.getPlanContents(user.id, dateResult.data);
    if (existing && existing.allocations.length > 0) {
      return { ok: true, data: { allocations: existing.allocations } };
    }

    const previous = await plannerRepo.findPreviousAllocations(user.id, dateResult.data);
    const source =
      previous.length > 0
        ? previous.map((row) => ({
            kind: row.kind,
            lifeAreaId: row.lifeAreaId,
            label: row.label,
            minutes: row.minutes,
          }))
        : STARTER_CATEGORIES.map((entry) => ({
            kind: "planner" as const,
            lifeAreaId: null,
            label: entry.label,
            minutes: entry.minutes,
          }));

    const allocations = await plannerRepo.syncAllocations(user.id, plan.id, source);
    revalidatePlannerSurfaces();
    return { ok: true, data: { allocations } };
  } catch (error) {
    console.error("seedPlanAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Accept one suggested to-do into a category.
 *
 * The approval step, and the only way a suggestion becomes part of a plan.
 * Nothing GoHa recommends is written until this is called, and calling it is
 * always something the user did.
 *
 * This does NOT schedule the to-do. Putting work in the plan and committing the
 * plan to Today are separate decisions: someone building tomorrow's plan on a
 * Sunday evening has not said "do this now".
 */
export async function acceptSuggestionAction(
  input: AcceptItemInput,
): Promise<ActionResult<DayPlanItem>> {
  const user = await requireUser();

  const parsed = acceptItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "That could not be added to your plan.",
      fieldErrors: toPlannerFieldErrors(parsed.error),
    };
  }

  const [allocation, task] = await Promise.all([
    plannerRepo.getAllocation(user.id, parsed.data.allocationId),
    tasksRepo.getTask(user.id, parsed.data.taskId),
  ]);
  if (!allocation) return { ok: false, error: "That category could not be found." };
  if (!task) return { ok: false, error: "That to-do could not be found." };
  if (task.status === "completed" || task.status === "cancelled") {
    return { ok: false, error: "That to-do is already finished." };
  }

  try {
    const item = await plannerRepo.addItem(user.id, {
      dayPlanId: allocation.dayPlanId,
      allocationId: allocation.id,
      taskId: task.id,
      plannedMinutes: parsed.data.plannedMinutes,
    });

    /*
     * Remember the estimate on the TO-DO, but only when it had none.
     *
     * The user has just told GoHa how long this takes, and throwing that away
     * would mean asking again tomorrow. An existing estimate is left alone:
     * "two hours of it today" is not a claim that the whole job is two hours,
     * and silently rewriting their earlier answer is the kind of edit
     * CLAUDE.md section 10 says must never happen without being asked for.
     */
    if (task.estimateMinutes == null) {
      await tasksRepo.updateTask(user.id, task.id, {
        estimateMinutes: parsed.data.plannedMinutes,
      });
    }

    revalidatePlannerSurfaces();
    return { ok: true, data: item };
  } catch (error) {
    console.error("acceptSuggestionAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updatePlannedMinutesAction(
  id: string,
  plannedMinutes: number,
): Promise<ActionResult<DayPlanItem>> {
  const user = await requireUser();

  const idResult = plannerIdSchema.safeParse(id);
  const minutesResult = acceptItemSchema.shape.plannedMinutes.safeParse(plannedMinutes);
  if (!idResult.success) return { ok: false, error: "That item could not be found." };
  if (!minutesResult.success) {
    return { ok: false, error: minutesResult.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  try {
    const item = await plannerRepo.updateItemMinutes(user.id, idResult.data, minutesResult.data);
    if (!item) return { ok: false, error: "That item could not be found." };
    revalidatePlannerSurfaces();
    return { ok: true, data: item };
  } catch (error) {
    console.error("updatePlannedMinutesAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Take a to-do back out of the plan. The to-do itself is untouched. */
export async function removePlanItemAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const idResult = plannerIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That item could not be found." };

  try {
    const removed = await plannerRepo.removeItem(user.id, idResult.data);
    if (!removed) return { ok: false, error: "That item could not be found." };
    revalidatePlannerSurfaces();
    return { ok: true, data: { id: idResult.data } };
  } catch (error) {
    console.error("removePlanItemAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Commit the plan: put its to-dos on the day.
 *
 * The one place the planner writes to `tasks`, and it writes exactly one field.
 * `scheduled_for` is what every Today and bucket rule in the app already reads
 * (`lib/task-buckets.ts`), so a committed plan appears on Today through the
 * SAME derivation as anything else. There is no planner-shaped copy of a to-do
 * anywhere, which is what keeps the two surfaces from disagreeing (CLAUDE.md
 * section 7).
 *
 * Nothing else about a to-do is touched: not its status, not its goal, not its
 * priority, not its due date. Moving work onto a day is not a licence to edit it.
 */
export async function addPlanToTodayAction(
  planDate: string,
): Promise<ActionResult<{ scheduled: number; alreadyThere: number }>> {
  const user = await requireUser();

  const dateResult = savePlanSchema.shape.planDate.safeParse(planDate);
  if (!dateResult.success) return { ok: false, error: "Pick a valid date." };

  const { timeZone } = await getUserDatePrefs(user.id);
  void timeZone; // The date is already a local calendar date chosen by the user.

  try {
    const contents = await plannerRepo.getPlanContents(user.id, dateResult.data);
    if (!contents || contents.items.length === 0) {
      return { ok: false, error: "There is nothing in this plan yet." };
    }

    const tasks = await tasksRepo.listTasksForUser(user.id);
    const byId = new Map(tasks.map((task) => [task.id, task]));

    let scheduled = 0;
    let alreadyThere = 0;
    for (const item of contents.items) {
      const task = byId.get(item.taskId);
      // Skip anything finished or gone since the plan was built. Silently, on
      // purpose: it is not an error that a to-do was completed early.
      if (!task || task.status === "completed" || task.status === "cancelled") continue;
      if (task.scheduledFor === dateResult.data) {
        alreadyThere += 1;
        continue;
      }
      await tasksRepo.updateTask(user.id, task.id, { scheduledFor: dateResult.data });
      scheduled += 1;
    }

    revalidatePlannerSurfaces();
    return { ok: true, data: { scheduled, alreadyThere } };
  } catch (error) {
    console.error("addPlanToTodayAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
