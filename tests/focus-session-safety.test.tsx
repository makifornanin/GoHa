import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { FocusSession } from "@/db";

/**
 * Focus draft and input safety (audit R-17). Three behaviours that only exist
 * on the screen, so the pure duration maths in `tests/focus.test.ts` cannot
 * cover them:
 *
 * 1. An unreadable custom length must not leave an earlier duration startable.
 * 2. Session notes must reach the database while the session runs, not only
 *    when it is finished.
 * 3. Discard destroys the session, so it must be confirmed.
 */

const startAction = vi.fn();
const saveNoteAction = vi.fn();
const discardAction = vi.fn();
const endAction = vi.fn();

vi.mock("@/app/(app)/focus/actions", () => ({
  startFocusSessionAction: (...args: unknown[]) => startAction(...args),
  saveFocusNoteAction: (...args: unknown[]) => saveNoteAction(...args),
  discardFocusSessionAction: (...args: unknown[]) => discardAction(...args),
  endFocusSessionAction: (...args: unknown[]) => endAction(...args),
  pauseFocusSessionAction: vi.fn(),
  resumeFocusSessionAction: vi.fn(),
  extendFocusSessionAction: vi.fn(),
}));

const { FocusView } = await import("@/components/focus/focus-view");
const { useFocusTimer } = await import("@/stores/focus-timer");

const stats = {
  todaySeconds: 0,
  weekSeconds: 0,
  byTask: [],
  byGoal: [],
  byLifeArea: [],
};

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "u",
    taskId: null,
    sessionDate: "2026-08-17",
    startedAt: new Date(Date.now() - 60_000),
    endedAt: null,
    pausedAt: null,
    pausedSeconds: 0,
    plannedDurationSeconds: 1500,
    durationSeconds: null,
    status: "in_progress",
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as FocusSession;
}

function view(activeSession: FocusSession | null = null) {
  return (
    <FocusView
      activeSession={activeSession}
      candidateTasks={[]}
      allTaskTitles={[]}
      stats={stats}
      recent={[]}
      timeZone="Asia/Manila"
    />
  );
}

describe("Focus session safety", () => {
  beforeEach(() => {
    startAction.mockReset();
    saveNoteAction.mockReset();
    discardAction.mockReset();
    endAction.mockReset();
    saveNoteAction.mockResolvedValue({ ok: true, data: { note: null } });
    discardAction.mockResolvedValue({ ok: true, data: { id: "x" } });
    // The timer store is module state shared across renders in this file.
    useFocusTimer.setState({ session: null, nowMs: Date.now() });
  });

  afterEach(() => {
    cleanup();
    useFocusTimer.setState({ session: null, nowMs: Date.now() });
  });

  it("refuses to start on an unreadable custom length, and recovers when it is fixed", async () => {
    const user = userEvent.setup();
    render(view());

    const startButton = screen.getByRole("button", { name: /start focus session/i });
    expect(startButton).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: "Custom" }));
    const field = screen.getByLabelText(/custom session length/i);
    await user.type(field, "abc");

    // The old behaviour: the field reads "abc" while Start quietly begins the
    // last duration it understood.
    expect(startButton).toBeDisabled();
    expect(screen.getByText("--:--")).toBeInTheDocument();
    await user.click(startButton);
    expect(startAction).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "40");
    expect(startButton).toBeEnabled();
    startAction.mockResolvedValue({ ok: true, data: session() });
    await user.click(startButton);
    await waitFor(() => expect(startAction).toHaveBeenCalledTimes(1));
    expect(startAction).toHaveBeenCalledWith({ taskId: null, plannedDurationSeconds: 2400 });
  });

  it("treats an emptied custom field as no duration rather than the last preset", async () => {
    const user = userEvent.setup();
    render(view());

    await user.click(screen.getByRole("radio", { name: "45m" }));
    await user.click(screen.getByRole("radio", { name: "Custom" }));

    expect(screen.getByRole("button", { name: /start focus session/i })).toBeDisabled();
  });

  it("autosaves the session note while the session is still running", async () => {
    const user = userEvent.setup();
    render(view(session()));

    await user.type(screen.getByLabelText(/session notes/i), "blocked on the API");

    await waitFor(() => expect(saveNoteAction).toHaveBeenCalled(), { timeout: 3000 });
    const [id, text] = saveNoteAction.mock.calls.at(-1) as [string, string];
    expect(id).toBe("11111111-1111-4111-8111-111111111111");
    expect(text).toBe("blocked on the API");
  });

  it("restores a note that was autosaved before a reload", async () => {
    render(view(session({ note: "picked up where I left off" })));

    expect(await screen.findByDisplayValue("picked up where I left off")).toBeInTheDocument();
  });

  it("asks before discarding, and only discards when confirmed", async () => {
    const user = userEvent.setup();
    render(view(session()));

    await user.click(screen.getByRole("button", { name: /discard session/i }));
    expect(discardAction).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/discard this session\?/i);

    await user.click(screen.getByRole("button", { name: /keep focusing/i }));
    expect(discardAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /discard session/i }));
    await user.click(await screen.findByRole("button", { name: /^discard$/i }));
    await waitFor(() => expect(discardAction).toHaveBeenCalledTimes(1));
  });
});
