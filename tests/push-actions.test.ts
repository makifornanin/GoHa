import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

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
  settingsRepo: {
    updateUserSettings: vi.fn(),
    getOrCreateUserSettings: vi.fn(),
  },
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

const {
  getCurrentPushStateAction,
  sendTestPushAction,
  subscribePushAction,
  unsubscribePushAction,
} = await import("@/app/(app)/settings/push-actions");

const endpoint = "https://push.example.test/device-one";
const subscriptionInput = {
  endpoint,
  expirationTime: null,
  keys: {
    p256dh: "A".repeat(87),
    auth: "B".repeat(22),
  },
};

function pairingRow(userId: string, secret: string) {
  const now = Date.now();
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId,
    secretHash: createHash("sha256").update(secret).digest("hex"),
    secretPrefix: secret.slice(0, 16),
    issuedAt: new Date(now - 1_000),
    expiresAt: new Date(now + 60_000),
    consumedAt: null,
    createdAt: new Date(now - 1_000),
    updatedAt: new Date(now - 1_000),
  };
}

describe("authenticated push Settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-a" });
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.validateEndpoint.mockResolvedValue({
      endpoint,
      hostname: "push.example.test",
      addresses: [{ address: "203.0.113.1", family: 4 }],
    });
    mocks.pushRepo.upsertSubscription.mockResolvedValue({ id: "subscription-a" });
    mocks.pushRepo.countActiveSubscriptions.mockResolvedValue(2);
    mocks.settingsRepo.updateUserSettings.mockResolvedValue({});
    mocks.pushRepo.listActiveSubscriptions.mockResolvedValue([]);
    mocks.pushRepo.deleteSubscription.mockResolvedValue(true);
  });

  it("derives subscription ownership from the session and supports multiple devices", async () => {
    const result = await subscribePushAction(subscriptionInput);

    expect(result).toEqual({ ok: true, data: { deviceCount: 2, paired: false } });
    expect(mocks.pushRepo.upsertSubscription).toHaveBeenCalledWith("user-a", {
      endpoint,
      p256dh: subscriptionInput.keys.p256dh,
      auth: subscriptionInput.keys.auth,
      expirationTime: null,
      deviceLabel: null,
    });
    expect(mocks.settingsRepo.updateUserSettings).toHaveBeenCalledWith("user-a", {
      notificationsEnabled: true,
    });
  });

  it("rejects a staged code owned by a different signed-in account", async () => {
    const secret = `goha_pair_${"A".repeat(43)}`;
    const row = pairingRow("user-b", secret);
    mocks.cookieGet.mockReturnValue({ value: row.secretHash });
    mocks.pushRepo.getPairingSessionByHash.mockResolvedValue(row);

    const result = await subscribePushAction(subscriptionInput);

    expect(result).toEqual({
      ok: false,
      error: "Sign in to the GoHa account that created this setup code.",
    });
    expect(mocks.pushRepo.consumePairingSession).not.toHaveBeenCalled();
    expect(mocks.pushRepo.upsertSubscription).not.toHaveBeenCalled();
  });

  it("atomically consumes a correct code before saving the device", async () => {
    const secret = `goha_pair_${"C".repeat(43)}`;
    const row = pairingRow("user-a", secret);
    mocks.cookieGet.mockReturnValue({ value: row.secretHash });
    mocks.pushRepo.getPairingSessionByHash.mockResolvedValue(row);
    mocks.pushRepo.consumePairingSession.mockResolvedValue({
      ...row,
      consumedAt: new Date(),
    });

    const result = await subscribePushAction(subscriptionInput);

    expect(result.ok).toBe(true);
    expect(mocks.pushRepo.consumePairingSession).toHaveBeenCalledWith(
      "user-a",
      row.secretHash,
    );
    expect(mocks.pushRepo.consumePairingSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.pushRepo.upsertSubscription.mock.invocationCallOrder[0],
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "goha_push_pairing",
      "",
      expect.objectContaining({ maxAge: 0, httpOnly: true }),
    );
  });

  it("never transfers an endpoint that the repository reports as cross-owned", async () => {
    mocks.pushRepo.upsertSubscription.mockResolvedValue(null);

    const result = await subscribePushAction(subscriptionInput);

    // The refusal itself is unchanged. It now also carries a machine-readable
    // code so the browser can discard its stale subscription and ask the push
    // service for a fresh endpoint, rather than leaving the person stuck.
    expect(result).toEqual({
      ok: false,
      code: "foreign_subscription",
      error: "That device connection is already associated with another account.",
    });
    expect(mocks.settingsRepo.updateUserSettings).not.toHaveBeenCalled();
  });

  it("checks and disconnects only the authenticated user's exact endpoint", async () => {
    mocks.pushRepo.getSubscriptionByEndpoint.mockResolvedValue({
      id: "subscription-a",
      disabledAt: null,
      expirationTime: null,
    });
    await expect(getCurrentPushStateAction({ endpoint })).resolves.toEqual({
      ok: true,
      data: { connected: true },
    });

    mocks.pushRepo.countActiveSubscriptions.mockResolvedValue(0);
    await expect(unsubscribePushAction({ endpoint })).resolves.toEqual({
      ok: true,
      data: { deviceCount: 0 },
    });
    expect(mocks.pushRepo.deleteSubscriptionByEndpoint).toHaveBeenCalledWith("user-a", endpoint);
    expect(mocks.settingsRepo.updateUserSettings).toHaveBeenCalledWith("user-a", {
      notificationsEnabled: false,
    });
  });

  it("targets a test notification to one owned subscription", async () => {
    mocks.pushRepo.getSubscriptionByEndpoint.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000099",
      disabledAt: null,
      expirationTime: null,
    });
    mocks.settingsRepo.getOrCreateUserSettings.mockResolvedValue({ timezone: "Asia/Manila" });
    mocks.automationRepo.claimNotification.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000088",
    });
    mocks.sendOne.mockResolvedValue({
      attempted: 1,
      succeeded: 1,
      permanentFailures: 0,
      transientFailures: 0,
      skipped: 0,
      reason: "delivered",
      results: [],
    });

    await expect(sendTestPushAction({ endpoint })).resolves.toEqual({
      ok: true,
      data: { sent: true },
    });
    expect(mocks.automationRepo.claimNotification).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ kind: "test" }),
    );
    expect(mocks.sendOne).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        subscriptionId: "00000000-0000-4000-8000-000000000099",
        notificationId: "00000000-0000-4000-8000-000000000088",
      }),
    );
  });
});
