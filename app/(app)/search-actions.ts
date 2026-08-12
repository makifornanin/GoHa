"use server";

import { goalsRepo, lifeAreasRepo, tasksRepo } from "@/db";
import { requireUser } from "@/lib/session";

/**
 * A compact index for the command palette.
 *
 * Loaded ONCE, when the palette is first opened, rather than on every page
 * render: the palette is the only thing that needs it, and paying for it on
 * every navigation would slow down screens that never show it. Only id, title
 * and kind cross the wire, so it stays small enough to filter on the client.
 *
 * User-scoped through the repositories like every other read (CLAUDE.md
 * section 5); nothing here accepts an id from the caller.
 */
export type CommandTarget = {
  id: string;
  title: string;
  kind: "task" | "goal" | "life-area";
  /** Extra line shown under the title, e.g. a task's status. */
  hint?: string;
};

export async function loadCommandIndexAction(): Promise<CommandTarget[]> {
  const user = await requireUser();

  const [tasks, goals, lifeAreas] = await Promise.all([
    tasksRepo.listTasksForUser(user.id),
    goalsRepo.listGoals(user.id),
    lifeAreasRepo.listLifeAreas(user.id),
  ]);

  return [
    // Open work first: it is what someone reaching for a palette usually wants.
    ...tasks
      .filter((t) => t.status === "todo" || t.status === "in_progress")
      .map((t): CommandTarget => ({ id: t.id, title: t.title, kind: "task" })),
    ...goals.map((g): CommandTarget => ({ id: g.id, title: g.title, kind: "goal" })),
    ...lifeAreas.map((a): CommandTarget => ({ id: a.id, title: a.name, kind: "life-area" })),
  ];
}
