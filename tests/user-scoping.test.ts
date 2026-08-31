import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Source with its comments removed.
 *
 * These assertions are about what the CODE does, and the comments in these
 * files explain the very rules being checked. Scanning the raw text matches the
 * explanation and reports a violation that is really a promise.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Cross-account isolation, checked at the seam rather than through the UI.
 *
 * CLAUDE.md section 5 is the rule these enforce: identity comes from the
 * session, every domain query and mutation is scoped to it, and an id arriving
 * in a form is treated as a claim rather than as permission. The features added
 * in this pass all take ids from the client (an allocation, a task to accept, a
 * goal to archive with its subgoals), so each is a new place that rule could
 * have been dropped.
 *
 * Deliberately STATIC. A live cross-account test needs two real accounts and a
 * database, which the unit suite has neither of; what it would catch is a
 * missing `where`, and that is visible in the source. These run on every commit,
 * which a database test would not.
 */

/** The repository files added or changed by this pass. */
const REPOSITORIES = [
  "db/repositories/planner.ts",
  "db/repositories/goals.ts",
  "db/repositories/inspirations.ts",
  "db/repositories/tasks.ts",
];

describe("repositories are user-scoped", () => {
  it("never exports a query without a userId argument", () => {
    for (const rel of REPOSITORIES) {
      const source = read(rel);
      const exported = [...source.matchAll(/export async function (\w+)\(([^)]*)\)/g)];
      expect(exported.length, rel).toBeGreaterThan(0);
      for (const [, name, args] of exported) {
        /*
         * Every read and write takes the session user id as its first argument,
         * by convention (db/repositories/index.ts). The two exceptions below
         * are named and justified rather than silently allowed.
         */
        const exempt =
          // Takes the whole row, which already carries userId.
          name === "insertIfAbsent" || name === "upsertTakeaway";
        if (exempt) continue;
        expect(args.includes("userId"), `${rel}#${name}`).toBe(true);
      }
    }
  });

  it("stays behind server-only, so no query can reach a browser bundle", () => {
    for (const rel of REPOSITORIES) {
      expect(read(rel).startsWith('import "server-only";'), rel).toBe(true);
    }
  });
});

describe("planner mutations cannot reach another account", () => {
  const actions = read("app/(app)/planner/actions.ts");

  it("derives identity from the session, never from the input", () => {
    // `requireUser()` once per action, and no action takes a userId parameter.
    const handlers = [...actions.matchAll(/export async function (\w+Action)/g)];
    expect(handlers.length).toBeGreaterThanOrEqual(5);
    expect(actions).not.toMatch(/userId\s*:\s*(string|input\.)/);
    for (const [, name] of handlers) {
      const body = actions.slice(actions.indexOf(`function ${name}`));
      expect(body.slice(0, 400), name).toContain("await requireUser()");
    }
  });

  it("re-checks that a referenced life area belongs to the caller", () => {
    // A lifeAreaId in a form is user input. Without this, a forged one would
    // put another account's area name into a plan.
    expect(actions).toContain("lifeAreasRepo.listLifeAreas(user.id");
    expect(actions).toContain("is not one of your life areas");
  });

  it("re-checks the allocation and the to-do before accepting a suggestion", () => {
    expect(actions).toContain("plannerRepo.getAllocation(user.id");
    expect(actions).toContain("tasksRepo.getTask(user.id");
  });

  it("passes the session user to every repository call", () => {
    const calls = [...actions.matchAll(/(plannerRepo|tasksRepo|lifeAreasRepo)\.\w+\(([^,)]*)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const [, repo, firstArg] of calls) {
      expect(firstArg.trim(), repo).toMatch(/^user\.id$/);
    }
  });
});

describe("takeaways are the reader's own", () => {
  const actions = read("app/(app)/today/takeaway-actions.ts");

  it("takes only the text, and resolves everything else server-side", () => {
    /*
     * The date and the inspiration are NOT parameters. A browser that has
     * travelled, or a tab left open past midnight, would otherwise file a note
     * under the wrong day; and an inspiration id from the client could attach a
     * takeaway to a record the user was never shown.
     */
    expect(actions).toMatch(/saveTakeawayAction\(\s*body: string,?\s*\)/);
    expect(actions).toContain("zonedToday(new Date(), timeZone)");
    expect(actions).toContain("getDailyInspiration(user.id, localDate)");
  });

  it("stores the text verbatim rather than improving it", () => {
    /*
     * The one thing in GoHa that is purely the user's own writing. CLAUDE.md
     * section 10: AI may recommend, but it does not silently modify what
     * someone wrote.
     *
     * Comments are stripped first, or this matches the very sentence above it
     * promising not to rewrite anything.
     */
    const code = stripComments(actions).toLowerCase();
    for (const forbidden of ["summari", "rewrit", "llm", "openai", "anthropic", "gemini"]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
    // What it does instead: parse, then store the parsed value unchanged.
    expect(actions).toContain("body: parsed.data");
  });
});

describe("goal hierarchy mutations are scoped", () => {
  const actions = read("app/(app)/goals/actions.ts");

  it("resolves the descendants to archive from the caller's own goals", () => {
    // `listGoals` is user-scoped, so the id set can only ever name rows this
    // account owns; the repository update then scopes again.
    expect(actions).toContain("goalsRepo.listGoals(user.id)");
    expect(actions).toContain("goalsRepo.archiveGoals(user.id, ids)");
  });

  it("verifies the parent goal belongs to the caller before assigning it", () => {
    expect(actions).toContain("goalsRepo.getGoal(userId, values.parentGoalId)");
  });

  it("refuses a third level on the server, not only in the form", () => {
    // The form only offers eligible parents, but the form is not the boundary.
    expect(actions).toContain("PARENT_REJECTION_MESSAGE.too_deep");
  });
});

describe("the goal detail page cannot show another account's goal", () => {
  const page = read("app/(app)/goals/[goalId]/page.tsx");

  it("looks the goal up inside the caller's own list", () => {
    expect(page).toContain("goalsRepo.listGoalsWithTaskCounts(user.id");
    expect(page).toContain("goals.find((entry) => entry.id === goalId)");
    // An id that is not in this user's list is a 404, not an error, and the
    // page does not distinguish "deleted" from "someone else's".
    expect(page).toContain("notFound()");
  });
});
