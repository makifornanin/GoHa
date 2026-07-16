"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dailyPrioritiesRepo, tasksRepo, type DailyPriority } from "@/db";
import { zonedToday } from "@/lib/date";
import { requireUser } from "@/lib/session";
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
    console.error("addDailyPriorityAction failed", error);
    return { ok: false, error: "Could not pin that priority. Please try again." };
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
