import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const completeOnboardingAction = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/app/(app)/onboarding-actions", () => ({
  completeOnboardingAction: (...args: unknown[]) => completeOnboardingAction(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { WelcomeOnboarding } = await import("@/components/onboarding/welcome-onboarding");

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  completeOnboardingAction.mockResolvedValue({ ok: true });
});

async function advanceTo(step: 2 | 3) {
  for (let i = 1; i < step; i += 1) {
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  }
}

/**
 * First-login onboarding.
 *
 * Whether it appears at all is decided by the server (`onboardingCompletedAt`
 * on user_settings), so these cover the two things the component itself owns:
 * that every exit persists the state, and that the notification step hands off
 * to the setup flow that already exists rather than reimplementing it.
 */
describe("welcome onboarding", () => {
  it("opens on the welcome step and greets by first name", () => {
    render(<WelcomeOnboarding name="Maki Cruz" />);
    expect(screen.getByRole("heading", { name: "Welcome to GoHa, Maki" })).toBeTruthy();
  });

  it("falls back to a plain greeting when there is no name", () => {
    render(<WelcomeOnboarding name={null} />);
    expect(screen.getByRole("heading", { name: "Welcome to GoHa" })).toBeTruthy();
  });

  it("is three steps and no more", async () => {
    render(<WelcomeOnboarding name="Maki" />);

    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Step 1 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "How GoHa helps" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Get reminders on your phone" })).toBeTruthy();

    // The last step offers the CTA instead of another Continue.
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("persists completion when the user finishes via Set up notifications", async () => {
    render(<WelcomeOnboarding name="Maki" />);
    await advanceTo(3);

    await userEvent.click(screen.getByRole("button", { name: "Set up notifications" }));

    await waitFor(() => expect(completeOnboardingAction).toHaveBeenCalledTimes(1));
  });

  it("sends Set up notifications to the existing settings flow, not a copy of it", async () => {
    // /iphone/setup is a QR landing page that dead-ends without a pairing
    // fragment, so the CTA must land on the Settings notifications section.
    render(<WelcomeOnboarding name="Maki" />);
    await advanceTo(3);

    await userEvent.click(screen.getByRole("button", { name: "Set up notifications" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/settings#notifications"));
  });

  it("persists completion on Maybe later too", async () => {
    // "Later" is taken at face value: the popup does not return next login.
    // Phone setup stays permanently available in Settings.
    render(<WelcomeOnboarding name="Maki" />);
    await advanceTo(3);

    await userEvent.click(screen.getByRole("button", { name: "Maybe later" }));

    await waitFor(() => expect(completeOnboardingAction).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });

  it("persists completion when skipped from an early step", async () => {
    render(<WelcomeOnboarding name="Maki" />);

    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(completeOnboardingAction).toHaveBeenCalledTimes(1));
  });

  it("persists completion when dismissed with the close control", async () => {
    // Dismissing is an exit like any other. Treating it as "not seen" is what
    // turns a welcome into something that reappears until it is endured.
    render(<WelcomeOnboarding name="Maki" />);

    await userEvent.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => expect(completeOnboardingAction).toHaveBeenCalledTimes(1));
  });

  it("closes after completing so it does not linger over the app", async () => {
    render(<WelcomeOnboarding name="Maki" />);

    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("avoids naming the machinery behind notifications", async () => {
    // The reader does not need to know what a service worker or VAPID is.
    render(<WelcomeOnboarding name="Maki" />);
    await advanceTo(3);

    const text = screen.getByRole("dialog").textContent ?? "";
    for (const jargon of ["PWA", "service worker", "VAPID", "push subscription", "endpoint"]) {
      expect(text.toLowerCase()).not.toContain(jargon.toLowerCase());
    }
  });
});
