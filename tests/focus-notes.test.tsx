import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FocusStats } from "@/components/focus/focus-stats";
import type { FocusSession } from "@/db";

afterEach(cleanup);

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const stats = {
  todaySeconds: 0,
  weekSeconds: 0,
  byTask: [],
  byGoal: [],
  byLifeArea: [],
};

function session(over: Partial<FocusSession> = {}): FocusSession {
  return {
    id: "s1",
    userId: "u1",
    taskId: null,
    sessionDate: "2026-09-01",
    startedAt: new Date("2026-09-01T02:00:00Z"),
    endedAt: new Date("2026-09-01T02:25:00Z"),
    pausedAt: null,
    pausedSeconds: 0,
    plannedDurationSeconds: 1500,
    durationSeconds: 1500,
    status: "completed",
    note: null,
    createdAt: new Date("2026-09-01T02:00:00Z"),
    updatedAt: new Date("2026-09-01T02:25:00Z"),
    ...over,
  } as FocusSession;
}

/**
 * Session notes, after the session is over.
 *
 * The reported bug was "focus notes are not being saved". They were: the note
 * is autosaved while the timer runs and written again when the session is
 * finished, and both paths were correct. What was missing is that NOTHING ever
 * rendered it again. The field lived only inside the running timer, so ending a
 * session made the writing vanish, which is indistinguishable from a lost save
 * for the person who wrote it.
 *
 * These pin the visible half, since the persistence half was never broken and
 * a test that only checked the database would have passed throughout.
 */
describe("a finished session still shows its note", () => {
  it("renders the note the user wrote", () => {
    render(
      <FocusStats
        stats={stats}
        recent={[session({ note: "Cracked the layout bug. Start on the API next." })]}
        taskTitleById={new Map()}
      />,
    );
    expect(screen.getByText("Cracked the layout bug. Start on the API next.")).toBeTruthy();
  });

  it("shows nothing at all when there is no note", () => {
    const { container } = render(
      <FocusStats stats={stats} recent={[session({ note: null })]} taskTitleById={new Map()} />,
    );
    // No empty note chip, and no placeholder pretending one exists.
    expect(container.textContent).not.toContain("No notes");
  });

  it("keeps the note of an abandoned session too", () => {
    // Abandoning is not deleting. The thinking is still worth reading back.
    render(
      <FocusStats
        stats={stats}
        recent={[session({ status: "abandoned", note: "Got pulled into a meeting." })]}
        taskTitleById={new Map()}
      />,
    );
    expect(screen.getByText("Got pulled into a meeting.")).toBeTruthy();
  });

  it("preserves the user's own line breaks rather than reflowing them", () => {
    render(
      <FocusStats
        stats={stats}
        recent={[session({ note: "One\nTwo" })]}
        taskTitleById={new Map()}
      />,
    );
    // The note text lives in its own <span>; matching the innermost element
    // avoids also matching every ancestor that contains it.
    const node = screen.getByText(
      (_, element) => element?.tagName === "SPAN" && element.textContent === "One\nTwo",
    );
    expect(node).toBeTruthy();
    // Rendered with the newline intact rather than collapsed by HTML.
    expect(read("components/focus/focus-stats.tsx")).toContain("whitespace-pre-wrap");
  });

  it("shows several sessions' notes independently", () => {
    render(
      <FocusStats
        stats={stats}
        recent={[
          session({ id: "s1", note: "First note" }),
          session({ id: "s2", note: "Second note" }),
          session({ id: "s3", note: null }),
        ]}
        taskTitleById={new Map()}
      />,
    );
    expect(screen.getByText("First note")).toBeTruthy();
    expect(screen.getByText("Second note")).toBeTruthy();
  });
});

/**
 * The persistence half, checked at the seam.
 *
 * These were already correct and are pinned so a future change cannot quietly
 * reintroduce the bug the user thought they had.
 */
describe("a note is stored with its session", () => {
  const repo = read("db/repositories/focus.ts");
  const actions = read("app/(app)/focus/actions.ts");

  it("autosaves while the session runs, so a reload cannot lose it", () => {
    expect(repo).toContain("export async function saveSessionNote");
    expect(actions).toContain("export async function saveFocusNoteAction");
    expect(read("components/focus/focus-view.tsx")).toContain("saveFocusNoteAction");
  });

  it("reads the saved note back into the field when the page reloads", () => {
    expect(read("components/focus/focus-view.tsx")).toContain('useState(session.note ?? "")');
  });

  it("does not erase the note when a session is finished without one", () => {
    /*
     * `undefined` leaves the column alone; writing null unconditionally is what
     * used to let the abandon sweep wipe an autosaved note.
     */
    expect(repo).toContain("...(input.note !== undefined ? { note: input.note } : {})");
    expect(actions).toContain("note: note === undefined ? undefined : noteResult.data");
  });

  it("flushes a pending autosave before finishing, so the two cannot race", () => {
    expect(read("components/focus/focus-view.tsx")).toContain('if (kind === "complete") await flushNote()');
  });

  it("returns the whole row, note included, when listing recent sessions", () => {
    // A narrowed select here would make the note invisible again.
    const start = repo.indexOf("export async function listRecentSessions");
    const body = repo.slice(start, start + 400);
    expect(body).toContain(".select()");
    expect(body).not.toContain(".select({");
  });
});
