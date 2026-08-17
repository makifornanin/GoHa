import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { BrainDumpItem } from "@/db";

/**
 * Rapid capture must never leave the form permanently pending (audit R-10).
 *
 * The documented repro: capturing again within ~400ms left the button disabled
 * with aria-busy, no error, cleared only by a reload. It came from putting the
 * optimistic insert inside a shared useTransition whose pending flag cleared
 * before the revalidated props committed, so an overlapping capture joined a
 * transition that never settled.
 *
 * These drive the real component with the Server Actions mocked, capturing with
 * NO delay at all, which is strictly harsher than the 150ms that used to fail.
 */

const captureAction = vi.fn();
const setColorAction = vi.fn();

vi.mock("@/app/(app)/brain-dump/actions", () => ({
  captureBrainDumpItemAction: (...args: unknown[]) => captureAction(...args),
  setBrainDumpColorAction: (...args: unknown[]) => setColorAction(...args),
  archiveBrainDumpItemAction: vi.fn(),
  convertBrainDumpItemAction: vi.fn(),
  deleteBrainDumpItemAction: vi.fn(),
  restoreBrainDumpItemAction: vi.fn(),
  updateBrainDumpItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { BrainDumpView } = await import("@/components/brain-dump/brain-dump-view");

function row(content: string, id: string): BrainDumpItem {
  return {
    id,
    userId: "u",
    content,
    status: "inbox",
    color: "yellow",
    convertedType: null,
    convertedEntityId: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as BrainDumpItem;
}

describe("Brain Dump rapid capture", () => {
  beforeEach(() => {
    captureAction.mockReset();
    setColorAction.mockReset();
    // Resolve like a healthy server action, on a real microtask boundary.
    let n = 0;
    captureAction.mockImplementation(async (content: string) => {
      n += 1;
      return { ok: true, data: row(content, `server-${n}`) };
    });
    setColorAction.mockResolvedValue({ ok: true });
  });

  afterEach(cleanup);

  it("stays usable through five back-to-back captures with no delay", async () => {
    const user = userEvent.setup();
    render(<BrainDumpView items={[]} />);

    const field = screen.getByLabelText("Capture a thought");
    const button = screen.getByRole("button", { name: "Pin it" });

    const thoughts = ["one", "two", "three", "four", "five"];
    for (const thought of thoughts) {
      await user.clear(field);
      await user.type(field, thought);
      await user.click(button);
    }

    // Every capture reached the server: none were swallowed by a stuck guard.
    await waitFor(() => {
      expect(captureAction).toHaveBeenCalledTimes(thoughts.length);
    });

    // The whole finding: the control must not be left busy. It IS legitimately
    // disabled while the field is empty, so type again and confirm the form is
    // genuinely usable rather than merely un-busy.
    expect(button).not.toHaveAttribute("aria-busy", "true");
    await user.type(field, "and a sixth");
    expect(button).not.toBeDisabled();

    // And every thought is still on the wall, exactly once each.
    for (const thought of thoughts) {
      expect(screen.getAllByText(thought)).toHaveLength(1);
    }
    // Generous timeout: this drives ~50 real keystrokes through user-event, so
    // it runs close to the 5s default and tips over it when the suite's other
    // jsdom files are competing for the CPU. The assertions are about state,
    // not speed, so the wall clock must not be what decides the result.
  }, 20_000);

  it("recovers the form when the action rejects", async () => {
    captureAction.mockRejectedValue(new Error("network went away"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const user = userEvent.setup();
    render(<BrainDumpView items={[]} />);

    const field = screen.getByLabelText("Capture a thought");
    await user.type(field, "a thought that fails");
    await user.click(screen.getByRole("button", { name: "Pin it" }));

    await waitFor(() => expect(captureAction).toHaveBeenCalledTimes(1));
    // A thrown action must not strand the UI either; the finally clause runs.
    await user.type(field, "recovered");
    expect(screen.getByRole("button", { name: "Pin it" })).not.toBeDisabled();
  });

  it("does not double-render a note once its server row arrives", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BrainDumpView items={[]} />);

    await user.type(screen.getByLabelText("Capture a thought"), "standing desk");
    await user.click(screen.getByRole("button", { name: "Pin it" }));
    await waitFor(() => expect(captureAction).toHaveBeenCalledTimes(1));

    // Revalidation lands: the same content now exists as a real row. The
    // placeholder must yield rather than sit alongside it.
    rerender(<BrainDumpView items={[row("standing desk", "server-1")]} />);
    await waitFor(() => {
      expect(screen.getAllByText("standing desk")).toHaveLength(1);
    });
  });
});
