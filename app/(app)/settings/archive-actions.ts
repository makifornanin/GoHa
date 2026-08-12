"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { goalsRepo, habitsRepo, lifeAreasRepo, taskMapsRepo } from "@/db";
import { requireUser } from "@/lib/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * The archive, and the way back out of it.
 *
 * Archiving is supposed to be reversible (CLAUDE.md section 7 prefers archive
 * over hard delete), but nothing outside Task Maps ever offered a restore: a
 * mis-archived life area, goal or habit vanished from every screen with no way
 * to bring it back. These are the missing halves.
 */
export type ArchivedKind = "life-area" | "goal" | "habit" | "task-map";

export type ArchivedItem = {
  id: string;
  kind: ArchivedKind;
  name: string;
  archivedAt: string | null;
};

const idSchema = z.uuid("That item could not be found.");
const kindSchema = z.enum(["life-area", "goal", "habit", "task-map"]);

/** Everything the user has archived, newest first. */
export async function listArchivedAction(): Promise<ArchivedItem[]> {
  const user = await requireUser();

  const [areas, goals, habits, maps] = await Promise.all([
    lifeAreasRepo.listLifeAreas(user.id, { includeArchived: true }),
    goalsRepo.listGoals(user.id, { includeArchived: true }),
    habitsRepo.listHabits(user.id, { includeArchived: true }),
    taskMapsRepo.listTaskMaps(user.id, { includeArchived: true }),
  ]);

  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const items: ArchivedItem[] = [
    ...areas
      .filter((a) => a.isArchived)
      .map((a): ArchivedItem => ({ id: a.id, kind: "life-area", name: a.name, archivedAt: iso(a.archivedAt) })),
    ...goals
      .filter((g) => g.isArchived)
      .map((g): ArchivedItem => ({ id: g.id, kind: "goal", name: g.title, archivedAt: iso(g.archivedAt) })),
    ...habits
      .filter((h) => h.isArchived)
      .map((h): ArchivedItem => ({ id: h.id, kind: "habit", name: h.name, archivedAt: iso(h.archivedAt) })),
    ...maps
      .filter((m) => m.isArchived)
      .map((m): ArchivedItem => ({ id: m.id, kind: "task-map", name: m.name, archivedAt: iso(m.archivedAt) })),
  ];

  return items.sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
}

/**
 * Restore one archived item. Ownership is enforced by the repositories, which
 * scope every update to the session user (CLAUDE.md section 5).
 */
export async function restoreArchivedAction(
  kind: string,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const kindResult = kindSchema.safeParse(kind);
  const idResult = idSchema.safeParse(id);
  if (!kindResult.success || !idResult.success) {
    return { ok: false, error: "That item could not be found." };
  }

  try {
    const restored = await (async () => {
      switch (kindResult.data) {
        case "life-area":
          return lifeAreasRepo.restoreLifeArea(user.id, idResult.data);
        case "goal":
          return goalsRepo.restoreGoal(user.id, idResult.data);
        case "habit":
          return habitsRepo.restoreHabit(user.id, idResult.data);
        case "task-map":
          return taskMapsRepo.restoreTaskMap(user.id, idResult.data);
      }
    })();

    if (!restored) return { ok: false, error: "That item could not be found." };

    // A restored entity reappears across the app, so refresh the surfaces that
    // read it rather than only the page the button was on.
    for (const path of ["/settings", "/life-areas", "/goals", "/habits", "/task-maps", "/today"]) {
      revalidatePath(path);
    }
    return { ok: true, data: { id: idResult.data } };
  } catch (error) {
    console.error("restoreArchivedAction failed", error);
    return { ok: false, error: "Could not restore that item. Please try again." };
  }
}
