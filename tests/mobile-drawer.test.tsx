import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Log out</button>,
}));
vi.mock("@/components/shell/theme-toggle", () => ({ ThemeToggle: () => null }));

const { MobileHeader } = await import("@/components/shell/mobile-header");

const user = { name: "Maki", email: "maki@example.com", image: null };

afterEach(cleanup);

/**
 * The mobile navigation drawer.
 *
 * The header carries `glass-thin`, whose `backdrop-filter` makes it a
 * containing block for `position: fixed` descendants. While the drawer was a
 * child of the header it resolved `fixed inset-0` against the 56px top bar
 * instead of the viewport, so opening the menu produced a small clipped box
 * with the nav spilling over the page rather than a full-height sheet.
 *
 * jsdom does not do layout, so it cannot observe the clipping itself. What it
 * CAN pin down is the structural cause: the drawer must not be a descendant of
 * the header. That is the thing a future refactor would quietly undo.
 */
describe("mobile drawer", () => {
  it("renders outside the backdrop-filtered header, not inside it", async () => {
    const { container } = render(<MobileHeader user={user} />);
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const drawer = screen.getByRole("dialog", { name: "Main navigation" });
    const header = container.querySelector("header");

    expect(header).not.toBeNull();
    expect(header!.contains(drawer)).toBe(false);
    expect(document.body.contains(drawer)).toBe(true);
  });

  it("opens with the full primary navigation reachable", async () => {
    render(<MobileHeader user={user} />);
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const nav = screen.getByRole("navigation", { name: "Primary" });
    // The user reported not being able to reach other sections; every primary
    // destination must be present in the sheet.
    for (const label of ["Today", "Goals", "Habits", "Settings"]) {
      expect(within(nav).getByRole("link", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("closes on Escape", async () => {
    render(<MobileHeader user={user} />);
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.queryByRole("dialog", { name: "Main navigation" })).not.toBeNull();

    await userEvent.keyboard("{Escape}");
    // AnimatePresence keeps the sheet mounted for its slide-out, so this waits
    // for the exit rather than asserting on the same tick.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Main navigation" })).toBeNull(),
    );
  });
});
