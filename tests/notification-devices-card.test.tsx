import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PushDevice, PushOverview } from "@/app/(app)/settings/push-actions";

const listOverviewAction = vi.fn();
const createPairingAction = vi.fn();
const getCurrentStateAction = vi.fn();
const subscribeAction = vi.fn();
const unsubscribeAction = vi.fn();
const sendTestAction = vi.fn();
const listDevicesAction = vi.fn();
const disconnectDeviceAction = vi.fn();

vi.mock("@/app/(app)/settings/push-actions", () => ({
  listPushOverviewAction: (...args: unknown[]) => listOverviewAction(...args),
  createPushPairingAction: (...args: unknown[]) => createPairingAction(...args),
  getCurrentPushStateAction: (...args: unknown[]) => getCurrentStateAction(...args),
  subscribePushAction: (...args: unknown[]) => subscribeAction(...args),
  unsubscribePushAction: (...args: unknown[]) => unsubscribeAction(...args),
  sendTestPushAction: (...args: unknown[]) => sendTestAction(...args),
  listPushDevicesAction: (...args: unknown[]) => listDevicesAction(...args),
  disconnectPushDeviceAction: (...args: unknown[]) => disconnectDeviceAction(...args),
}));

const { NotificationDevicesCard } = await import(
  "@/components/settings/notification-devices-card"
);
const { usePushDevice } = await import("@/components/pwa/use-push-device");

function UnauthenticatedPushProbe() {
  usePushDevice(null, { authenticated: false });
  return null;
}

const PUBLIC_KEY = "AQIDBA";
const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z" /></svg>';
const ENDPOINT = "https://push.example/device-one";

function overview(overrides: Partial<PushOverview> = {}): PushOverview {
  return {
    deviceCount: 0,
    pendingPairing: null,
    vapidPublicKey: PUBLIC_KEY,
    pushConfigured: true,
    ...overrides,
  };
}

function pushDevice(overrides: Partial<PushDevice> = {}): PushDevice {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    deviceLabel: "Windows · Chrome",
    createdAt: "2026-08-28T02:00:00.000Z",
    lastSuccessAt: null,
    isCurrentDevice: false,
    ...overrides,
  };
}

function browserSubscription(endpoint = ENDPOINT) {
  return {
    endpoint,
    expirationTime: null,
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: { p256dh: "public-key", auth: "auth-secret" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value,
  });
}

function installPushBrowser(options?: {
  current?: PushSubscription | null;
  permission?: NotificationPermission;
  /** Successive results from pushManager.subscribe(), for the retry path. */
  subscribeResults?: PushSubscription[];
}) {
  const current = options?.current ?? null;
  const queue = options?.subscribeResults ?? [browserSubscription()];
  let index = 0;
  const subscribe = vi.fn().mockImplementation(async () => {
    const value = queue[Math.min(index, queue.length - 1)];
    index += 1;
    return value;
  });
  const getSubscription = vi.fn().mockResolvedValue(current);
  const requestPermission = vi.fn().mockResolvedValue("granted");

  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: function PushManager() {},
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { permission: options?.permission ?? "default", requestPermission },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }) },
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

describe("notification devices card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOverviewAction.mockResolvedValue(overview());
    getCurrentStateAction.mockResolvedValue({ ok: true, data: { connected: false } });
    listDevicesAction.mockResolvedValue({ ok: true, data: { devices: [] } });
    installPushBrowser();
  });

  afterEach(() => {
    cleanup();
    removePushBrowser();
  });

  it("presents platform-neutral onboarding with no iPhone-only wording", async () => {
    render(<NotificationDevicesCard initial={overview()} />);

    expect(screen.getByRole("heading", { name: "Notification Devices" })).toBeInTheDocument();
    expect(
      screen.getByText("Connect this device to receive GoHa reminders and notifications."),
    ).toBeInTheDocument();
    expect(screen.getByText("Morning Brief")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Enable Notifications" })).toBeEnabled(),
    );

    /*
     * The regression this card exists to fix: a desktop user was shown a card
     * that said "iPhone" everywhere, so nobody on a laptop pressed a button
     * that already worked.
     */
    expect(screen.queryByText(/Connect your iPhone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Add another iPhone/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect another device" })).toBeInTheDocument();

    // No Home Screen guidance on a browser that can already subscribe.
    expect(document.body.textContent).not.toMatch(/Home Screen/i);
    // And still no developer or transport vocabulary anywhere.
    expect(document.body.textContent).not.toMatch(
      /shortcut|personal automation|bearer|api token|read_write|scope|webhook|n8n|vapid|endpoint|p256dh/i,
    );
  });

  it("says Notifications Enabled once this browser is subscribed", async () => {
    installPushBrowser({ current: browserSubscription(), permission: "granted" });
    getCurrentStateAction.mockResolvedValue({ ok: true, data: { connected: true } });
    render(<NotificationDevicesCard initial={overview({ deviceCount: 2 })} />);

    expect(
      await screen.findByRole("heading", { name: "Notifications Enabled" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 devices connected")).toBeInTheDocument();
  });

  it("sends a derived device label when registering", async () => {
    setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    );
    const browser = installPushBrowser();
    subscribeAction.mockResolvedValue({ ok: true, data: { deviceCount: 1, paired: false } });
    const user = userEvent.setup();
    render(<NotificationDevicesCard initial={overview()} />);

    await user.click(await screen.findByRole("button", { name: "Enable Notifications" }));
    const dialog = await screen.findByRole("dialog", { name: "Enable notifications" });
    await user.click(within(dialog).getByRole("button", { name: "Enable Notifications" }));

    await waitFor(() => expect(browser.requestPermission).toHaveBeenCalledOnce());
    expect(subscribeAction).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      expirationTime: null,
      keys: { p256dh: "public-key", auth: "auth-secret" },
      deviceLabel: "Windows · Chrome",
    });
  });

  it("lists connected devices and marks the current one", async () => {
    installPushBrowser({ current: browserSubscription(), permission: "granted" });
    getCurrentStateAction.mockResolvedValue({ ok: true, data: { connected: true } });
    listDevicesAction.mockResolvedValue({
      ok: true,
      data: {
        devices: [
          pushDevice({ id: "aaaa1111-1111-4111-8111-111111111111", deviceLabel: "iPhone · Safari" }),
          pushDevice({
            id: "bbbb2222-2222-4222-8222-222222222222",
            deviceLabel: "Windows · Chrome",
            isCurrentDevice: true,
          }),
        ],
      },
    });
    render(<NotificationDevicesCard initial={overview({ deviceCount: 2 })} />);

    const list = await screen.findByRole("list", { name: undefined, hidden: false }).catch(() => null);
    void list;
    expect(await screen.findByText("Connected devices")).toBeInTheDocument();
    expect(screen.getByText("iPhone · Safari")).toBeInTheDocument();
    expect(screen.getByText("Windows · Chrome")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();

    // The endpoint is used to resolve "this device" but must never be rendered.
    expect(document.body.textContent).not.toContain(ENDPOINT);
    expect(document.body.textContent).not.toContain("public-key");
    expect(document.body.textContent).not.toContain("auth-secret");
  });

  it("renders a subscription with no label as Unnamed device", async () => {
    listDevicesAction.mockResolvedValue({
      ok: true,
      data: { devices: [pushDevice({ deviceLabel: null })] },
    });
    render(<NotificationDevicesCard initial={overview({ deviceCount: 1 })} />);

    expect(await screen.findByText("Unnamed device")).toBeInTheDocument();
  });

  it("disconnects one listed device without touching the others", async () => {
    const other = pushDevice({
      id: "aaaa1111-1111-4111-8111-111111111111",
      deviceLabel: "iPhone · Safari",
    });
    const here = pushDevice({
      id: "bbbb2222-2222-4222-8222-222222222222",
      deviceLabel: "Windows · Chrome",
      isCurrentDevice: true,
    });
    // This browser is one of the two, which is what makes the count line read
    // as a plain total rather than the "not this browser" variant.
    installPushBrowser({ current: browserSubscription(), permission: "granted" });
    getCurrentStateAction.mockResolvedValue({ ok: true, data: { connected: true } });
    listDevicesAction.mockResolvedValue({ ok: true, data: { devices: [other, here] } });
    disconnectDeviceAction.mockResolvedValue({ ok: true, data: { deviceCount: 1 } });
    const user = userEvent.setup();
    render(<NotificationDevicesCard initial={overview({ deviceCount: 2 })} />);

    await user.click(await screen.findByRole("button", { name: "Disconnect iPhone · Safari" }));

    await waitFor(() =>
      expect(disconnectDeviceAction).toHaveBeenCalledWith({ id: other.id }),
    );
    // Removing another device must never unsubscribe this browser.
    expect(unsubscribeAction).not.toHaveBeenCalled();
    expect(await screen.findByText("1 device connected")).toBeInTheDocument();
  });

  it("creates a short-lived QR setup intent without changing existing devices", async () => {
    const user = userEvent.setup();
    createPairingAction.mockResolvedValue({
      ok: true,
      data: { qrSvg: QR_SVG, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
    });
    render(<NotificationDevicesCard initial={overview({ deviceCount: 2 })} />);

    await user.click(await screen.findByRole("button", { name: "Connect another device" }));

    await waitFor(() => expect(createPairingAction).toHaveBeenCalledWith());
    const dialog = await screen.findByRole("dialog", { name: "Connect another device" });
    expect(
      within(dialog).getByRole("img", { name: "Short-lived device setup code" }),
    ).toBeInTheDocument();
    // The iOS Home Screen step survives here, because it is about the phone
    // being paired, and it says so rather than assuming everyone is on iOS.
    expect(within(dialog).getByText(/On iPhone, add GoHa to the Home Screen/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Android and desktop can skip this/i)).toBeInTheDocument();
    expect(unsubscribeAction).not.toHaveBeenCalled();
  });

  it("asks permission only after Enable Notifications is chosen", async () => {
    const browser = installPushBrowser();
    const user = userEvent.setup();
    subscribeAction.mockResolvedValue({ ok: true, data: { deviceCount: 1, paired: false } });
    render(<NotificationDevicesCard initial={overview()} />);

    expect(browser.requestPermission).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Enable Notifications" }));
    const dialog = await screen.findByRole("dialog", { name: "Enable notifications" });
    expect(browser.requestPermission).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Enable Notifications" }));

    await waitFor(() => expect(browser.requestPermission).toHaveBeenCalledOnce());
    expect(browser.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(ArrayBuffer),
    });
  });

  it("targets test and disconnect actions to this browser subscription only", async () => {
    const subscription = browserSubscription();
    installPushBrowser({ current: subscription, permission: "granted" });
    getCurrentStateAction.mockResolvedValue({ ok: true, data: { connected: true } });
    sendTestAction.mockResolvedValue({ ok: true, data: { sent: true } });
    unsubscribeAction.mockResolvedValue({ ok: true, data: { deviceCount: 1 } });
    const user = userEvent.setup();
    render(<NotificationDevicesCard initial={overview({ deviceCount: 2 })} />);

    await user.click(await screen.findByRole("button", { name: "Send Test Notification" }));
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
  });

  it("recovers once when the browser holds another account's subscription", async () => {
    /*
     * Phase 5. The stale subscription belongs to a different GoHa account, so
     * the server refuses it. The browser discards that subscription, asks the
     * push service for a genuinely new endpoint, and retries exactly once.
     * Ownership is never transferred; the old endpoint is simply abandoned.
     */
    const stale = browserSubscription("https://push.example/owned-by-someone-else");
    const fresh = browserSubscription("https://push.example/brand-new");
    const browser = installPushBrowser({
      current: stale,
      permission: "granted",
      subscribeResults: [fresh],
    });
    subscribeAction
      .mockResolvedValueOnce({
        ok: false,
        code: "foreign_subscription",
        error: "That device connection is already associated with another account.",
      })
      .mockResolvedValueOnce({ ok: true, data: { deviceCount: 1, paired: false } });
    const user = userEvent.setup();
    render(<NotificationDevicesCard initial={overview()} />);

    await user.click(await screen.findByRole("button", { name: "Enable Notifications" }));
    const dialog = await screen.findByRole("dialog", { name: "Enable notifications" });
    await user.click(within(dialog).getByRole("button", { name: "Enable Notifications" }));

    await waitFor(() => expect(subscribeAction).toHaveBeenCalledTimes(2));
    expect(stale.unsubscribe).toHaveBeenCalledOnce();
    expect(browser.subscribe).toHaveBeenCalledOnce();
    expect(subscribeAction.mock.calls[0][0].endpoint).toBe(stale.endpoint);
    expect(subscribeAction.mock.calls[1][0].endpoint).toBe(fresh.endpoint);
  });

  it("retries the foreign subscription exactly once, never in a loop", async () => {
    const stale = browserSubscription("https://push.example/owned-a");
    const fresh = browserSubscription("https://push.example/owned-b");
    installPushBrowser({
      current: stale,
      permission: "granted",
      subscribeResults: [fresh],
    });
    // Both attempts are refused. The flow must give up, not keep asking.
    subscribeAction.mockResolvedValue({
      ok: false,
      code: "foreign_subscription",
      error: "That device connection is already associated with another account.",
    });
    const user = userEvent.setup();
    render(<NotificationDevicesCard initial={overview()} />);

    await user.click(await screen.findByRole("button", { name: "Enable Notifications" }));
    const dialog = await screen.findByRole("dialog", { name: "Enable notifications" });
    await user.click(within(dialog).getByRole("button", { name: "Enable Notifications" }));

    await waitFor(() => expect(subscribeAction).toHaveBeenCalledTimes(2));
    // Settle, then confirm no third attempt was queued.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(subscribeAction).toHaveBeenCalledTimes(2);
  });

  it("guides Home Screen installation only when Push API is unavailable", async () => {
    removePushBrowser();
    const user = userEvent.setup();
    render(<NotificationDevicesCard initial={overview()} />);

    await user.click(await screen.findByRole("button", { name: "Enable Notifications" }));
    const dialog = await screen.findByRole("dialog", { name: "Enable notifications" });
    expect(within(dialog).getByText("Add GoHa to your Home Screen first")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/does not allow a website to add itself/i),
    ).toBeInTheDocument();
    expect(subscribeAction).not.toHaveBeenCalled();
  });

  it("never sends an existing browser endpoint to the server before authentication", async () => {
    installPushBrowser({ current: browserSubscription(), permission: "granted" });
    render(<UnauthenticatedPushProbe />);

    await waitFor(() => expect(listOverviewAction).not.toHaveBeenCalled());
    expect(getCurrentStateAction).not.toHaveBeenCalled();
    expect(subscribeAction).not.toHaveBeenCalled();
  });
});
