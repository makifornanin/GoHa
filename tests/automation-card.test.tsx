import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AutomationOverview, TokenSummary } from "@/app/(app)/settings/automation-actions";

/**
 * A credential the owner cannot see again is easy to get wrong, so the two
 * things that must hold are pinned here:
 *
 *  - the secret appears exactly once, and never comes back afterwards
 *  - revoking is immediate on screen, and does not delete the history
 */

const listAction = vi.fn();
const createAction = vi.fn();
const revokeAction = vi.fn();
const deleteAction = vi.fn();

vi.mock("@/app/(app)/settings/automation-actions", () => ({
  listAutomationAction: (...args: unknown[]) => listAction(...args),
  createAutomationTokenAction: (...args: unknown[]) => createAction(...args),
  revokeAutomationTokenAction: (...args: unknown[]) => revokeAction(...args),
  deleteAutomationTokenAction: (...args: unknown[]) => deleteAction(...args),
}));

const { AutomationCard } = await import("@/components/settings/automation-card");

const SECRET = "goha_dPq8XvT2mK9wZ1nB4rL7yH3sJ6fC0gA5";

function token(overrides: Partial<TokenSummary> = {}): TokenSummary {
  return {
    id: "t1",
    name: "n8n morning brief",
    prefix: "goha_dPq8Xv",
    scope: "read",
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    active: true,
    ...overrides,
  };
}

function overview(overrides: Partial<AutomationOverview> = {}): AutomationOverview {
  return { tokens: [], requests: [], sent: [], baseUrl: "https://goha.example.com", ...overrides };
}

describe("Automation card", () => {
  beforeEach(() => {
    listAction.mockReset();
    createAction.mockReset();
    revokeAction.mockReset();
    deleteAction.mockReset();
    listAction.mockResolvedValue(overview());
  });

  afterEach(cleanup);

  it("shows the secret once, and never again", async () => {
    const user = userEvent.setup();
    createAction.mockResolvedValue({ ok: true, data: { token: token(), secret: SECRET, qrSvg: null } });
    render(<AutomationCard />);

    await user.click(screen.getByRole("button", { name: /show tokens/i }));
    await user.click(await screen.findByRole("button", { name: /new token/i }));
    await user.type(screen.getByLabelText(/^name$/i), "n8n morning brief");
    await user.click(screen.getByRole("button", { name: /create token/i }));

    // Once: in the dialog that reports the creation.
    expect(await screen.findByText(SECRET)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /done/i }));

    // And then it is gone from the page entirely. What remains is the prefix,
    // which is not enough to authenticate with.
    await waitFor(() => expect(screen.queryByText(SECRET)).not.toBeInTheDocument());
    expect(screen.getByText("goha_dPq8Xv...")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("does not create a token without a name", async () => {
    const user = userEvent.setup();
    render(<AutomationCard />);

    await user.click(screen.getByRole("button", { name: /show tokens/i }));
    await user.click(await screen.findByRole("button", { name: /new token/i }));

    expect(screen.getByRole("button", { name: /create token/i })).toBeDisabled();
    expect(createAction).not.toHaveBeenCalled();
  });

  it("passes the chosen scope and expiry through, not a default", async () => {
    const user = userEvent.setup();
    createAction.mockResolvedValue({
      ok: true,
      data: { token: token({ scope: "read_write" }), secret: SECRET, qrSvg: null },
    });
    render(<AutomationCard />);

    await user.click(screen.getByRole("button", { name: /show tokens/i }));
    await user.click(await screen.findByRole("button", { name: /new token/i }));
    await user.type(screen.getByLabelText(/^name$/i), "n8n deliveries");

    // The app's Select is a custom combobox, not a native <select>: open it and
    // choose, the way the owner does.
    await user.click(screen.getByLabelText(/what it may do/i));
    await user.click(await screen.findByRole("option", { name: /read, and write/i }));
    await user.click(screen.getByLabelText(/expires/i));
    await user.click(await screen.findByRole("option", { name: "90 days" }));

    await user.click(screen.getByRole("button", { name: /create token/i }));

    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1));
    expect(createAction).toHaveBeenCalledWith({
      name: "n8n deliveries",
      scope: "read_write",
      expiresInDays: 90,
    });
  });

  it("revokes without deleting, then offers deletion", async () => {
    const user = userEvent.setup();
    listAction.mockResolvedValue(overview({ tokens: [token()] }));
    revokeAction.mockResolvedValue({ ok: true, data: { id: "t1" } });
    deleteAction.mockResolvedValue({ ok: true, data: { id: "t1" } });
    render(<AutomationCard />);

    await user.click(screen.getByRole("button", { name: /show tokens/i }));
    await user.click(await screen.findByRole("button", { name: /revoke/i }));

    await waitFor(() => expect(revokeAction).toHaveBeenCalledWith("t1"));
    // Still listed, marked revoked: revoking must not erase what it was doing.
    expect(await screen.findByText(/revoked/i)).toBeInTheDocument();
    expect(deleteAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /delete/i }));
    await waitFor(() => expect(deleteAction).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(screen.queryByText("n8n morning brief")).not.toBeInTheDocument());
  });

  it("survives a failed load rather than showing an empty promise", async () => {
    const user = userEvent.setup();
    listAction.mockRejectedValue(new Error("network gone"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AutomationCard />);

    await user.click(screen.getByRole("button", { name: /show tokens/i }));

    expect(await screen.findByText(/no tokens yet/i)).toBeInTheDocument();
  });
});
