import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

/**
 * A dialog must not fight the person using it.
 *
 * `onClose` is nearly always an inline arrow, so it is a new function on every
 * render of whatever owns the dialog. While it was in the effect's dependency
 * list, the effect tore down and set up again on each of those renders, and
 * setting up means "focus the first focusable in the panel". A dialog whose
 * owner re-renders while you type therefore pulled focus back to the close
 * button after every keystroke.
 */

function Owner() {
  // State in the OWNER, not the dialog: this is the shape that re-renders the
  // dialog on every keystroke.
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(true);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Rename">
      <label htmlFor="field">Name</label>
      <Input id="field" value={value} onChange={(event) => setValue(event.target.value)} />
    </Modal>
  );
}

describe("Modal focus", () => {
  afterEach(cleanup);

  it("leaves focus alone while the owner re-renders", async () => {
    const user = userEvent.setup();
    render(<Owner />);

    const field = screen.getByLabelText("Name");
    await user.click(field);
    await user.type(field, "quarterly review");

    expect(field).toHaveFocus();
    expect(field).toHaveValue("quarterly review");
  });

  it("still focuses into the dialog when it opens", async () => {
    render(<Owner />);
    // The first focusable is the close button; the point is that focus lands
    // inside the dialog rather than being left behind it.
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("still closes on Escape, with the newest handler", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Rename">
        <p>Body</p>
      </Modal>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
