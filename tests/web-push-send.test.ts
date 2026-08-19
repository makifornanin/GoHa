import { Agent } from "node:https";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PushDelivery, PushSubscriptionRecord } from "@/db/types";
import { UnsafePushEndpointError } from "@/lib/push/endpoint";
import {
  createPushSender,
  DEFAULT_PUSH_TTL_SECONDS,
  getWebPushPublicConfig,
  PUSH_REQUEST_TIMEOUT_MS,
  readVapidConfig,
  VapidConfigurationError,
  type PushSenderDependencies,
  type PushSenderStore,
} from "@/lib/push/web-push";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const NOTIFICATION_ID = "00000000-0000-4000-8000-000000000003";
const SUBSCRIPTION_ONE = "00000000-0000-4000-8000-000000000004";
const SUBSCRIPTION_TWO = "00000000-0000-4000-8000-000000000005";
const DELIVERY_ONE = "00000000-0000-4000-8000-000000000006";
const DELIVERY_TWO = "00000000-0000-4000-8000-000000000007";
const ATTEMPT_TOKEN = "00000000-0000-4000-8000-000000000008";
const NOW = new Date("2026-08-18T12:00:00.000Z");

function subscription(id: string, endpoint: string): PushSubscriptionRecord {
  return {
    id,
    userId: USER_ID,
    endpoint,
    p256dh: "A".repeat(87),
    auth: "B".repeat(22),
    expirationTime: null,
    deviceLabel: null,
    disabledAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    failureCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function delivery(
  subscriptionId: string,
  overrides: Partial<PushDelivery> = {},
): PushDelivery {
  return {
    id: subscriptionId === SUBSCRIPTION_ONE ? DELIVERY_ONE : DELIVERY_TWO,
    userId: USER_ID,
    notificationId: NOTIFICATION_ID,
    subscriptionId,
    subscriptionEndpointHash: "a".repeat(64),
    attemptCount: 1,
    lastAttemptAt: NOW,
    attemptToken: ATTEMPT_TOKEN,
    attemptExpiresAt: new Date(NOW.getTime() + 120_000),
    acceptedAt: null,
    lastFailureAt: null,
    permanentFailureAt: null,
    lastStatusCode: null,
    lastErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeStore(
  subscriptions: PushSubscriptionRecord[],
  overrides: Partial<PushSenderStore> = {},
): PushSenderStore {
  const base: PushSenderStore = {
    listActiveSubscriptions: vi.fn(async (userId) =>
      userId === USER_ID ? subscriptions : [],
    ),
    notificationBelongsToUser: vi.fn(
      async (userId, notificationId) =>
        userId === USER_ID && notificationId === NOTIFICATION_ID,
    ),
    acquireDeliveryAttempt: vi.fn(async (_userId, _notificationId, subscriptionId) => ({
      state: "acquired" as const,
      delivery: delivery(subscriptionId),
      attemptToken: ATTEMPT_TOKEN,
    })),
    markDeliveryAccepted: vi.fn(async () => true),
    markDeliveryTransientFailure: vi.fn(async () => true),
    markDeliveryPermanentFailure: vi.fn(async () => true),
    markSubscriptionSuccess: vi.fn(async () => true),
    markSubscriptionFailure: vi.fn(async () => true),
    disableSubscription: vi.fn(async () => true),
    deleteSubscription: vi.fn(async () => true),
  };
  return { ...base, ...overrides };
}

const providerSuccess: PushSenderDependencies["providerSend"] = async () => ({
  statusCode: 201,
  body: "",
  headers: {},
});

function makeSender(
  store: PushSenderStore,
  providerSend: PushSenderDependencies["providerSend"] = providerSuccess,
  resolveEndpoint: PushSenderDependencies["resolveEndpoint"] = async (endpoint) => ({
    endpoint,
    hostname: new URL(endpoint).hostname,
    addresses: [{ address: "1.1.1.1", family: 4 }],
  }),
) {
  return createPushSender({
    store,
    providerSend,
    resolveEndpoint,
    createAgent: () => new Agent(),
    getVapidConfig: () => ({
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "mailto:owner@example.com",
    }),
    now: () => NOW,
  });
}

const payload = {
  title: "GoHa is connected",
  body: "Smart notifications are ready on this device.",
  url: "/today",
};

describe("Web Push VAPID configuration", () => {
  const publicBytes = Buffer.alloc(65, 1);
  publicBytes[0] = 0x04;
  const validEnv = {
    VAPID_PUBLIC_KEY: publicBytes.toString("base64url"),
    VAPID_PRIVATE_KEY: Buffer.alloc(32, 2).toString("base64url"),
    VAPID_SUBJECT: "mailto:owner@example.com",
  };

  it("validates all server values but exposes only readiness and the public key", () => {
    expect(readVapidConfig(validEnv)).toEqual({
      publicKey: validEnv.VAPID_PUBLIC_KEY,
      privateKey: validEnv.VAPID_PRIVATE_KEY,
      subject: validEnv.VAPID_SUBJECT,
    });
    const publicConfig = getWebPushPublicConfig(validEnv);
    expect(publicConfig).toEqual({ configured: true, publicKey: validEnv.VAPID_PUBLIC_KEY });
    expect(Object.keys(publicConfig)).toEqual(["configured", "publicKey"]);
    expect(JSON.stringify(publicConfig)).not.toContain(validEnv.VAPID_PRIVATE_KEY);
  });

  it("fails closed for missing or malformed configuration", () => {
    expect(() => readVapidConfig({})).toThrow(VapidConfigurationError);
    expect(
      getWebPushPublicConfig({ ...validEnv, VAPID_PRIVATE_KEY: "not-a-private-key" }),
    ).toEqual({ configured: false, publicKey: null });
  });
});

describe("scoped Web Push delivery", () => {
  it("sends nothing when the notification does not belong to the supplied user", async () => {
    const device = subscription(SUBSCRIPTION_ONE, "https://push.example.net/one");
    const store = makeStore([device]);
    const provider = vi.fn(providerSuccess);
    const sender = makeSender(store, provider);

    const result = await sender.sendNotificationToUser({
      userId: OTHER_USER_ID,
      notificationId: NOTIFICATION_ID,
      payload,
    });

    expect(result.reason).toBe("notification_not_owned");
    expect(result.attempted).toBe(0);
    expect(store.listActiveSubscriptions).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("targets exactly one owned active subscription for a test notification", async () => {
    const first = subscription(SUBSCRIPTION_ONE, "https://push.example.net/one");
    const second = subscription(SUBSCRIPTION_TWO, "https://push.example.net/two");
    const store = makeStore([first, second]);
    const provider = vi.fn(providerSuccess);
    const sender = makeSender(store, provider);

    const result = await sender.sendNotificationToSubscription({
      userId: USER_ID,
      subscriptionId: SUBSCRIPTION_TWO,
      notificationId: NOTIFICATION_ID,
      payload,
    });

    expect(result.succeeded).toBe(1);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0].endpoint).toBe(second.endpoint);
    expect(store.acquireDeliveryAttempt).toHaveBeenCalledWith(
      USER_ID,
      NOTIFICATION_ID,
      SUBSCRIPTION_TWO,
      NOW,
    );
  });

  it("does not call the provider again after the ledger records acceptance", async () => {
    const device = subscription(SUBSCRIPTION_ONE, "https://push.example.net/one");
    const accepted = delivery(device.id, {
      acceptedAt: NOW,
      attemptToken: null,
      attemptExpiresAt: null,
      lastStatusCode: 201,
    });
    const store = makeStore([device], {
      acquireDeliveryAttempt: vi.fn(async () => ({
        state: "already_succeeded" as const,
        delivery: accepted,
      })),
    });
    const provider = vi.fn(providerSuccess);
    const sender = makeSender(store, provider);

    const result = await sender.sendNotificationToUser({
      userId: USER_ID,
      notificationId: NOTIFICATION_ID,
      payload,
    });

    expect(result).toMatchObject({ attempted: 0, succeeded: 1 });
    expect(result.results[0].code).toBe("already_sent");
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("isolated provider failures", () => {
  it("removes a 410 subscription without blocking another device", async () => {
    const dead = subscription(SUBSCRIPTION_ONE, "https://push.example.net/dead-capability");
    const live = subscription(SUBSCRIPTION_TWO, "https://push.example.net/live-capability");
    const store = makeStore([dead, live]);
    const provider = vi.fn<PushSenderDependencies["providerSend"]>(async (target) => {
      if (target.endpoint === dead.endpoint) {
        throw Object.assign(new Error("provider body must not escape"), {
          statusCode: 410,
          endpoint: dead.endpoint,
          body: "private provider response",
        });
      }
      return { statusCode: 201, body: "", headers: {} };
    });
    const sender = makeSender(store, provider);

    const result = await sender.sendNotificationToUser({
      userId: USER_ID,
      notificationId: NOTIFICATION_ID,
      payload,
    });

    expect(result).toMatchObject({
      attempted: 2,
      succeeded: 1,
      permanentFailures: 1,
      transientFailures: 0,
    });
    expect(store.disableSubscription).toHaveBeenCalledWith(USER_ID, dead.id);
    expect(store.deleteSubscription).toHaveBeenCalledWith(USER_ID, dead.id);
    expect(store.markSubscriptionSuccess).toHaveBeenCalledWith(USER_ID, live.id);
    expect(JSON.stringify(result)).not.toContain(dead.endpoint);
    expect(JSON.stringify(result)).not.toContain("private provider response");
  });

  it("retains a subscription after a transient provider failure", async () => {
    const device = subscription(SUBSCRIPTION_ONE, "https://push.example.net/temporary");
    const store = makeStore([device]);
    const provider = vi.fn<PushSenderDependencies["providerSend"]>(async () => {
      throw Object.assign(new Error("temporary upstream response"), { statusCode: 503 });
    });
    const sender = makeSender(store, provider);

    const result = await sender.sendNotificationToUser({
      userId: USER_ID,
      notificationId: NOTIFICATION_ID,
      payload,
    });

    expect(result).toMatchObject({ attempted: 1, succeeded: 0, transientFailures: 1 });
    expect(result.results[0]).toMatchObject({ code: "provider_503", providerStatus: 503 });
    expect(store.markSubscriptionFailure).toHaveBeenCalledWith(USER_ID, device.id);
    expect(store.disableSubscription).not.toHaveBeenCalled();
    expect(store.deleteSubscription).not.toHaveBeenCalled();
  });

  it("retains the subscription and avoids the provider during transient DNS failure", async () => {
    const device = subscription(SUBSCRIPTION_ONE, "https://push.example.net/temporary-dns");
    const store = makeStore([device]);
    const provider = vi.fn(providerSuccess);
    const sender = makeSender(store, provider, async () => {
      throw new UnsafePushEndpointError("resolution_failed");
    });

    const result = await sender.sendNotificationToUser({
      userId: USER_ID,
      notificationId: NOTIFICATION_ID,
      payload,
    });

    expect(result).toMatchObject({ attempted: 1, transientFailures: 1 });
    expect(provider).not.toHaveBeenCalled();
    expect(store.deleteSubscription).not.toHaveBeenCalled();
  });

  it("uses bounded TTL, timeout, VAPID-per-request, and no mutable global config", async () => {
    const device = subscription(SUBSCRIPTION_ONE, "https://push.example.net/options");
    const store = makeStore([device]);
    const provider = vi.fn(providerSuccess);
    const sender = makeSender(store, provider);

    await sender.sendNotificationToUser({
      userId: USER_ID,
      notificationId: NOTIFICATION_ID,
      payload,
    });

    const options = provider.mock.calls[0][2];
    expect(options).toMatchObject({
      TTL: DEFAULT_PUSH_TTL_SECONDS,
      timeout: PUSH_REQUEST_TIMEOUT_MS,
      urgency: "normal",
      contentEncoding: "aes128gcm",
      vapidDetails: {
        publicKey: "public-key",
        privateKey: "private-key",
        subject: "mailto:owner@example.com",
      },
    });
    expect(options.topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(options.agent).toBeInstanceOf(Agent);
  });
});
