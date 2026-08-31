import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The composer imports a Server Action. Under Next that import becomes a
 * reference and the server module never reaches the browser; under Vitest it is
 * followed for real, so both it and `server-only` are mocked here, the same way
 * the worker tests do.
 */
vi.mock("server-only", () => ({}));

const saveTakeawayAction = vi.fn();
vi.mock("@/app/(app)/today/takeaway-actions", () => ({
  saveTakeawayAction: (body: string) => saveTakeawayAction(body),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (msg: string) => toastError(msg) },
}));

import { TakeawayComposer } from "@/components/today/takeaway-composer";
import { TAKEAWAY_MAX } from "@/lib/validations/takeaway";

afterEach(cleanup);
beforeEach(() => {
  saveTakeawayAction.mockReset();
  toastError.mockReset();
});

/**
 * "My Takeaway": the reader's own words about the day's inspiration.
 *
 * The behaviours worth pinning down are all about restraint. It stays out of
 * the way until wanted, it stores what was typed rather than an improved
 * version of it, and clearing it means clearing it.
 */
describe("takeaway composer", () => {
  it("stays collapsed until asked, so the dashboard is not a form", () => {
    render(<TakeawayComposer initialBody="" />);
    expect(screen.getByRole("button", { name: /write what this means to you/i })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens a field when invited", async () => {
    render(<TakeawayComposer initialBody="" />);
    await userEvent.click(screen.getByRole("button", { name: /write what this means/i }));
    expect(screen.getByLabelText(/my takeaway/i)).toBeTruthy();
  });

  it("shows what was already written, without a field in the way", () => {
    render(<TakeawayComposer initialBody="Start before I feel ready." />);
    expect(screen.getByText("Start before I feel ready.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
  });

  it("saves exactly what was typed", async () => {
    saveTakeawayAction.mockResolvedValue({
      ok: true,
      data: { takeaway: { body: "Do the hard part first." } },
    });
    render(<TakeawayComposer initialBody="" />);
    await userEvent.click(screen.getByRole("button", { name: /write what this means/i }));
    await userEvent.type(screen.getByLabelText(/my takeaway/i), "Do the hard part first.");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // Verbatim. Nothing here rewrites, summarises or improves the user's words.
    await waitFor(() => expect(saveTakeawayAction).toHaveBeenCalledWith("Do the hard part first."));
  });

  it("does not offer to save an unchanged note", async () => {
    render(<TakeawayComposer initialBody="Already written." />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("button", { name: /^save$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("treats an emptied field as clearing the note", async () => {
    saveTakeawayAction.mockResolvedValue({ ok: true, data: { takeaway: null } });
    render(<TakeawayComposer initialBody="Something." />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.clear(screen.getByLabelText(/my takeaway/i));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(saveTakeawayAction).toHaveBeenCalledWith(""));
    // Back to the invitation, not to a stale copy of the deleted text.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /write what this means/i })).toBeTruthy(),
    );
  });

  it("restores the saved text when editing is cancelled", async () => {
    render(<TakeawayComposer initialBody="The original." />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.clear(screen.getByLabelText(/my takeaway/i));
    await userEvent.type(screen.getByLabelText(/my takeaway/i), "Half a thought");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("The original.")).toBeTruthy();
    expect(saveTakeawayAction).not.toHaveBeenCalled();
  });

  it("caps the length in the field, not only on the server", async () => {
    render(<TakeawayComposer initialBody="" />);
    await userEvent.click(screen.getByRole("button", { name: /write what this means/i }));
    const field = screen.getByLabelText(/my takeaway/i) as HTMLTextAreaElement;
    expect(field.maxLength).toBe(TAKEAWAY_MAX);
  });

  it("keeps the text on screen when the save fails", async () => {
    saveTakeawayAction.mockResolvedValue({ ok: false, error: "Network unavailable." });
    render(<TakeawayComposer initialBody="" />);
    await userEvent.click(screen.getByRole("button", { name: /write what this means/i }));
    await userEvent.type(screen.getByLabelText(/my takeaway/i), "Worth keeping");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // A failed save must never look like a successful one, and must never eat
    // what someone just wrote.
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Network unavailable."));
    expect((screen.getByLabelText(/my takeaway/i) as HTMLTextAreaElement).value).toBe(
      "Worth keeping",
    );
  });
});
