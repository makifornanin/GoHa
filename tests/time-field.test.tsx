import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimeField } from "@/components/ui/time-field";

/**
 * The designed time picker that replaced `<input type="time">`.
 *
 * The native control rendered the browser's own spinner, which ignored every
 * token in GoHa and looked different in every browser. The rule that matters
 * most here is the one the UI hides: what leaves this control is always
 * 24-hour "HH:MM", because that is what the database stores and what the
 * automation schedule reads. Twelve-hour text is presentation only, and the
 * midday and midnight conversions are exactly where that goes wrong.
 */

afterEach(cleanup);

function setup(value = "") {
  const onChange = vi.fn();
  render(<TimeField value={value} onChange={onChange} ariaLabel="Plan the day" />);
  return { onChange };
}

const openPicker = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Plan the day" }));
  return screen.getByRole("dialog", { name: "Choose a time" });
};

describe("display", () => {
  it("shows a saved time the way people say it", () => {
    setup("15:30");
    expect(screen.getByRole("button", { name: "Plan the day" }).textContent).toContain("3:30 PM");
  });

  it("shows midnight and midday correctly rather than as 0 or 24", () => {
    setup("00:30");
    expect(screen.getByRole("button", { name: "Plan the day" }).textContent).toContain("12:30 AM");
    cleanup();
    setup("12:00");
    expect(screen.getByRole("button", { name: "Plan the day" }).textContent).toContain("12:00 PM");
  });

  it("says when nothing is set, since empty turns that message off", () => {
    setup("");
    expect(screen.getByRole("button", { name: "Plan the day" }).textContent).toContain("No time set");
  });

  it("renders no native time input at all", () => {
    const { container } = render(<TimeField value="09:00" onChange={vi.fn()} ariaLabel="t" />);
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });
});

describe("choosing", () => {
  it("emits 24-hour HH:MM, not the twelve-hour text on screen", async () => {
    const { onChange } = setup("09:00");
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("option", { name: "PM" }));
    // 9 AM shown as "9" becomes 21:00, not "9:00 PM".
    expect(onChange).toHaveBeenCalledWith("21:00");
  });

  it("keeps 12 AM at midnight rather than rolling it to noon", async () => {
    const { onChange } = setup("06:30");
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("option", { name: "12" }));
    // 12 with AM is 00, the classic off-by-twelve.
    expect(onChange).toHaveBeenCalledWith("00:30");
  });

  it("keeps 12 PM at noon", async () => {
    const { onChange } = setup("18:15");
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("option", { name: "12" }));
    expect(onChange).toHaveBeenCalledWith("12:15");
  });

  it("changes the minute without disturbing the hour", async () => {
    const { onChange } = setup("15:00");
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("option", { name: "45" }));
    expect(onChange).toHaveBeenCalledWith("15:45");
  });

  it("marks the current parts as selected", async () => {
    setup("15:30");
    const dialog = await openPicker();
    expect(within(dialog).getByRole("option", { name: "3" }).getAttribute("aria-selected")).toBe("true");
    expect(within(dialog).getByRole("option", { name: "30" }).getAttribute("aria-selected")).toBe("true");
    expect(within(dialog).getByRole("option", { name: "PM" }).getAttribute("aria-selected")).toBe("true");
  });

  it("starts somewhere sensible when nothing is set", async () => {
    const { onChange } = setup("");
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("option", { name: "15" }));
    // 7:00 AM is the default starting point, so this becomes 07:15.
    expect(onChange).toHaveBeenCalledWith("07:15");
  });
});

describe("clearing and dismissal", () => {
  it("can be emptied, because empty turns that scheduled message off", async () => {
    const { onChange } = setup("06:00");
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("offers no Clear when there is nothing to clear", async () => {
    setup("");
    const dialog = await openPicker();
    expect(within(dialog).queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("closes on Escape without changing anything", async () => {
    const { onChange } = setup("06:00");
    await openPicker();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Choose a time" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
