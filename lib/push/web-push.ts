import "server-only";

import { createHash } from "node:crypto";
import type { Agent } from "node:https";

import webPush, {
  type PushSubscription as WebPushSubscription,
  type RequestOptions as WebPushRequestOptions,
  type SendResult as WebPushSendResult,
  type Urgency,
} from "web-push";

import * as pushRepo from "@/db/repositories/push";
import type { PushSubscriptionRecord } from "@/db/types";
import {
  createPinnedPushAgent,
  endpointValidationFailureIsTransient,
  UnsafePushEndpointError,
  validateAndResolvePushEndpoint,
  type ValidatedPushEndpoint,
} from "@/lib/push/endpoint";
import {
  pushNotificationIdSchema,
  pushNotificationPayloadSchema,
  pushTtlSecondsSchema,
  pushUrgencySchema,
  type PushNotificationPayload,
} from "@/lib/validations/push";

export const DEFAULT_PUSH_TTL_SECONDS = 5 * 60;
export const PUSH_REQUEST_TIMEOUT_MS = 10_000;
export const MAX_PUSH_PAYLOAD_BYTES = 3_072;

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type VapidEnvironment = {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

export class VapidConfigurationError extends Error {
  readonly code: "missing" | "invalid";

  constructor(code: "missing" | "invalid") {
    super("Web Push is not configured correctly on the server.");
    this.name = "VapidConfigurationError";
    this.code = code;
  }
}

function decodedBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

function validVapidSubject(value: string): boolean {
  try {
    const subject = new URL(value);
    if (subject.protocol === "mailto:") {
      return subject.pathname.includes("@") && subject.pathname.length <= 254;
    }
    if (subject.protocol !== "https:" || !subject.hostname) return false;
    const hostname = subject.hostname.toLowerCase().replace(/\.$/, "");
    return (
      !subject.username &&
      !subject.password &&
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/** Reads and validates all VAPID values together; partial configuration fails closed. */
export function readVapidConfig(
  env: VapidEnvironment = process.env as unknown as VapidEnvironment,
): VapidConfig {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) throw new VapidConfigurationError("missing");

  const publicBytes = decodedBase64Url(publicKey);
  const privateBytes = decodedBase64Url(privateKey);
  if (
    !publicBytes ||
    publicBytes.length !== 65 ||
    publicBytes[0] !== 0x04 ||
    !privateBytes ||
    privateBytes.length !== 32 ||
    !validVapidSubject(subject)
  ) {
    throw new VapidConfigurationError("invalid");
  }

  return { publicKey, privateKey, subject };
}

/** Safe for an authenticated Settings action: never returns private key or subject. */
export function getWebPushPublicConfig(
  env: VapidEnvironment = process.env as unknown as VapidEnvironment,
): { configured: boolean; publicKey: string | null } {
  try {
    const config = readVapidConfig(env);
    return { configured: true, publicKey: config.publicKey };
  } catch {
    return { configured: false, publicKey: null };
  }
}

export type PushDeliveryCode =
  | "sent"
  | "sent_ledger_conflict"
  | "already_sent"
  | "already_permanent"
  | "delivery_in_progress"
  | "not_owned"
  | "unsafe_endpoint"
  | "endpoint_resolution_failed"
  | "invalid_subscription"
  | "network_error"
  | `provider_${number}`
  | "unexpected_error";

export type PushDeviceDeliveryResult = {
  subscriptionId: string;
  attempted: boolean;
  outcome: "succeeded" | "permanent_failure" | "transient_failure" | "skipped";
  code: PushDeliveryCode;
  /** Numeric provider status is safe; provider response bodies are never returned. */
  providerStatus: number | null;
};

export type PushDeliverySummary = {
  attempted: number;
  succeeded: number;
  permanentFailures: number;
  transientFailures: number;
  skipped: number;
  reason:
    | "delivered"
    | "no_active_subscriptions"
    | "subscription_not_active"
    | "notification_not_owned";
  results: PushDeviceDeliveryResult[];
};

export type PushNotificationInput = {
  userId: string;
  /** Must be an owned notification_log id, not merely a caller-created key. */
  notificationId: string;
  payload: PushNotificationPayload;
  ttlSeconds?: number;
  urgency?: Urgency;
};

export type SingleSubscriptionPushInput = PushNotificationInput & {
  subscriptionId: string;
};

type ProviderSend = (
  subscription: WebPushSubscription,
  payload: string,
  options: WebPushRequestOptions,
) => Promise<WebPushSendResult>;

export type PushSenderStore = Pick<
  typeof pushRepo,
  | "listActiveSubscriptions"
  | "notificationBelongsToUser"
  | "acquireDeliveryAttempt"
  | "markDeliveryAccepted"
  | "markDeliveryTransientFailure"
  | "markDeliveryPermanentFailure"
  | "markSubscriptionSuccess"
  | "markSubscriptionFailure"
  | "disableSubscription"
  | "deleteSubscription"
>;

export type PushSenderDependencies = {
  store: PushSenderStore;
  providerSend: ProviderSend;
  resolveEndpoint: typeof validateAndResolvePushEndpoint;
  createAgent: (validated: ValidatedPushEndpoint) => Agent;
  getVapidConfig: () => VapidConfig;
  now: () => Date;
};

function topicForNotification(notificationId: string): string {
  return createHash("sha256").update(notificationId, "utf8").digest("base64url").slice(0, 32);
}

function providerStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null;
}

/** Uses library messages only for classification; the text is never returned, stored, or logged. */
function isInvalidLocalSubscription(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return [
    "The subscription p256dh value should be 65 bytes long",
    "The subscription auth key should be 16 bytes long",
    "Public key is not valid for specified curve",
    "To send a message with a payload",
  ].some((known) => error.message.includes(known));
}

function summary(
  results: PushDeviceDeliveryResult[],
  reason: PushDeliverySummary["reason"] = "delivered",
): PushDeliverySummary {
  return {
    attempted: results.filter((result) => result.attempted).length,
    succeeded: results.filter((result) => result.outcome === "succeeded").length,
    permanentFailures: results.filter((result) => result.outcome === "permanent_failure").length,
    transientFailures: results.filter((result) => result.outcome === "transient_failure").length,
    skipped: results.filter((result) => result.outcome === "skipped").length,
    reason,
    results,
  };
}

async function ignoreMutationFailure(operation: () => Promise<boolean>): Promise<boolean> {
  try {
    return await operation();
  } catch {
    // Provider errors can contain endpoint/response details. Nothing is logged
    // here; the bounded result code is the only detail that leaves this module.
    return false;
  }
}

export function createPushSender(dependencies: PushSenderDependencies): {
  sendNotificationToUser: (input: PushNotificationInput) => Promise<PushDeliverySummary>;
  sendNotificationToSubscription: (
    input: SingleSubscriptionPushInput,
  ) => Promise<PushDeliverySummary>;
} {
  async function deliverOne(
    input: PushNotificationInput,
    subscription: PushSubscriptionRecord,
    serializedPayload: string,
    vapid: VapidConfig,
    ttlSeconds: number,
    urgency: Urgency,
  ): Promise<PushDeviceDeliveryResult> {
    const claimed = await dependencies.store.acquireDeliveryAttempt(
      input.userId,
      input.notificationId,
      subscription.id,
      dependencies.now(),
    );

    if (claimed.state === "already_succeeded") {
      return {
        subscriptionId: subscription.id,
        attempted: false,
        outcome: "succeeded",
        code: "already_sent",
        providerStatus: claimed.delivery.lastStatusCode,
      };
    }
    if (claimed.state === "permanent_failure") {
      return {
        subscriptionId: subscription.id,
        attempted: false,
        outcome: "permanent_failure",
        code: "already_permanent",
        providerStatus: claimed.delivery.lastStatusCode,
      };
    }
    if (claimed.state === "busy") {
      return {
        subscriptionId: subscription.id,
        attempted: false,
        outcome: "transient_failure",
        code: "delivery_in_progress",
        providerStatus: null,
      };
    }
    if (claimed.state === "not_owned") {
      return {
        subscriptionId: subscription.id,
        attempted: false,
        outcome: "skipped",
        code: "not_owned",
        providerStatus: null,
      };
    }

    const { delivery, attemptToken } = claimed;
    let validated: ValidatedPushEndpoint;
    try {
      validated = await dependencies.resolveEndpoint(subscription.endpoint);
    } catch (error) {
      const transient = endpointValidationFailureIsTransient(error);
      if (transient) {
        await ignoreMutationFailure(() =>
          dependencies.store.markDeliveryTransientFailure(
            input.userId,
            delivery.id,
            attemptToken,
            { errorCode: "endpoint_resolution_failed", statusCode: null },
          ),
        );
        await ignoreMutationFailure(() =>
          dependencies.store.markSubscriptionFailure(input.userId, subscription.id),
        );
        return {
          subscriptionId: subscription.id,
          attempted: true,
          outcome: "transient_failure",
          code: "endpoint_resolution_failed",
          providerStatus: null,
        };
      }

      const code =
        error instanceof UnsafePushEndpointError
          ? `endpoint_${error.code}`
          : "unsafe_endpoint";
      await ignoreMutationFailure(() =>
        dependencies.store.markDeliveryPermanentFailure(
          input.userId,
          delivery.id,
          attemptToken,
          { errorCode: code, statusCode: null },
        ),
      );
      await ignoreMutationFailure(() =>
        dependencies.store.disableSubscription(input.userId, subscription.id),
      );
      await ignoreMutationFailure(() =>
        dependencies.store.deleteSubscription(input.userId, subscription.id),
      );
      return {
        subscriptionId: subscription.id,
        attempted: true,
        outcome: "permanent_failure",
        code: "unsafe_endpoint",
        providerStatus: null,
      };
    }

    const agent = dependencies.createAgent(validated);
    let response: WebPushSendResult;
    try {
      response = await dependencies.providerSend(
        {
          endpoint: validated.endpoint,
          expirationTime: subscription.expirationTime?.getTime() ?? null,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        serializedPayload,
        {
          vapidDetails: {
            subject: vapid.subject,
            publicKey: vapid.publicKey,
            privateKey: vapid.privateKey,
          },
          TTL: ttlSeconds,
          urgency,
          contentEncoding: "aes128gcm",
          timeout: PUSH_REQUEST_TIMEOUT_MS,
          topic: topicForNotification(input.notificationId),
          agent,
        },
      );
    } catch (error) {
      const statusCode = providerStatus(error);
      const permanent = statusCode === 404 || statusCode === 410 || isInvalidLocalSubscription(error);

      if (permanent) {
        const errorCode = statusCode ? `provider_${statusCode}` : "invalid_subscription";
        await ignoreMutationFailure(() =>
          dependencies.store.markDeliveryPermanentFailure(
            input.userId,
            delivery.id,
            attemptToken,
            { errorCode, statusCode },
          ),
        );
        await ignoreMutationFailure(() =>
          dependencies.store.disableSubscription(input.userId, subscription.id),
        );
        await ignoreMutationFailure(() =>
          dependencies.store.deleteSubscription(input.userId, subscription.id),
        );
        return {
          subscriptionId: subscription.id,
          attempted: true,
          outcome: "permanent_failure",
          code: statusCode ? `provider_${statusCode}` : "invalid_subscription",
          providerStatus: statusCode,
        };
      }

      const errorCode = statusCode ? `provider_${statusCode}` : "network_error";
      await ignoreMutationFailure(() =>
        dependencies.store.markDeliveryTransientFailure(
          input.userId,
          delivery.id,
          attemptToken,
          { errorCode, statusCode },
        ),
      );
      await ignoreMutationFailure(() =>
        dependencies.store.markSubscriptionFailure(input.userId, subscription.id),
      );
      return {
        subscriptionId: subscription.id,
        attempted: true,
        outcome: "transient_failure",
        code: statusCode ? `provider_${statusCode}` : "network_error",
        providerStatus: statusCode,
      };
    } finally {
      agent.destroy();
    }

    const recorded = await ignoreMutationFailure(() =>
      dependencies.store.markDeliveryAccepted(
        input.userId,
        delivery.id,
        attemptToken,
        response.statusCode,
      ),
    );
    await ignoreMutationFailure(() =>
      dependencies.store.markSubscriptionSuccess(input.userId, subscription.id),
    );
    return {
      subscriptionId: subscription.id,
      attempted: true,
      outcome: "succeeded",
      code: recorded ? "sent" : "sent_ledger_conflict",
      providerStatus: response.statusCode,
    };
  }

  async function send(
    input: PushNotificationInput,
    onlySubscriptionId?: string,
  ): Promise<PushDeliverySummary> {
    const notificationId = pushNotificationIdSchema.parse(input.notificationId);
    const payload = pushNotificationPayloadSchema.parse(input.payload);
    const ttlSeconds = pushTtlSecondsSchema.parse(
      input.ttlSeconds ?? DEFAULT_PUSH_TTL_SECONDS,
    );
    const urgency = pushUrgencySchema.parse(input.urgency ?? "normal");
    const serializedPayload = JSON.stringify(payload);
    if (Buffer.byteLength(serializedPayload, "utf8") > MAX_PUSH_PAYLOAD_BYTES) {
      throw new RangeError("The push payload exceeds the safe encrypted payload budget.");
    }

    const owned = await dependencies.store.notificationBelongsToUser(
      input.userId,
      notificationId,
    );
    if (!owned) return summary([], "notification_not_owned");

    const active = await dependencies.store.listActiveSubscriptions(input.userId);
    const subscriptions = onlySubscriptionId
      ? active.filter((subscription) => subscription.id === onlySubscriptionId)
      : active;
    if (subscriptions.length === 0) {
      return summary([], onlySubscriptionId ? "subscription_not_active" : "no_active_subscriptions");
    }

    // Loaded once, before any leases or provider requests. A broken global
    // configuration fails the operation as a whole rather than blaming devices.
    const vapid = dependencies.getVapidConfig();
    const settled = await Promise.allSettled(
      subscriptions.map((subscription) =>
        deliverOne(input, subscription, serializedPayload, vapid, ttlSeconds, urgency),
      ),
    );
    const results = settled.map<PushDeviceDeliveryResult>((result, index) =>
      result.status === "fulfilled"
        ? result.value
        : {
            subscriptionId: subscriptions[index].id,
            attempted: true,
            outcome: "transient_failure",
            code: "unexpected_error",
            providerStatus: null,
          },
    );
    return summary(results);
  }

  return {
    sendNotificationToUser: (input) => send(input),
    sendNotificationToSubscription: (input) => send(input, input.subscriptionId),
  };
}

const defaultSender = createPushSender({
  store: pushRepo,
  providerSend: (subscription, payload, options) =>
    webPush.sendNotification(subscription, payload, options),
  resolveEndpoint: validateAndResolvePushEndpoint,
  createAgent: createPinnedPushAgent,
  getVapidConfig: readVapidConfig,
  now: () => new Date(),
});

export const sendNotificationToUser = defaultSender.sendNotificationToUser;
export const sendNotificationToSubscription = defaultSender.sendNotificationToSubscription;
