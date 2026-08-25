import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
const push = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
    resetPassword: (...args: unknown[]) => resetPassword(...args),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const { ForgotPasswordForm } = await import("@/components/auth/forgot-password-form");
const { ResetPasswordForm } = await import("@/components/auth/reset-password-form");

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

async function requestReset(email: string) {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
}

/** The exact sentence the reader must see in every case. */
const GENERIC = /if an account exists for that address/i;

/**
 * Forgot password.
 *
 * The single property worth protecting here is that the screen says the same
 * thing no matter what is true on the server. An existing account, an address
 * nobody has ever used, and n8n being down must be indistinguishable, because
 * any difference between them turns this form into a way to test whether a
 * person has a GoHa account.
 */
describe("forgot password", () => {
  it("shows the generic confirmation for an address that has an account", async () => {
    requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
    render(<ForgotPasswordForm />);

    await requestReset("real@example.com");

    expect(await screen.findByText(GENERIC)).toBeTruthy();
  });

  it("shows the SAME confirmation for an address that has none", async () => {
    // Better Auth answers unknown addresses with the same 200 and the same
    // message; this asserts the browser does not undo that.
    requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
    render(<ForgotPasswordForm />);

    await requestReset("nobody@example.com");

    expect(await screen.findByText(GENERIC)).toBeTruthy();
  });

  it("shows the SAME confirmation when the request itself fails", async () => {
    // n8n down, database unreachable, 500: still indistinguishable. An error
    // banner here would be the leak.
    requestPasswordReset.mockRejectedValue(new Error("n8n unreachable"));
    render(<ForgotPasswordForm />);

    await requestReset("real@example.com");

    expect(await screen.findByText(GENERIC)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sends the same request shape regardless of the address", async () => {
    requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
    render(<ForgotPasswordForm />);
    await requestReset("real@example.com");

    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "real@example.com",
      redirectTo: "/reset-password",
    });
  });

  it("rejects a malformed address before asking the server", async () => {
    render(<ForgotPasswordForm />);
    await requestReset("not-an-email");

    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/valid email/i);
    // Still no statement about account existence.
    expect(screen.queryByText(GENERIC)).toBeNull();
  });

  it("never names the account in the confirmation", async () => {
    requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
    render(<ForgotPasswordForm />);
    await requestReset("real@example.com");

    const confirmation = await screen.findByText(GENERIC);
    expect(confirmation.textContent).not.toContain("real@example.com");
  });
});

/**
 * Setting the new password.
 *
 * Better Auth consumes the token server-side, so every rejection reaching this
 * screen looks the same and is treated the same: the link is spent, ask for a
 * new one. There is deliberately no inline retry.
 */
describe("reset password", () => {
  it("sets a new password with a live token", async () => {
    resetPassword.mockResolvedValue({ data: { status: true }, error: null });
    render(<ResetPasswordForm token="live-token" linkError={false} />);

    await userEvent.type(screen.getByLabelText("New password"), "a-good-passphrase");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "a-good-passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(screen.getByText("Password updated")).toBeTruthy());
    expect(resetPassword).toHaveBeenCalledWith({
      newPassword: "a-good-passphrase",
      token: "live-token",
    });
  });

  it("refuses an expired token", async () => {
    resetPassword.mockResolvedValue({ data: null, error: { message: "INVALID_TOKEN" } });
    render(<ResetPasswordForm token="expired-token" linkError={false} />);

    await userEvent.type(screen.getByLabelText("New password"), "a-good-passphrase");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "a-good-passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/expired or has already been used/i);
  });

  it("refuses a token that has already been used", async () => {
    // Indistinguishable from expired on purpose: the server consumed the row
    // either way, and the reader's next step is identical.
    resetPassword.mockResolvedValue({ data: null, error: { message: "INVALID_TOKEN" } });
    render(<ResetPasswordForm token="used-token" linkError={false} />);

    await userEvent.type(screen.getByLabelText("New password"), "a-good-passphrase");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "a-good-passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/expired or has already been used/i);
  });

  it("shows the dead end when the link carried no token at all", async () => {
    render(<ResetPasswordForm token={null} linkError={false} />);

    expect(screen.getByText("That link no longer works")).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("shows the dead end when Better Auth rejected the link before redirecting", async () => {
    render(<ResetPasswordForm token={null} linkError />);

    expect(screen.getByText("That link no longer works")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Request a new link" }));
    expect(push).toHaveBeenCalledWith("/forgot-password");
  });

  it("will not submit a password shorter than the server would accept", async () => {
    render(<ResetPasswordForm token="live-token" linkError={false} />);

    await userEvent.type(screen.getByLabelText("New password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(resetPassword).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/at least 8 characters/i);
  });

  it("will not submit when the two passwords differ", async () => {
    render(<ResetPasswordForm token="live-token" linkError={false} />);

    await userEvent.type(screen.getByLabelText("New password"), "a-good-passphrase");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "a-different-one");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(resetPassword).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/must match/i);
  });
});
