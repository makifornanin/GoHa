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

/** How many screens the flow has. Kept in one place, not spread over asserts. */
const STEP_COUNT = 5;

async function advanceToLast() {
  for (let i = 1; i < STEP_COUNT; i += 1) {
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

  it("teaches the chain in order, then stops", async () => {
    /*
     * The order IS the lesson. The previous flow listed three features, and a
     * reader who finished it still did not know that a goal breaks into
     * subgoals, or that subgoals hold the to-dos that land on a day. That is
     * the one idea the whole product rests on.
     */
    render(<WelcomeOnboarding name="Maki" />);

    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Step 1 of " + STEP_COUNT);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Start with what matters" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Break the goal down" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Plan your day" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Stay on track" })).toBeTruthy();

    // The last step offers the CTA instead of another Continue.
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("shows the hierarchy as a worked example, not a definition", async () => {
    render(<WelcomeOnboarding name="Maki" />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Concrete, and in chain order: everybody already knows how these relate,
    // which is what makes the model land in three lines instead of a paragraph.
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Find a new job");
    expect(dialog.textContent).toContain("Finish my resume");
    expect(dialog.textContent).toContain("Rewrite the experience section");
  });

  it("uses the canonical vocabulary and not a synonym for it", async () => {
    // docs/TERMINOLOGY.md: Life Area, Goal, Subgoal, To-do. Teaching a beginner
    // one word here and showing them another in the menu is the whole problem.
    render(<WelcomeOnboarding name="Maki" />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).toContain("Subgoal");
    expect(text).toContain("To-do");
    expect(text).not.toContain("Sub-goal");
  });

  it("persists completion when the user finishes via Enable notifications", async () => {
    render(<WelcomeOnboarding name="Maki" />);
    await advanceToLast();

    await userEvent.click(screen.getByRole("button", { name: "Enable notifications" }));

    await waitFor(() => expect(completeOnboardingAction).toHaveBeenCalledTimes(1));
  });

  it("sends Enable notifications to the existing settings flow, not a copy of it", async () => {
    // /iphone/setup is a QR landing page that dead-ends without a pairing
    // fragment, so the CTA must land on the Settings notifications section.
    render(<WelcomeOnboarding name="Maki" />);
    await advanceToLast();

    await userEvent.click(screen.getByRole("button", { name: "Enable notifications" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/settings#notifications"));
  });

  it("persists completion on Maybe later too", async () => {
    // "Later" is taken at face value: the popup does not return next login.
    // Phone setup stays permanently available in Settings.
    render(<WelcomeOnboarding name="Maki" />);
    await advanceToLast();

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
    await advanceToLast();

    const text = screen.getByRole("dialog").textContent ?? "";
    for (const jargon of ["PWA", "service worker", "VAPID", "push subscription", "endpoint"]) {
      expect(text.toLowerCase()).not.toContain(jargon.toLowerCase());
    }
  });
});
