import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signUpEmail = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: (...args: unknown[]) => signUpEmail(...args) },
  },
}));

vi.mock("@/lib/use-mounted", () => ({ useMounted: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const { AuthForm } = await import("@/components/auth/auth-form");

describe("invited registration", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    replace.mockReset();
    refresh.mockReset();
    signUpEmail.mockResolvedValue({ data: {}, error: null });
  });

  afterEach(cleanup);

  it("submits an invitation-locked email and labels the account as the invitee", async () => {
    const user = userEvent.setup();
    render(
      <AuthForm
        mode="register"
        canBootstrap={false}
        inviteCode="INVITE-CODE"
        lockedEmail="friend@example.com"
      />,
    );

    const email = screen.getByRole("textbox", { name: /Email/ });
    expect(email).toHaveValue("friend@example.com");
    expect(email).toHaveAttribute("readonly");
    expect(email).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Create my account" })).toBeEnabled();

    await user.type(screen.getByLabelText("Name"), "Friend");
    await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "Create my account" }));

    await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
    expect(signUpEmail.mock.calls[0]?.[0]).toMatchObject({
      name: "Friend",
      email: "friend@example.com",
    });
    expect(signUpEmail.mock.calls[0]?.[1]).toEqual({
      headers: { "x-goha-invite": "INVITE-CODE" },
    });
  });
});
