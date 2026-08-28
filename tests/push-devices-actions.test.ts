import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Multi-device management: the device list and per-device disconnect.
 *
 * The database always allowed one user many subscriptions, and delivery always
 * fanned out to all of them. What was missing was any way to SEE or REVOKE
 * them. These cover the new surface, and above all the two things it must never
 * do: leak a capability URL to the browser, or let an id alone authorise a
 * delete.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  pushRepo: {
    countActiveSubscriptions: vi.fn(),
    getPairingSessionForUser: vi.fn(),
    getPairingSessionByHash: vi.fn(),
    replacePairingSession: vi.fn(),
    consumePairingSession: vi.fn(),
    upsertSubscription: vi.fn(),
    getSubscriptionByEndpoint: vi.fn(),
    deleteSubscriptionByEndpoint: vi.fn(),
    listActiveSubscriptions: vi.fn(),
    deleteSubscription: vi.fn(),
  },
  automationRepo: { claimNotification: vi.fn() },
  settingsRepo: { updateUserSettings: vi.fn(), getOrCreateUserSettings: vi.fn() },
  validateEndpoint: vi.fn(),
  sendOne: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }),
}));
vi.mock("@/db", () => ({
  pushRepo: mocks.pushRepo,
  automationRepo: mocks.automationRepo,
  settingsRepo: mocks.settingsRepo,
}));
vi.mock("@/lib/push/endpoint", () => ({
  validateAndResolvePushEndpoint: mocks.validateEndpoint,
}));
vi.mock("@/lib/push/web-push", () => ({
  getWebPushPublicConfig: () => ({ configured: true, publicKey: "valid-public-key" }),
  sendNotificationToSubscription: mocks.sendOne,
}));
vi.mock("@/lib/push/origin", () => ({
  getCanonicalAppOrigin: () => "https://goha.example",
}));

const { listPushDevicesAction, disconnectPushDeviceAction, subscribePushAction } = await import(
  "@/app/(app)/settings/push-actions"
);

const ENDPOINT_ONE = "https://push.example.test/device-one";
const ENDPOINT_TWO = "https://push.example.test/device-two";
const DEVICE_ONE = "aaaaaaaa-1111-4111-8111-111111111111";
const DEVICE_TWO = "bbbbbbbb-2222-4222-8222-222222222222";
const FOREIGN_DEVICE = "cccccccc-3333-4333-8333-333333333333";
const P256DH = "A".repeat(87);
const AUTH = "B".repeat(22);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: DEVICE_ONE,
    userId: "user-a",
    endpoint: ENDPOINT_ONE,
    p256dh: P256DH,
    auth: AUTH,
    expirationTime: null,
    deviceLabel: "Windows · Chrome",
    disabledAt: null,
    lastSuccessAt: new Date("2026-08-28T01:00:00.000Z"),
    lastFailureAt: null,
    failureCount: 0,
    createdAt: new Date("2026-08-27T09:00:00.000Z"),
    updatedAt: new Date("2026-08-27T09:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-a" });
  mocks.cookieGet.mockReturnValue(undefined);
  mocks.pushRepo.listActiveSubscriptions.mockResolvedValue([]);
  mocks.pushRepo.deleteSubscription.mockResolvedValue(true);
  mocks.pushRepo.countActiveSubscriptions.mockResolvedValue(1);
  mocks.settingsRepo.updateUserSettings.mockResolvedValue({});
});

describe("listing connected devices", () => {
  it("scopes the query to the session user and returns only safe fields", async () => {
    mocks.pushRepo.listActiveSubscriptions.mockResolvedValue([row()]);

    const result = await listPushDevicesAction();

    expect(mocks.pushRepo.listActiveSubscriptions).toHaveBeenCalledWith("user-a");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.devices).toEqual([
      {
        id: DEVICE_ONE,
        deviceLabel: "Windows · Chrome",
        createdAt: "2026-08-27T09:00:00.000Z",
        lastSuccessAt: "2026-08-28T01:00:00.000Z",
        isCurrentDevice: false,
      },
    ]);
  });

  it("never exposes the endpoint, the encryption keys, or delivery diagnostics", async () => {
    mocks.pushRepo.listActiveSubscriptions.mockResolvedValue([row()]);

    const serialized = JSON.stringify(await listPushDevicesAction());

    /*
     * The endpoint is a capability URL: anyone holding it can push to that
     * device. p256dh and auth decrypt the payload. None of it may cross to the
     * browser, and neither may failure counts, which are operational detail.
     */
    expect(serialized).not.toContain("push.example.test");
    expect(serialized).not.toContain(P256DH);
    expect(serialized).not.toContain(AUTH);
    expect(serialized).not.toContain("failureCount");
    expect(serialized).not.toContain("disabledAt");
    expect(serialized).not.toContain("userId");
  });

  it("marks the requesting browser's own subscription", async () => {
    mocks.pushRepo.listActiveSubscriptions.mockResolvedValue([
      row(),
      row({ id: DEVICE_TWO, endpoint: ENDPOINT_TWO, deviceLabel: "iPhone · Safari" }),
    ]);

    const result = await listPushDevicesAction({ currentEndpoint: ENDPOINT_TWO });

    if (!result.ok) throw new Error("expected ok");
    expect(result.data.devices.map((d) => d.isCurrentDevice)).toEqual([false, true]);
  });

  it("marks nothing when the endpoint belongs to another account", async () => {
    // Rows are already scoped to the session user, so an endpoint the user does
    // not own simply matches nothing. A guessed endpoint reveals no ownership.
    mocks.pushRepo.listActiveSubscriptions.mockResolvedValue([row()]);

    const result = await listPushDevicesAction({
      currentEndpoint: "https://push.example.test/somebody-else",
    });

    if (!result.ok) throw new Error("expected ok");
    expect(result.data.devices[0].isCurrentDevice).toBe(false);
  });

  it("keeps a null label as null so the UI owns the placeholder", async () => {
    mocks.pushRepo.listActiveSubscriptions.mockResolvedValue([row({ deviceLabel: null })]);

    const result = await listPushDevicesAction();

    if (!result.ok) throw new Error("expected ok");
    expect(result.data.devices[0].deviceLabel).toBeNull();
  });

  it("still lists devices when the supplied endpoint is malformed", async () => {
    mocks.pushRepo.listActiveSubscriptions.mockResolvedValue([row()]);

    const result = await listPushDevicesAction({ currentEndpoint: "not-a-url" });

    // A bad hint must not cost someone their device list.
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.devices).toHaveLength(1);
    expect(result.data.devices[0].isCurrentDevice).toBe(false);
  });

  it("lists two devices for one user", async () => {
    mocks.pushRepo.listActiveSubscriptions.mockResolvedValue([
      row(),
      row({ id: DEVICE_TWO, endpoint: ENDPOINT_TWO, deviceLabel: "iPhone · Safari" }),
    ]);

    const result = await listPushDevicesAction();

    if (!result.ok) throw new Error("expected ok");
    expect(result.data.devices).toHaveLength(2);
    expect(result.data.devices.map((d) => d.deviceLabel)).toEqual([
      "Windows · Chrome",
      "iPhone · Safari",
    ]);
  });
});

describe("disconnecting one device", () => {
  it("deletes only through the user-scoped repository call", async () => {
    const result = await disconnectPushDeviceAction({ id: DEVICE_ONE });

    expect(mocks.pushRepo.deleteSubscription).toHaveBeenCalledWith("user-a", DEVICE_ONE);
    expect(result).toEqual({ ok: true, data: { deviceCount: 1 } });
  });

  it("cannot delete another user's subscription", async () => {
    // deleteSubscription filters on user_id, so a foreign id removes nothing.
    mocks.pushRepo.deleteSubscription.mockResolvedValue(false);

    const result = await disconnectPushDeviceAction({ id: FOREIGN_DEVICE });

    expect(mocks.pushRepo.deleteSubscription).toHaveBeenCalledWith("user-a", FOREIGN_DEVICE);
    expect(result).toEqual({ ok: false, error: "That device is no longer connected." });
    expect(mocks.settingsRepo.updateUserSettings).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a uuid before touching the database", async () => {
    const result = await disconnectPushDeviceAction({ id: "not-a-uuid" });

    expect(result).toEqual({ ok: false, error: "That device is not valid." });
    expect(mocks.pushRepo.deleteSubscription).not.toHaveBeenCalled();
  });

  it("keeps notifications on while another device remains", async () => {
    mocks.pushRepo.countActiveSubscriptions.mockResolvedValue(1);

    await disconnectPushDeviceAction({ id: DEVICE_ONE });

    expect(mocks.settingsRepo.updateUserSettings).not.toHaveBeenCalled();
  });

  it("turns notifications off when the last device is removed", async () => {
    mocks.pushRepo.countActiveSubscriptions.mockResolvedValue(0);

    await disconnectPushDeviceAction({ id: DEVICE_ONE });

    expect(mocks.settingsRepo.updateUserSettings).toHaveBeenCalledWith("user-a", {
      notificationsEnabled: false,
    });
  });
});

describe("registration with device labels", () => {
  const subscriptionInput = {
    endpoint: ENDPOINT_ONE,
    expirationTime: null,
    keys: { p256dh: P256DH, auth: AUTH },
  };

  beforeEach(() => {
    mocks.validateEndpoint.mockResolvedValue({
      endpoint: ENDPOINT_ONE,
      hostname: "push.example.test",
      addresses: [{ address: "203.0.113.1", family: 4 }],
    });
    mocks.pushRepo.upsertSubscription.mockResolvedValue({ id: DEVICE_ONE });
  });

  it("stores a supplied device label", async () => {
    await subscribePushAction({ ...subscriptionInput, deviceLabel: "Windows · Edge" });

    expect(mocks.pushRepo.upsertSubscription).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ deviceLabel: "Windows · Edge" }),
    );
  });

  it("accepts a subscription with no label at all", async () => {
    await subscribePushAction(subscriptionInput);

    expect(mocks.pushRepo.upsertSubscription).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ deviceLabel: null }),
    );
  });

  it("registering device B does not replace device A", async () => {
    /*
     * The upsert conflict target is the endpoint, not the user, so a second
     * browser is a second row. This asserts the action carries each endpoint
     * through untouched rather than collapsing them onto one another.
     */
    await subscribePushAction({ ...subscriptionInput, deviceLabel: "iPhone · Safari" });

    mocks.validateEndpoint.mockResolvedValue({
      endpoint: ENDPOINT_TWO,
      hostname: "push.example.test",
      addresses: [{ address: "203.0.113.1", family: 4 }],
    });
    mocks.pushRepo.countActiveSubscriptions.mockResolvedValue(2);
    const result = await subscribePushAction({
      ...subscriptionInput,
      endpoint: ENDPOINT_TWO,
      deviceLabel: "Windows · Chrome",
    });

    expect(mocks.pushRepo.upsertSubscription).toHaveBeenNthCalledWith(
      1,
      "user-a",
      expect.objectContaining({ endpoint: ENDPOINT_ONE, deviceLabel: "iPhone · Safari" }),
    );
    expect(mocks.pushRepo.upsertSubscription).toHaveBeenNthCalledWith(
      2,
      "user-a",
      expect.objectContaining({ endpoint: ENDPOINT_TWO, deviceLabel: "Windows · Chrome" }),
    );
    expect(result).toMatchObject({ ok: true, data: { deviceCount: 2 } });
  });

  it("reports a foreign subscription with a code the browser can act on", async () => {
    /*
     * The upsert's ownership guard matched no row: the endpoint belongs to a
     * different account. Ownership must NEVER move. The code exists so the
     * browser can discard its stale subscription and request a fresh endpoint,
     * which is the only safe recovery.
     */
    mocks.pushRepo.upsertSubscription.mockResolvedValue(null);

    const result = await subscribePushAction(subscriptionInput);

    expect(result).toEqual({
      ok: false,
      code: "foreign_subscription",
      error: "That device connection is already associated with another account.",
    });
    expect(mocks.settingsRepo.updateUserSettings).not.toHaveBeenCalled();
  });
});
