import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AutomationOverview, TokenSummary } from "@/app/(app)/settings/automation-actions";

const createAction = vi.fn();
const revokeAction = vi.fn();

vi.mock("@/app/(app)/settings/automation-actions", () => ({
  createAutomationTokenAction: (...args: unknown[]) => createAction(...args),
  revokeAutomationTokenAction: (...args: unknown[]) => revokeAction(...args),
}));

const { IphoneConnectionCard } = await import("@/components/settings/iphone-connection-card");

const SECRET = "goha_dPq8XvT2mK9wZ1nB4rL7yH3sJ6fC0gA5";
const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z" /></svg>';

function token(overrides: Partial<TokenSummary> = {}): TokenSummary {
  return {
    id: "phone-1",
    name: "GoHa iPhone",
    prefix: "goha_dPq8Xv",
    scope: "read_write",
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

describe("iPhone connection card", () => {
  beforeEach(() => {
    createAction.mockReset();
    revokeAction.mockReset();
  });

  afterEach(cleanup);

  it("presents a consumer onboarding experience without technical terminology", () => {
    render(<IphoneConnectionCard initial={overview()} />);

    expect(screen.getByRole("heading", { name: "Connect your iPhone" })).toBeInTheDocument();
    expect(screen.getByText("Morning Brief")).toBeInTheDocument();
    expect(screen.getByText("Habit nudges")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect your iPhone" })).toBeEnabled();
    expect(document.body.textContent).not.toMatch(
      /bearer token|api credential|read_write|token scope|token hash|n8n|webhook|neon|database credential/i,
    );
  });

  it("uses the existing creation action and shows only the one-time QR", async () => {
    const user = userEvent.setup();
    createAction.mockResolvedValue({
      ok: true,
      data: { token: token(), secret: SECRET, qrSvg: QR_SVG },
    });
    render(<IphoneConnectionCard initial={overview()} />);

    await user.click(screen.getByRole("button", { name: "Connect your iPhone" }));

    await waitFor(() =>
      expect(createAction).toHaveBeenCalledWith({
        name: "GoHa iPhone",
        scope: "read_write",
        expiresInDays: null,
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Finish connecting your iPhone" });
    expect(within(dialog).getByRole("img", { name: "One-time iPhone pairing code" })).toBeInTheDocument();
    expect(within(dialog).getByText("Run the setup Shortcut")).toBeInTheDocument();
    expect(within(dialog).getByText("Complete the one-time setup")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET);

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "iPhone connection created" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("reconnects by revoking the old connection before creating a new one", async () => {
    const user = userEvent.setup();
    revokeAction.mockResolvedValue({ ok: true, data: { id: "phone-1" } });
    createAction.mockResolvedValue({
      ok: true,
      data: { token: token({ id: "phone-2" }), secret: SECRET, qrSvg: QR_SVG },
    });
    render(<IphoneConnectionCard initial={overview({ tokens: [token()] })} />);

    await user.click(screen.getByRole("button", { name: "Reconnect iPhone" }));
    const confirmation = await screen.findByRole("dialog", { name: "Reconnect your iPhone?" });
    await user.click(within(confirmation).getByRole("button", { name: "Reconnect iPhone" }));

    await waitFor(() => expect(revokeAction).toHaveBeenCalledWith("phone-1"));
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1));
    expect(revokeAction.mock.invocationCallOrder[0]).toBeLessThan(
      createAction.mock.invocationCallOrder[0],
    );
    expect(await screen.findByRole("dialog", { name: "Finish connecting your iPhone" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("disconnects every active connection without deleting its history", async () => {
    const user = userEvent.setup();
    revokeAction.mockImplementation(async (id: string) => ({ ok: true, data: { id } }));
    render(
      <IphoneConnectionCard
        initial={overview({ tokens: [token(), token({ id: "phone-2", name: "Older connection" })] })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    const confirmation = await screen.findByRole("dialog", { name: "Disconnect your iPhone?" });
    await user.click(within(confirmation).getByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(revokeAction).toHaveBeenCalledTimes(2));
    expect(revokeAction).toHaveBeenCalledWith("phone-1");
    expect(revokeAction).toHaveBeenCalledWith("phone-2");
    expect(await screen.findByRole("button", { name: "Connect your iPhone" })).toBeInTheDocument();
  });

  it("revokes a new connection when its QR cannot be prepared", async () => {
    const user = userEvent.setup();
    createAction.mockResolvedValue({
      ok: true,
      data: { token: token(), secret: SECRET, qrSvg: null },
    });
    revokeAction.mockResolvedValue({ ok: true, data: { id: "phone-1" } });
    render(<IphoneConnectionCard initial={overview()} />);

    await user.click(screen.getByRole("button", { name: "Connect your iPhone" }));

    await waitFor(() => expect(revokeAction).toHaveBeenCalledWith("phone-1"));
    expect(screen.queryByRole("dialog", { name: "Finish connecting your iPhone" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect your iPhone" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET);
  });
});
