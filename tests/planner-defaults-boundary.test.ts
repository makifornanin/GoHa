import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Source with comments removed: these assertions are about what the code does,
    and the comments here explain the very rules being checked. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The defaults/day boundary, which is the whole safety property of the hybrid
 * planner.
 *
 * A default day is a TEMPLATE. A plan is one date. Seeding copies in one
 * direction only, and the single most damaging bug this feature could have is a
 * day edit quietly rewriting the template every future morning starts from.
 *
 * Deliberately STATIC. What would catch this at runtime is a second account and
 * a database; what it actually looks like is "which repository function does
 * this action call", and that is visible in the source and runs on every commit.
 */
describe("editing a day never writes the default template", () => {
  const actions = stripComments(read("app/(app)/planner/actions.ts"));

  /** Every action that exists to change ONE date. */
  const DAY_ACTIONS = [
    "savePlanAction",
    "seedPlanAction",
    "acceptSuggestionAction",
    "updatePlannedMinutesAction",
    "removePlanItemAction",
    "addPlanToTodayAction",
    "addFreeformItemAction",
    "renameFreeformItemAction",
    "moveItemAction",
    "logActualMinutesAction",
  ];

  /** The body of one exported action, up to the next one. */
  function bodyOf(name: string): string {
    const start = actions.indexOf(`export async function ${name}`);
    expect(start, name).toBeGreaterThan(-1);
    const next = actions.indexOf("\nexport async function ", start + 1);
    return actions.slice(start, next === -1 ? undefined : next);
  }

  it("has exactly one writer of the default template", () => {
    const writers = [...actions.matchAll(/replaceDefaultCategories/g)];
    expect(writers).toHaveLength(1);
    expect(bodyOf("saveAsDefaultsAction")).toContain("replaceDefaultCategories");
  });

  it.each(DAY_ACTIONS)("%s cannot reach the default template", (name) => {
    expect(bodyOf(name)).not.toContain("replaceDefaultCategories");
  });

  it("only ever READS the template, when seeding a date", () => {
    // Seeding is the one direction that is allowed: template -> day.
    expect(bodyOf("seedPlanAction")).toContain("listDefaultCategories");
    expect(bodyOf("seedPlanAction")).not.toContain("replaceDefaultCategories");
  });

  it("seeds a day only when it has no categories yet", () => {
    // Otherwise re-opening a date would overwrite the plan the user made on it.
    const seed = bodyOf("seedPlanAction");
    expect(seed).toContain("existing.allocations.length > 0");
  });

  it("saves the template from categories alone, never from the day's entries", () => {
    // A template is the SHAPE of a day. Yesterday's to-dos are decisions about
    // yesterday and must not be carried into every future morning.
    const save = bodyOf("saveAsDefaultsAction");
    expect(save).not.toContain("dayPlanItems");
    expect(save).not.toContain("addItem");
    expect(save).not.toContain("plannedMinutes");
  });

  it("refuses to record actual time on a linked to-do", () => {
    // Focus Mode is the tracker for to-dos. A second way to state the same
    // number is how the two start disagreeing.
    const body = bodyOf("logActualMinutesAction");
    expect(body).toContain("item.taskId !== null");
    expect(body).toContain("tracked by Focus");
  });

  it("resolves the entry's date on the server, not from the caller", () => {
    /*
     * Tomorrow can be planned but has not happened. The date comes from the
     * row's own plan so a forged parameter cannot talk it into recording time
     * on a day that has not started.
     */
    const body = bodyOf("logActualMinutesAction");
    expect(body).toContain("plannerRepo.getPlanById(user.id, item.dayPlanId)");
    expect(body).toContain("zonedToday(new Date(), timeZone)");
    expect(body).toContain("plan.planDate > today");
    expect(body).not.toMatch(/planDate:\s*input\./);
  });

  it("checks life-area ownership before storing a template", () => {
    // A lifeAreaId in a form is user input here exactly as it is on a day.
    const save = bodyOf("saveAsDefaultsAction");
    expect(save).toContain("lifeAreasRepo.listLifeAreas(user.id)");
    expect(save).toContain("is not one of your life areas");
  });

  it("derives identity from the session in every planner action", () => {
    for (const name of [...DAY_ACTIONS, "saveAsDefaultsAction"]) {
      expect(bodyOf(name).slice(0, 400), name).toContain("await requireUser()");
    }
    expect(actions).not.toMatch(/userId\s*:\s*(string|input\.)/);
  });
});

/**
 * The repository half of the same boundary.
 *
 * `replaceDefaultCategories` deletes before it inserts, which is safe ONLY
 * because nothing hangs off a default category and because it is scoped to one
 * user. Both of those are asserted here rather than assumed.
 */
describe("the default-template repository is scoped and self-contained", () => {
  const repo = read("db/repositories/planner.ts");
  const code = stripComments(repo);

  it("scopes the replace to the caller's own rows", () => {
    const start = code.indexOf("export async function replaceDefaultCategories");
    const body = code.slice(start, code.indexOf("export async function", start + 1));
    expect(body).toContain("eq(plannerDefaultCategories.userId, userId)");
    // The delete and the insert must be atomic, or a failure between them
    // leaves the user with no default at all.
    expect(body).toContain("db.batch(");
  });

  it("never touches a plan, an allocation or an item", () => {
    const start = code.indexOf("export async function replaceDefaultCategories");
    const body = code.slice(start, code.indexOf("export async function", start + 1));
    for (const table of ["dayPlans", "dayPlanAllocations", "dayPlanItems"]) {
      expect(body, table).not.toContain(table);
    }
  });

  it("keeps every planner query behind server-only", () => {
    expect(repo.startsWith('import "server-only";')).toBe(true);
  });

  it("stores a manual actual only on a freeform row", () => {
    /*
     * The no-double-counting rule, at the seam. A linked to-do's actual is
     * derived from its focus sessions; storing one here as well would create a
     * second answer that drifts. The query is scoped to rows whose task is
     * null, and the database refuses the rest.
     */
    const start = code.indexOf("export async function setItemActualMinutes");
    const body = code.slice(start, code.indexOf("export async function", start + 1));
    expect(body).toContain("isNull(dayPlanItems.taskId)");
    expect(body).toContain("eq(dayPlanItems.userId, userId)");
  });

  it("attributes focus to a category only through a planned to-do", () => {
    /*
     * The actuals rule. The query groups completed sessions by task and stops
     * there; deciding which category a task belongs to happens in lib/planner.ts
     * against THIS day's entries. Nothing here may guess.
     */
    const start = code.indexOf("export async function focusActualsForDate");
    const body = code.slice(start);
    expect(body).toContain('eq(focusSessions.status, "completed")');
    expect(body).toContain("eq(focusSessions.sessionDate, sessionDate)");
    expect(body).toContain("groupBy(focusSessions.taskId)");
    expect(body).not.toContain("dayPlanAllocations");
  });
});

/**
 * The HTTP driver has no interactive transactions.
 *
 * GoHa connects through `drizzle-orm/neon-http`, where
 * `db.transaction(async tx => ...)` does not fall back to anything: it throws
 * "No transactions support in neon-http driver" at runtime. Nothing typechecks
 * differently and no test that stubs the database would notice, so the first
 * sign is a feature that silently does nothing in production.
 *
 * That is exactly what happened to "Save as my default day", and it survived
 * a full green suite until browser QA caught it. This is the cheap guard that
 * would have caught it first.
 */
describe("no repository uses interactive transactions", () => {
  const files = [
    "db/repositories/planner.ts",
    "db/repositories/focus.ts",
    "db/repositories/tasks.ts",
    "db/repositories/goals.ts",
    "db/repositories/worker.ts",
    "db/repositories/push.ts",
    "db/repositories/inspirations.ts",
  ];

  it("the client really is the neon-http driver", () => {
    // If this ever changes to a pooled/websocket driver, the rule below can be
    // relaxed deliberately rather than by accident.
    expect(read("db/client.ts")).toContain('from "drizzle-orm/neon-http"');
  });

  it.each(files)("%s does not call db.transaction", (rel) => {
    expect(stripComments(read(rel))).not.toContain("db.transaction(");
  });

  it("uses db.batch where several writes must land together", () => {
    expect(stripComments(read("db/repositories/planner.ts"))).toContain("db.batch(");
  });
});

/**
 * The category editor row on a phone.
 *
 * Reorder, colour, name, stepper, total and delete is more than 390px holds in
 * one line. Measured at 60px of name field, which clipped "Personal" and "Free
 * time" into unreadable stubs. The row wraps and the name keeps a floor.
 */
describe("the category editor row survives a narrow screen", () => {
  const view = read("components/planner/planner-view.tsx");

  it("wraps rather than crushing the name field", () => {
    expect(view).toContain("flex flex-wrap items-center gap-2");
  });

  it("gives the name a minimum width", () => {
    expect(view).toContain('className="h-8 min-w-[7rem] flex-1"');
  });
});

/**
 * "Also add to To-dos" creates exactly one of each.
 *
 * The failure this guards against is two rows for one intention: a freeform
 * entry AND a task, or two planner items, either of which makes the day read as
 * fuller than it is. The implementation avoids it by making the entry LINKED
 * rather than freeform, so there is one `day_plan_items` row whose minutes are
 * counted once, pointing at one task.
 */
describe("planner entries that also become to-dos", () => {
  const actions = stripComments(read("app/(app)/planner/actions.ts"));
  const start = actions.indexOf("export async function addFreeformItemAction");
  const body = actions.slice(start, actions.indexOf("\nexport async function ", start + 1));

  it("reuses the existing task repository rather than a second implementation", () => {
    expect(body).toContain("tasksRepo.createTask(user.id");
  });

  it("creates the entry LINKED, not as a freeform row alongside a task", () => {
    // One row either way. The linked branch must not also call the freeform one.
    const linkedBranch = body.slice(body.indexOf("if (parsed.data.alsoCreateTask)"));
    const upToReturn = linkedBranch.slice(0, linkedBranch.indexOf("return { ok: true"));
    expect(upToReturn).toContain("plannerRepo.addItem(user.id");
    expect(upToReturn).not.toContain("addFreeformItem");
  });

  it("writes the planned duration once, to both the entry and the estimate", () => {
    expect(body).toContain("estimateMinutes: parsed.data.plannedMinutes");
    expect(body).toContain("plannedMinutes: parsed.data.plannedMinutes");
  });

  it("does not schedule the new to-do", () => {
    /*
     * Putting work in a plan and committing that plan to Today are separate
     * decisions; `addPlanToTodayAction` is the one that writes scheduled_for.
     */
    expect(body).not.toContain("scheduledFor");
  });

  it("still derives identity from the session", () => {
    expect(body.slice(0, 400)).toContain("await requireUser()");
  });

  it("leaves the plain freeform path untouched", () => {
    expect(body).toContain("plannerRepo.addFreeformItem(user.id");
  });
});
