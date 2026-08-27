import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const completeOnboardingAction = vi.fn(async () => ({ ok: true }));
vi.mock("@/app/(app)/onboarding-actions", () => ({
  completeOnboardingAction: () => completeOnboardingAction(),
}));

const { WelcomeOnboarding } = await import("@/components/onboarding/welcome-onboarding");

/**
 * One stable shell across all three steps.
 *
 * The steps have genuinely different amounts of content, and the content area
 * used to carry a `min-h` guess that fitted the first and was overshot by the
 * other two, so pressing Continue moved the progress bar and the buttons under
 * the pointer. All three now share a single grid cell, which makes the shell as
 * tall as the tallest step and stops it resizing.
 *
 * jsdom has no layout, so this cannot measure the jump. What it CAN pin is the
 * structure that prevents it: every step present in one cell, exactly one
 * visible, the others hidden from assistive tech and untabbable.
 */

afterEach(() => {
  cleanup();
  completeOnboardingAction.mockClear();
});

function setup() {
  render(<WelcomeOnboarding name="Maki" />);
}

describe("shell structure", () => {
  it("keeps all three steps in a single grid cell", () => {
    setup();
    const cell = document.querySelector(".grid");
    expect(cell).not.toBeNull();
    // Three children, all stacked in row 1 / column 1, so the cell takes the
    // height of the tallest and never changes between steps.
    const stacked = cell!.querySelectorAll(":scope > div");
    expect(stacked).toHaveLength(3);
    for (const child of stacked) {
      expect(child.className).toContain("col-start-1");
      expect(child.className).toContain("row-start-1");
    }
  });

  it("uses no fixed height that could clip on a small screen", () => {
    setup();
    const cell = document.querySelector(".grid") as HTMLElement;
    // A magic min-height is exactly what was wrong before: it fitted one step.
    expect(cell.className).not.toMatch(/min-h-\[/);
    expect(cell.className).not.toMatch(/\bh-\[/);
  });

  it("shows exactly one step and hides the rest from assistive tech", () => {
    setup();
    const stacked = document.querySelectorAll(".grid > div");
    const visible = [...stacked].filter((el) => !el.className.includes("invisible"));
    expect(visible).toHaveLength(1);

    const hidden = [...stacked].filter((el) => el.getAttribute("aria-hidden") === "true");
    expect(hidden).toHaveLength(2);
    // Hidden steps must not be reachable by keyboard either.
    for (const el of hidden) expect(el.hasAttribute("inert")).toBe(true);
  });

  it("advances the visible step without changing the structure", async () => {
    setup();
    const before = document.querySelectorAll(".grid > div").length;
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    const after = document.querySelectorAll(".grid > div");
    // Same cell, same children: only which one is visible changed.
    expect(after).toHaveLength(before);
    expect([...after].filter((el) => !el.className.includes("invisible"))).toHaveLength(1);
  });
});

describe("actions stay where they are", () => {
  it("offers Skip and Continue on the early steps", () => {
    setup();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("offers Maybe later and Set up notifications on the last step", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("button", { name: "Maybe later" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set up notifications" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("reports position as status, so progress is announced and not decorative", () => {
    setup();
    expect(screen.getByRole("status", { name: /step 1 of 3/i })).toBeTruthy();
  });

  it("persists completion when dismissed rather than asking again", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    // Treating a dismissal as "not seen" is what turns a welcome into a nag.
    expect(completeOnboardingAction).toHaveBeenCalled();
  });
});
