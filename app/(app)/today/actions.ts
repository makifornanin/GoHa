"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dailyPrioritiesRepo, goalsRepo, tasksRepo, type DailyPriority } from "@/db";
import { zonedToday } from "@/lib/date";
import { CONSTRAINTS, isUniqueViolation } from "@/lib/db-errors";
import { requireUser } from "@/lib/session";
import { scoreTasks } from "@/lib/today-brain";
import { getUserDatePrefs } from "@/lib/user-settings";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const idSchema = z.uuid();
const MAX_PRIORITIES = 3;

/**
 * Pin an existing task as one of today's Top 3 priorities. The priority row only
 * references the task (`taskId`); it never copies the task's data, so the Top 3
 * always reflects the canonical task (CLAUDE.md section 7).
 */
export async function addDailyPriorityAction(taskId: string): Promise<ActionResult<DailyPriority>> {
  const user = await requireUser();

  const idResult = idSchema.safeParse(taskId);
  if (!idResult.success) return { ok: false, error: "That task could not be found." };

  // Ownership: the task must belong to the caller.
  const task = await tasksRepo.getTask(user.id, idResult.data);
  if (!task) return { ok: false, error: "That task could not be found." };

  const { timeZone } = await getUserDatePrefs(user.id);
  const today = zonedToday(new Date(), timeZone);
  const existing = await dailyPrioritiesRepo.listDailyPriorities(user.id, today);

  if (existing.some((p) => p.taskId === task.id)) {
    return { ok: false, error: "That task is already one of today's priorities." };
  }

  const used = new Set(existing.map((p) => p.position));
  const position = [1, 2, 3].find((slot) => !used.has(slot));
  if (position === undefined) {
    return { ok: false, error: `You can pin at most ${MAX_PRIORITIES} priorities for today.` };
  }

  try {
    const priority = await dailyPrioritiesRepo.setDailyPriority(user.id, today, position, {
      taskId: task.id,
    });
    revalidatePath("/today");
    return { ok: true, data: priority };
  } catch (error) {
    // The count-then-insert above can be passed twice at once. The database
    // settles it (audit R-08); say which rule stopped it, in the same words the
    // check above would have used.
    if (isUniqueViolation(error, CONSTRAINTS.onePriorityPerTaskPerDay)) {
      return { ok: false, error: "That task is already one of today's priorities." };
    }
    if (isUniqueViolation(error, CONSTRAINTS.onePriorityPerSlot)) {
      return { ok: false, error: `You can pin at most ${MAX_PRIORITIES} priorities for today.` };
    }
    console.error("addDailyPriorityAction failed", error);
    return { ok: false, error: "Could not pin that priority. Please try again." };
  }
}

/**
 * Fill today's empty Top 3 slots with the highest-ranked open work.
 *
 * Only ever ADDS: existing pins are the user's own stated intent and are never
 * reordered or dropped. Ranking is the shared `scoreTasks` engine, so the picks
 * match exactly what Today already told the user it would choose.
 */
export async function planMyDayAction(): Promise<
  ActionResult<{ pinned: { id: string; title: string; reason: string }[]; slotsLeft: number }>
> {
  const user = await requireUser();
  const { timeZone } = await getUserDatePrefs(user.id);
  const today = zonedToday(new Date(), timeZone);

  try {
    const [tasks, goals, existing] = await Promise.all([
      tasksRepo.listTasksForUser(user.id),
      goalsRepo.listGoalsWithTaskCounts(user.id),
      dailyPrioritiesRepo.listDailyPriorities(user.id, today),
    ]);

    const used = new Set(existing.map((p) => p.position));
    const free = [1, 2, 3].filter((slot) => !used.has(slot));
    if (free.length === 0) {
      return { ok: false, error: "Today's three priorities are already set." };
    }

    const alreadyPinned = new Set(
      existing.map((p) => p.taskId).filter((id): id is string => Boolean(id)),
    );
    const ranked = scoreTasks({
      tasks,
      today,
      timeZone,
      goalById: new Map(goals.map((g) => [g.id, g])),
      excludeIds: alreadyPinned,
    }).slice(0, free.length);

    if (ranked.length === 0) {
      return { ok: false, error: "There is no open work to pin yet." };
    }

    const pinned: { id: string; title: string; reason: string }[] = [];
    for (const [index, candidate] of ranked.entries()) {
      try {
        await dailyPrioritiesRepo.setDailyPriority(user.id, today, free[index], {
          taskId: candidate.task.id,
        });
      } catch (error) {
        // A slot taken, or that task pinned, while this was choosing. Skip it
        // and keep planning: losing one pick must not cost the whole plan.
        if (isUniqueViolation(error)) continue;
        throw error;
      }
      pinned.push({
        id: candidate.task.id,
        title: candidate.task.title,
        reason: candidate.reason,
      });
    }

    if (pinned.length === 0) {
      return { ok: false, error: "Today's priorities just changed. Please try again." };
    }

    revalidatePath("/today");
    return { ok: true, data: { pinned, slotsLeft: free.length - pinned.length } };
  } catch (error) {
    console.error("planMyDayAction failed", error);
    return { ok: false, error: "Could not plan your day. Please try again." };
  }
}

/** Unpin a priority for today. Deletes only the priority row, never the task. */
export async function removeDailyPriorityAction(
  priorityId: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const idResult = idSchema.safeParse(priorityId);
  if (!idResult.success) return { ok: false, error: "That priority could not be found." };

  try {
    const removed = await dailyPrioritiesRepo.clearDailyPriority(user.id, idResult.data);
    if (!removed) return { ok: false, error: "That priority could not be found." };
    revalidatePath("/today");
    return { ok: true, data: { id: idResult.data } };
  } catch (error) {
    console.error("removeDailyPriorityAction failed", error);
    return { ok: false, error: "Could not remove that priority. Please try again." };
  }
}
