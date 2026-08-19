import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PushOverview } from "@/app/(app)/settings/push-actions";

const listOverviewAction = vi.fn();
const createPairingAction = vi.fn();
const getCurrentStateAction = vi.fn();
const subscribeAction = vi.fn();
const unsubscribeAction = vi.fn();
const sendTestAction = vi.fn();

vi.mock("@/app/(app)/settings/push-actions", () => ({
  listPushOverviewAction: (...args: unknown[]) => listOverviewAction(...args),
  createPushPairingAction: (...args: unknown[]) => createPairingAction(...args),
  getCurrentPushStateAction: (...args: unknown[]) => getCurrentStateAction(...args),
  subscribePushAction: (...args: unknown[]) => subscribeAction(...args),
  unsubscribePushAction: (...args: unknown[]) => unsubscribeAction(...args),
  sendTestPushAction: (...args: unknown[]) => sendTestAction(...args),
}));

const { IphoneConnectionCard } = await import("@/components/settings/iphone-connection-card");
const { usePushDevice } = await import("@/components/pwa/use-push-device");

function UnauthenticatedPushProbe() {
  usePushDevice(null, { authenticated: false });
  return null;
}

const PUBLIC_KEY = "AQIDBA";
const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z" /></svg>';

function overview(overrides: Partial<PushOverview> = {}): PushOverview {
  return {
    deviceCount: 0,
    pendingPairing: null,
    vapidPublicKey: PUBLIC_KEY,
    pushConfigured: true,
    ...overrides,
  };
}

function browserSubscription() {
  return {
    endpoint: "https://push.example/device-one",
    expirationTime: null,
    toJSON: () => ({
      endpoint: "https://push.example/device-one",
      expirationTime: null,
      keys: { p256dh: "public-key", auth: "auth-secret" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

function installPushBrowser(options?: {
  current?: PushSubscription | null;
  permission?: NotificationPermission;
}) {
  const current = options?.current ?? null;
  const subscribe = vi.fn().mockResolvedValue(browserSubscription());
  const getSubscription = vi.fn().mockResolvedValue(current);
  const requestPermission = vi.fn().mockResolvedValue("granted");

  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: function PushManager() {},
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: {
      permission: options?.permission ?? "default",
      requestPermission,
    },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: { getSubscription, subscribe },
      }),
    },
  });

  return { current, subscribe, getSubscription, requestPermission };
}

function removePushBrowser() {
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(window, "Notification");
  Reflect.deleteProperty(window.navigator, "serviceWorker");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
}

describe("iPhone connection card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOverviewAction.mockResolvedValue(overview());
    getCurrentStateAction.mockResolvedValue({ ok: true, data: { connected: false } });
    installPushBrowser();
  });

  afterEach(() => {
    cleanup();
    removePushBrowser();
  });

  it("presents Web Push onboarding without developer or Shortcuts terminology", async () => {
    render(<IphoneConnectionCard initial={overview()} />);

    expect(screen.getByRole("heading", { name: "Connect your iPhone" })).toBeInTheDocument();
    expect(screen.getByText("Morning Brief")).toBeInTheDocument();
    expect(screen.getByText("Evening Summary")).toBeInTheDocument();
    expect(screen.queryByText("Habit nudges")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Set up this device" })).toBeEnabled(),
    );
    expect(document.body.textContent).not.toMatch(
      /shortcut|personal automation|bearer|api token|read_write|scope|webhook|n8n|vapid|endpoint|p256dh/i,
    );
  });

  it("creates a short-lived QR setup intent without changing existing devices", async () => {
    const user = userEvent.setup();
    createPairingAction.mockResolvedValue({
      ok: true,
      data: { qrSvg: QR_SVG, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
    });
    render(<IphoneConnectionCard initial={overview({ deviceCount: 2 })} />);

    await user.click(await screen.findByRole("button", { name: "Add another iPhone" }));

    await waitFor(() => expect(createPairingAction).toHaveBeenCalledWith());
    const dialog = await screen.findByRole("dialog", { name: "Finish connecting your iPhone" });
    expect(within(dialog).getByRole("img", { name: "Short-lived iPhone setup code" })).toBeInTheDocument();
    expect(within(dialog).getByText("Scan with your iPhone Camera")).toBeInTheDocument();
    expect(within(dialog).getByText("Tap Enable Notifications")).toBeInTheDocument();
    expect(unsubscribeAction).not.toHaveBeenCalled();
  });

  it("asks permission only after Enable Notifications is tapped", async () => {
    const browser = installPushBrowser();
    const user = userEvent.setup();
    subscribeAction.mockResolvedValue({ ok: true, data: { deviceCount: 1, paired: false } });
    render(<IphoneConnectionCard initial={overview()} />);

    expect(browser.requestPermission).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Set up this device" }));
    const dialog = await screen.findByRole("dialog", { name: "Set up this device" });
    expect(browser.requestPermission).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Enable Notifications" }));

    await waitFor(() => expect(browser.requestPermission).toHaveBeenCalledOnce());
    expect(browser.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(ArrayBuffer),
    });
    expect(subscribeAction).toHaveBeenCalledWith({
      endpoint: "https://push.example/device-one",
      expirationTime: null,
      keys: { p256dh: "public-key", auth: "auth-secret" },
    });
  });

  it("targets test and disconnect actions to this browser subscription only", async () => {
    const subscription = browserSubscription();
    installPushBrowser({ current: subscription, permission: "granted" });
    getCurrentStateAction.mockResolvedValue({ ok: true, data: { connected: true } });
    sendTestAction.mockResolvedValue({ ok: true, data: { sent: true } });
    unsubscribeAction.mockResolvedValue({ ok: true, data: { deviceCount: 1 } });
    const user = userEvent.setup();
    render(<IphoneConnectionCard initial={overview({ deviceCount: 2 })} />);

    expect(
      await screen.findByRole("heading", { name: "Notifications enabled on this device" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 devices connected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send Test Notification" }));
    await waitFor(() =>
      expect(sendTestAction).toHaveBeenCalledWith({ endpoint: subscription.endpoint }),
    );

    await user.click(screen.getByRole("button", { name: "Disconnect this device" }));
    const dialog = await screen.findByRole("dialog", { name: "Disconnect this device?" });
    await user.click(within(dialog).getByRole("button", { name: "Disconnect this device" }));

    await waitFor(() =>
      expect(unsubscribeAction).toHaveBeenCalledWith({ endpoint: subscription.endpoint }),
    );
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(await screen.findByText("1 device connected")).toBeInTheDocument();
  });

  it("guides same-device Home Screen installation when Push API is unavailable", async () => {
    removePushBrowser();
    const user = userEvent.setup();
    render(<IphoneConnectionCard initial={overview()} />);

    await user.click(await screen.findByRole("button", { name: "Set up this device" }));
    const dialog = await screen.findByRole("dialog", { name: "Set up this device" });
    expect(within(dialog).getByText("Add GoHa to your Home Screen first")).toBeInTheDocument();
    expect(within(dialog).getByText(/does not allow a website to add itself/i)).toBeInTheDocument();
    expect(subscribeAction).not.toHaveBeenCalled();
  });

  it("never sends an existing browser endpoint to the server before authentication", async () => {
    const subscription = browserSubscription();
    const browser = installPushBrowser({ current: subscription, permission: "granted" });

    render(<UnauthenticatedPushProbe />);

    await waitFor(() => expect(browser.getSubscription).toHaveBeenCalled());
    expect(getCurrentStateAction).not.toHaveBeenCalled();
  });
});
