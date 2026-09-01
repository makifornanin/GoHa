"use server";

import { revalidatePath } from "next/cache";

import { lifeAreasRepo, plannerRepo, tasksRepo } from "@/db";
import type { DayPlanAllocation, DayPlanItem } from "@/db";
import { requireUser } from "@/lib/session";
import { getUserDatePrefs } from "@/lib/user-settings";
import { zonedToday } from "@/lib/date";
import { STARTER_CATEGORIES } from "@/lib/planner";
import {
  acceptItemSchema,
  freeformItemSchema,
  logActualSchema,
  plannerIdSchema,
  saveDefaultsSchema,
  savePlanSchema,
  toPlannerFieldErrors,
  type AcceptItemInput,
  type FreeformItemInput,
  type LogActualInput,
  type PlannerFieldErrors,
  type SaveDefaultsInput,
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
 * Seeds from the user's saved default day when they have one, otherwise from
 * yesterday's categories, otherwise from a recognisable 24 hours. Whichever it
 * used, the result is an ORDINARY plan from that moment on: editing it changes
 * this date and nothing else, and the default is only ever rewritten by the
 * explicit action below. Nothing here touches a to-do.
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

    /*
     * Three sources, most deliberate first.
     *
     * The saved default day wins because it is the only one the user actually
     * chose: they pressed "Save as my default day" and said "this is my normal
     * shape". Yesterday is a good guess but only a guess, and the starter set
     * is a first draft for someone who has neither.
     */
    const defaults = await plannerRepo.listDefaultCategories(user.id);
    const previous =
      defaults.length > 0
        ? []
        : await plannerRepo.findPreviousAllocations(user.id, dateResult.data);

    const copy = (row: {
      kind: "life_area" | "planner";
      lifeAreaId: string | null;
      label: string;
      minutes: number;
      color: string | null;
      icon: string | null;
    }) => ({
      kind: row.kind,
      lifeAreaId: row.lifeAreaId,
      label: row.label,
      minutes: row.minutes,
      color: row.color,
      icon: row.icon,
    });

    const source =
      defaults.length > 0
        ? defaults.map(copy)
        : previous.length > 0
          ? previous.map(copy)
          : STARTER_CATEGORIES.map((entry) => ({
              kind: "planner" as const,
              lifeAreaId: null,
              label: entry.label,
              minutes: entry.minutes,
              color: null,
              icon: null,
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
    /*
     * Only LINKED entries can be committed: a freeform line has no to-do to
     * schedule. That is the honest behaviour rather than a limitation, since
     * silently creating to-dos out of the user's shorthand would put rows in
     * Tasks that they never asked for.
     */
    const linked = contents?.items.filter((item) => item.taskId !== null) ?? [];
    if (linked.length === 0) {
      return { ok: false, error: "There are no linked to-dos in this plan yet." };
    }

    const tasks = await tasksRepo.listTasksForUser(user.id);
    const byId = new Map(tasks.map((task) => [task.id, task]));

    let scheduled = 0;
    let alreadyThere = 0;
    for (const item of linked) {
      const task = item.taskId ? byId.get(item.taskId) : undefined;
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

/**
 * Add the user's own line of text to a category.
 *
 * The counterpart to accepting a suggestion, and the reason the planner stopped
 * needing a to-do for everything. "Client work", "Gym", "Admin" are real parts
 * of a day that were never going to be to-dos, and making the user create one
 * just to plan an hour was the tax that made the categories feel rigid.
 *
 * Nothing is written to `tasks`. A freeform entry lives and dies inside the day
 * it was typed into.
 */
export async function addFreeformItemAction(
  input: FreeformItemInput,
): Promise<ActionResult<{ item: DayPlanItem }>> {
  const user = await requireUser();

  const parsed = freeformItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check this entry.",
      fieldErrors: toPlannerFieldErrors(parsed.error),
    };
  }

  try {
    // The allocation must be the caller's own AND on the day being edited: an
    // id from a form is a claim, not permission (CLAUDE.md section 5).
    const allocation = await plannerRepo.getAllocation(user.id, parsed.data.allocationId);
    if (!allocation) return { ok: false, error: "That category could not be found." };

    const plan = await plannerRepo.getOrCreatePlan(user.id, parsed.data.planDate);
    if (allocation.dayPlanId !== plan.id) {
      return { ok: false, error: "That category belongs to a different day." };
    }

    const item = await plannerRepo.addFreeformItem(user.id, {
      dayPlanId: plan.id,
      allocationId: allocation.id,
      label: parsed.data.label,
      plannedMinutes: parsed.data.plannedMinutes,
    });
    revalidatePlannerSurfaces();
    return { ok: true, data: { item } };
  } catch (error) {
    console.error("addFreeformItemAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Rename a freeform entry. Linked entries are renamed on the to-do itself. */
export async function renameFreeformItemAction(
  id: string,
  label: string,
): Promise<ActionResult<{ item: DayPlanItem }>> {
  const user = await requireUser();

  const idResult = plannerIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That entry could not be found." };

  const labelResult = freeformItemSchema.shape.label.safeParse(label);
  if (!labelResult.success) {
    return { ok: false, error: labelResult.error.issues[0]?.message ?? "Check this entry." };
  }

  try {
    const item = await plannerRepo.renameFreeformItem(user.id, idResult.data, labelResult.data);
    // Null also covers "this row is a linked to-do", which the repository
    // refuses on purpose: its name belongs to the to-do, not to the plan.
    if (!item) return { ok: false, error: "That entry could not be renamed." };
    revalidatePlannerSurfaces();
    return { ok: true, data: { item } };
  } catch (error) {
    console.error("renameFreeformItemAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Move an entry from one category to another within the same day. */
export async function moveItemAction(
  id: string,
  allocationId: string,
): Promise<ActionResult<{ item: DayPlanItem }>> {
  const user = await requireUser();

  const idResult = plannerIdSchema.safeParse(id);
  const allocationResult = plannerIdSchema.safeParse(allocationId);
  if (!idResult.success || !allocationResult.success) {
    return { ok: false, error: "That entry could not be moved." };
  }

  try {
    const allocation = await plannerRepo.getAllocation(user.id, allocationResult.data);
    if (!allocation) return { ok: false, error: "That category could not be found." };

    const item = await plannerRepo.moveItem(user.id, idResult.data, allocation.id);
    if (!item) return { ok: false, error: "That entry could not be moved." };
    if (item.dayPlanId !== allocation.dayPlanId) {
      // Cannot happen through the UI, and would silently move an entry into
      // another day's category if it did.
      return { ok: false, error: "That category belongs to a different day." };
    }
    revalidatePlannerSurfaces();
    return { ok: true, data: { item } };
  } catch (error) {
    console.error("moveItemAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Save these categories as the reusable default day.
 *
 * The ONLY writer of `planner_default_categories`, and the reason editing a
 * date is safe: nothing else in the planner can reach this table, so a change
 * to Tuesday cannot leak into what every future day starts from. The user asks
 * for it explicitly or it does not happen.
 *
 * Categories only. Entries are decisions about one particular day and are never
 * part of a template.
 */
export async function saveAsDefaultsAction(
  input: SaveDefaultsInput,
): Promise<ActionResult<{ count: number }>> {
  const user = await requireUser();

  const parsed = saveDefaultsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check these categories.",
      fieldErrors: toPlannerFieldErrors(parsed.error),
    };
  }

  try {
    // Same ownership check the day's own save performs: a life-area id in a
    // form is user input either way.
    const areas = await lifeAreasRepo.listLifeAreas(user.id);
    const ownArea = new Set(areas.map((area) => area.id));
    for (const category of parsed.data.categories) {
      if (category.kind === "life_area" && (!category.lifeAreaId || !ownArea.has(category.lifeAreaId))) {
        return { ok: false, error: "That is not one of your life areas." };
      }
    }

    const saved = await plannerRepo.replaceDefaultCategories(user.id, parsed.data.categories);
    revalidatePath("/planner");
    return { ok: true, data: { count: saved.length } };
  } catch (error) {
    console.error("saveAsDefaultsAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Record how long a freeform activity actually took.
 *
 * The manual half of tracking. Linked to-dos have no equivalent action on
 * purpose: their actual comes from focus sessions, and offering a second way to
 * state it would let the two disagree.
 *
 * Refuses a FUTURE local date. Tomorrow can be planned in full, but it has not
 * happened, and a plan that already claims time was spent on it is not a plan.
 * The date is resolved from the row rather than taken from the caller, so this
 * cannot be talked out of by a forged parameter.
 */
export async function logActualMinutesAction(
  input: LogActualInput,
): Promise<ActionResult<{ item: DayPlanItem }>> {
  const user = await requireUser();

  const parsed = logActualSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check that duration.",
      fieldErrors: toPlannerFieldErrors(parsed.error),
    };
  }

  try {
    const item = await plannerRepo.getItem(user.id, parsed.data.itemId);
    if (!item) return { ok: false, error: "That entry could not be found." };
    if (item.taskId !== null) {
      return {
        ok: false,
        error: "This to-do is tracked by Focus. Start a focus session to record time on it.",
      };
    }

    const plan = await plannerRepo.getPlanById(user.id, item.dayPlanId);
    if (!plan) return { ok: false, error: "That entry could not be found." };

    const { timeZone } = await getUserDatePrefs(user.id);
    const today = zonedToday(new Date(), timeZone);
    if (plan.planDate > today) {
      return { ok: false, error: "That day has not started yet." };
    }

    const saved = await plannerRepo.setItemActualMinutes(
      user.id,
      item.id,
      parsed.data.actualMinutes,
    );
    if (!saved) return { ok: false, error: "That entry could not be updated." };
    revalidatePlannerSurfaces();
    return { ok: true, data: { item: saved } };
  } catch (error) {
    console.error("logActualMinutesAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
