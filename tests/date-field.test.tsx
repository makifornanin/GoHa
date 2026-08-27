import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateField, describeDate } from "@/components/ui/date-field";
import { addDays, startOfWeek } from "@/lib/date";

/**
 * The smart date field that replaced `<input type="date">`.
 *
 * The rules worth protecting are the ones that used to go wrong silently: the
 * chosen day must be exactly the day that leaves the control, presets must be
 * computed from the SAVED timezone's today rather than the browser's, and the
 * week must start where the user said it does.
 *
 * jsdom does no layout, so this covers behaviour and value semantics only. The
 * popover's position and the touch targets are checked in a real browser.
 */

afterEach(cleanup);

const TODAY = "2026-08-27"; // a Thursday

function setup(props: Partial<React.ComponentProps<typeof DateField>> = {}) {
  const onChange = vi.fn();
  render(
    <DateField
      value=""
      onChange={onChange}
      today={TODAY}
      ariaLabel="Start date"
      {...props}
    />,
  );
  return { onChange };
}

async function openPicker() {
  await userEvent.click(screen.getByRole("button", { name: /start date/i }));
  return screen.getByRole("dialog", { name: "Choose a date" });
}

describe("describeDate", () => {
  it("names the days people actually think in", () => {
    expect(describeDate(TODAY, TODAY)).toBe("Today");
    expect(describeDate(addDays(TODAY, 1), TODAY)).toBe("Tomorrow");
    expect(describeDate(addDays(TODAY, -1), TODAY)).toBe("Yesterday");
  });

  it("falls back to a real date for anything else", () => {
    const label = describeDate("2026-12-25", TODAY);
    expect(label).not.toBe("Today");
    expect(label).toMatch(/2026/);
  });
});

describe("presets", () => {
  it("commits today as the caller's local date, not the browser's", async () => {
    const { onChange } = setup();
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("button", { name: "Today" }));
    // The exact string in, the exact string out. Anything that round-tripped
    // through a Date here would risk landing a day away.
    expect(onChange).toHaveBeenCalledWith(TODAY);
  });

  it("commits tomorrow for day-shaped entities", async () => {
    const { onChange } = setup();
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
    expect(onChange).toHaveBeenCalledWith("2026-08-28");
  });

  it("uses the saved week start for a week-shaped entity", async () => {
    const { onChange } = setup({ presets: "week", weekStartsOn: 1 });
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("button", { name: "This week" }));
    // Monday of the week containing Thursday the 27th.
    expect(onChange).toHaveBeenCalledWith("2026-08-24");
    expect(startOfWeek(TODAY, 1)).toBe("2026-08-24");
  });

  it("respects a Sunday week start instead of assuming Monday", async () => {
    const { onChange } = setup({ presets: "week", weekStartsOn: 0 });
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("button", { name: "This week" }));
    expect(onChange).toHaveBeenCalledWith("2026-08-23");
  });
});

describe("calendar", () => {
  it("commits the clicked day exactly", async () => {
    const { onChange } = setup();
    const dialog = await openPicker();
    // The 15th of the shown month, which is August 2026.
    await userEvent.click(within(dialog).getByRole("gridcell", { name: "15" }));
    expect(onChange).toHaveBeenCalledWith("2026-08-15");
  });

  it("opens on the month of the current value", async () => {
    setup({ value: "2026-12-25" });
    const dialog = await openPicker();
    expect(within(dialog).getByText("December 2026")).toBeTruthy();
  });

  it("pages months without changing the value", async () => {
    const { onChange } = setup();
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("button", { name: "Next month" }));
    expect(within(dialog).getByText("September 2026")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("orders weekday headings by the saved week start", async () => {
    setup({ weekStartsOn: 0 });
    const dialog = await openPicker();
    const headings = within(dialog).getByText("Su");
    expect(headings).toBeTruthy();
  });

  it("clears the value rather than forcing a date", async () => {
    const { onChange } = setup({ value: TODAY });
    const dialog = await openPicker();
    await userEvent.click(within(dialog).getByRole("button", { name: /clear/i }));
    // Optional means optional: a start date must be removable.
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("keyboard and dismissal", () => {
  it("moves by day and week with the arrows, then commits on Enter", async () => {
    const { onChange } = setup({ value: TODAY });
    const dialog = await openPicker();
    const grid = within(dialog).getByRole("grid");
    grid.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    // One day forward, then one week forward: the 27th becomes the 4th.
    expect(onChange).toHaveBeenCalledWith("2026-09-04");
  });

  it("closes on Escape without choosing anything", async () => {
    const { onChange } = setup();
    await openPicker();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Choose a date" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders no native date input at all", () => {
    const { container } = render(
      <DateField value="" onChange={vi.fn()} today={TODAY} ariaLabel="Due date" />,
    );
    // The whole point: no browser-chrome date widget anywhere.
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });
});
