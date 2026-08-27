import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimeField } from "@/components/ui/time-field";

/**
 * The inline time field that replaced `<input type="time">`.
 *
 * Same interaction as the native control, which was the right shape: segments
 * typed straight into, with no popover to open for a value you already know.
 * Only the rendering changed.
 *
 * Two rules are worth pinning. What leaves this control is always 24-hour
 * "HH:MM", because that is what the column stores and what the automation
 * schedule reads, and midnight and noon are where that conversion gets written
 * backwards. And a digit typed into a full segment REPLACES it: reproducing
 * that with selection alone did not survive a real click, which is a bug these
 * tests could not have found on their own.
 */

afterEach(cleanup);

function setup(value = "") {
  const onChange = vi.fn();
  render(<TimeField value={value} onChange={onChange} ariaLabel="Plan the day" />);
  return { onChange };
}

const hour = () => screen.getByRole("textbox", { name: /hour/i }) as HTMLInputElement;
const minute = () => screen.getByRole("textbox", { name: /minute/i }) as HTMLInputElement;
const meridiem = () => screen.getByRole("button", { name: /meridiem/i });
/** Tab out past the meridiem and clear buttons, which live inside the field. */
const leaveField = async () => {
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
};

describe("shape", () => {
  it("renders three segments inline, with no popover to open", () => {
    setup("15:30");
    expect(hour()).toBeTruthy();
    expect(minute()).toBeTruthy();
    expect(meridiem()).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders no native time input", () => {
    const { container } = render(<TimeField value="09:00" onChange={vi.fn()} ariaLabel="t" />);
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it("shows a saved time split across the segments", () => {
    setup("15:30");
    expect(hour().value).toBe("3");
    expect(minute().value).toBe("30");
    expect(meridiem().textContent).toBe("PM");
  });

  it("shows midnight as 12 AM rather than 0", () => {
    setup("00:30");
    expect(hour().value).toBe("12");
    expect(meridiem().textContent).toBe("AM");
  });

  it("shows noon as 12 PM", () => {
    setup("12:00");
    expect(hour().value).toBe("12");
    expect(meridiem().textContent).toBe("PM");
  });
});

describe("typing", () => {
  it("emits 24-hour HH:MM, not what is on screen", async () => {
    const { onChange } = setup("");
    await userEvent.click(hour());
    await userEvent.keyboard("3");
    await userEvent.click(minute());
    await userEvent.keyboard("30");
    // A discrete action commits without waiting for blur.
    await userEvent.click(meridiem());
    expect(onChange).toHaveBeenLastCalledWith("15:30");
  });

  it("keeps 12 AM at midnight rather than rolling it to noon", async () => {
    const { onChange } = setup("06:30");
    await userEvent.click(hour());
    await userEvent.keyboard("12");
    await leaveField();
    expect(onChange).toHaveBeenLastCalledWith("00:30");
  });

  it("keeps 12 PM at noon", async () => {
    const { onChange } = setup("18:15");
    await userEvent.click(hour());
    await userEvent.keyboard("12");
    await leaveField();
    expect(onChange).toHaveBeenLastCalledWith("12:15");
  });

  it("replaces a full segment rather than rejecting the keystrokes", async () => {
    /*
     * The bug this shape fixes, found in a browser and not here. Arriving at a
     * full two-character segment left nothing selected, because the browser
     * sets the caret AFTER the click handler runs, and `maxLength` then
     * silently swallowed every digit: clicking a minute reading 40 and typing
     * 15 left it at 40. Digits are handled directly now, so the first replaces.
     */
    setup("09:40");
    await userEvent.click(minute());
    await userEvent.keyboard("15");
    expect(minute().value).toBe("15");
  });

  it("appends the second digit rather than replacing again", async () => {
    setup("09:00");
    await userEvent.click(minute());
    await userEvent.keyboard("4");
    expect(minute().value).toBe("4");
    await userEvent.keyboard("5");
    expect(minute().value).toBe("45");
  });

  it("moves to the minute once the hour cannot take another digit", async () => {
    setup("");
    await userEvent.click(hour());
    // 8 cannot begin a two-digit hour, so the hour is finished.
    await userEvent.keyboard("8");
    expect(document.activeElement).toBe(minute());
  });

  it("clamps an impossible hour when the field is left, not while typing", async () => {
    setup("09:00");
    await userEvent.click(hour());
    // 1 can begin a two-digit hour, so it waits for the second digit; 9 could
    // not, which is why 99 would have advanced after the first keystroke.
    await userEvent.keyboard("19");
    // Left alone mid-word: correcting someone between keystrokes is worse.
    expect(hour().value).toBe("19");
    await leaveField();
    expect(hour().value).toBe("12");
  });

  it("pads a single-digit minute once the field is left", async () => {
    setup("09:00");
    await userEvent.click(minute());
    await userEvent.keyboard("5");
    await leaveField();
    expect(minute().value).toBe("05");
  });

  it("ignores non-digits rather than showing them", async () => {
    setup("");
    await userEvent.click(hour());
    await userEvent.keyboard("ab");
    expect(hour().value).toBe("");
  });

  it("says nothing upward while a time is still half typed", async () => {
    const { onChange } = setup("");
    await userEvent.click(hour());
    await userEvent.keyboard("3");
    // An hour with no minute is not a time yet, so nothing is saved.
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("arrow keys", () => {
  it("steps the hour and wraps at 12", async () => {
    const { onChange } = setup("11:00");
    hour().focus();
    await userEvent.keyboard("{ArrowUp}");
    // Arrows are discrete actions, so they save immediately. 12 AM is 00:00.
    expect(onChange).toHaveBeenLastCalledWith("00:00");
    await userEvent.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith("01:00");
  });

  it("steps the minute and wraps at 59", async () => {
    const { onChange } = setup("09:59");
    minute().focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith("09:00");
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("09:59");
  });
});

describe("clearing", () => {
  it("can be emptied, because empty turns that scheduled message off", async () => {
    const { onChange } = setup("06:00");
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(hour().value).toBe("");
    expect(minute().value).toBe("");
  });

  it("offers no clear control when there is nothing to clear", () => {
    setup("");
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });
});
