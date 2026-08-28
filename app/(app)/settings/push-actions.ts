"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { z } from "zod";

import { automationRepo, pushRepo, settingsRepo } from "@/db";
import { zonedToday } from "@/lib/date";
import { getCanonicalAppOrigin } from "@/lib/push/origin";
import {
  createPairingSecret,
  pairingHashDecision,
} from "@/lib/push/pairing";
import {
  PUSH_PAIRING_COOKIE,
  pushPairingCookieOptions,
} from "@/lib/push/pairing-cookie";
import { validateAndResolvePushEndpoint } from "@/lib/push/endpoint";
import {
  getWebPushPublicConfig,
  sendNotificationToSubscription,
} from "@/lib/push/web-push";
import { requireUser } from "@/lib/session";
import {
  PUSH_ENDPOINT_MAX,
  pushSubscriptionIdSchema,
  pushSubscriptionSchema,
  type PushSubscriptionInput,
} from "@/lib/validations/push";

export type ActionResult<T> =
  | { ok: true; data: T }
  /**
   * `code` is an optional machine-readable reason, for the few failures a
   * client can actually act on. `error` stays the only thing shown to a person.
   */
  | { ok: false; error: string; code?: PushActionErrorCode };

/** The browser holds a subscription owned by a DIFFERENT GoHa account. */
export type PushActionErrorCode = "foreign_subscription";

export type PushOverview = {
  deviceCount: number;
  pendingPairing: { expiresAt: string } | null;
  vapidPublicKey: string | null;
  pushConfigured: boolean;
};

export type StagedPairingState =
  | "none"
  | "valid"
  | "wrong_account"
  | "expired"
  | "consumed";

const endpointInputSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .min(9)
    .max(PUSH_ENDPOINT_MAX)
    .transform((value, context) => {
      try {
        const url = new URL(value);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          (url.port && url.port !== "443")
        ) {
          throw new Error("unsafe");
        }
        return url.href;
      } catch {
        context.addIssue({ code: "custom", message: "That device connection is not valid." });
        return z.NEVER;
      }
    }),
});

const GENERIC_ERROR = "Something went wrong. Please try again.";
const PAIRING_UNAVAILABLE = "That setup code has expired. Create a new one in Settings.";

function safeLog(label: string, error: unknown) {
  // Push errors may carry endpoint URLs or provider bodies. Only the error
  // class is useful here; capabilities and one-time secrets are never logged.
  console.error(label, error instanceof Error ? error.name : "Error");
}

async function clearPairingCookie() {
  const store = await cookies();
  store.set(PUSH_PAIRING_COOKIE, "", {
    ...pushPairingCookieOptions(new Date(0)),
    maxAge: 0,
  });
}

async function presentedPairingHash(): Promise<string | null> {
  return (await cookies()).get(PUSH_PAIRING_COOKIE)?.value ?? null;
}

/** Initial state for the consumer card. No endpoint or encryption key leaves the server. */
export async function listPushOverviewAction(): Promise<PushOverview> {
  const user = await requireUser();
  const [deviceCount, pairing] = await Promise.all([
    pushRepo.countActiveSubscriptions(user.id),
    pushRepo.getPairingSessionForUser(user.id),
  ]);
  const now = Date.now();
  const pendingPairing =
    pairing &&
    !pairing.consumedAt &&
    pairing.issuedAt.getTime() <= now &&
    pairing.expiresAt.getTime() > now
      ? { expiresAt: pairing.expiresAt.toISOString() }
      : null;
  const push = getWebPushPublicConfig();

  return {
    deviceCount,
    pendingPairing,
    vapidPublicKey: push.publicKey,
    pushConfigured: push.configured,
  };
}

/** Create a one-time setup URL in an SVG QR. The raw secret is never returned as text. */
export async function createPushPairingAction(): Promise<
  ActionResult<{ qrSvg: string; expiresAt: string }>
> {
  const user = await requireUser();
  if (!getWebPushPublicConfig().configured) {
    return {
      ok: false,
      error: "Notifications are not configured on this server yet.",
    };
  }

  try {
    const pairing = createPairingSecret();
    const setupUrl = `${getCanonicalAppOrigin()}/iphone/setup#pair=${pairing.secret}`;
    const qrSvg = await QRCode.toString(setupUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: "#000000", light: "#00000000" },
    });

    await pushRepo.replacePairingSession(user.id, {
      secretHash: pairing.secretHash,
      secretPrefix: pairing.secretPrefix,
      issuedAt: pairing.issuedAt,
      expiresAt: pairing.expiresAt,
    });
    revalidatePath("/settings");
    return { ok: true, data: { qrSvg, expiresAt: pairing.expiresAt.toISOString() } };
  } catch (error) {
    safeLog("createPushPairingAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** State for the phone setup page after normal authentication. */
export async function getStagedPairingStateAction(): Promise<
  ActionResult<{ state: StagedPairingState }>
> {
  const user = await requireUser();
  const secretHash = await presentedPairingHash();
  if (!secretHash) return { ok: true, data: { state: "none" } };

  try {
    const pairing = await pushRepo.getPairingSessionByHash(secretHash);
    if (!pairing) {
      await clearPairingCookie();
      return { ok: true, data: { state: "expired" } };
    }

    const decision = pairingHashDecision(pairing, user.id, secretHash);
    if (decision === "usable") return { ok: true, data: { state: "valid" } };
    if (decision === "wrong_user") {
      return { ok: true, data: { state: "wrong_account" } };
    }
    if (decision === "consumed") {
      await clearPairingCookie();
      return { ok: true, data: { state: "consumed" } };
    }

    await clearPairingCookie();
    return { ok: true, data: { state: "expired" } };
  } catch (error) {
    safeLog("getStagedPairingStateAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Register or refresh this browser's Push API subscription for the session user. */
export async function subscribePushAction(
  input: PushSubscriptionInput,
): Promise<ActionResult<{ deviceCount: number; paired: boolean }>> {
  const user = await requireUser();
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That notification connection is not valid.",
    };
  }
  if (!getWebPushPublicConfig().configured) {
    return { ok: false, error: "Notifications are not configured on this server yet." };
  }

  const expirationTime =
    parsed.data.expirationTime === null || parsed.data.expirationTime === undefined
      ? null
      : new Date(parsed.data.expirationTime);
  if (expirationTime && expirationTime.getTime() <= Date.now()) {
    return { ok: false, error: "That notification connection has already expired." };
  }

  try {
    const validated = await validateAndResolvePushEndpoint(parsed.data.endpoint);
    const secretHash = await presentedPairingHash();
    let paired = false;

    if (secretHash) {
      const pairing = await pushRepo.getPairingSessionByHash(secretHash);
      if (!pairing) {
        await clearPairingCookie();
        return { ok: false, error: PAIRING_UNAVAILABLE };
      }

      const decision = pairingHashDecision(pairing, user.id, secretHash);
      if (decision === "wrong_user") {
        return {
          ok: false,
          error: "Sign in to the GoHa account that created this setup code.",
        };
      }
      if (decision !== "usable") {
        await clearPairingCookie();
        return { ok: false, error: PAIRING_UNAVAILABLE };
      }

      // Consume before the endpoint write. This makes the code strictly
      // one-time even if two phones race; a failed write requires regeneration.
      const consumed = await pushRepo.consumePairingSession(user.id, secretHash);
      if (!consumed) {
        await clearPairingCookie();
        return { ok: false, error: PAIRING_UNAVAILABLE };
      }
      paired = true;
      await clearPairingCookie();
    }

    const saved = await pushRepo.upsertSubscription(user.id, {
      endpoint: validated.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      expirationTime,
      deviceLabel: parsed.data.deviceLabel ?? null,
    });
    if (!saved) {
      /*
       * The endpoint exists and belongs to someone else, so the upsert's
       * ownership guard matched no row. Ownership is NEVER transferred here.
       * The code lets the browser discard its stale subscription and ask the
       * push service for a genuinely new one, which is the only safe fix.
       */
      return {
        ok: false,
        code: "foreign_subscription",
        error: "That device connection is already associated with another account.",
      };
    }

    await settingsRepo.updateUserSettings(user.id, { notificationsEnabled: true });
    const deviceCount = await pushRepo.countActiveSubscriptions(user.id);
    revalidatePath("/settings");
    return { ok: true, data: { deviceCount, paired } };
  } catch (error) {
    safeLog("subscribePushAction failed", error);
    return { ok: false, error: "Could not enable notifications. Please try again." };
  }
}

/** Does this exact browser endpoint belong to the authenticated user? */
export async function getCurrentPushStateAction(input: {
  endpoint: string;
}): Promise<ActionResult<{ connected: boolean }>> {
  const user = await requireUser();
  const parsed = endpointInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That device connection is not valid." };

  try {
    const row = await pushRepo.getSubscriptionByEndpoint(user.id, parsed.data.endpoint);
    const connected = Boolean(
      row &&
        !row.disabledAt &&
        (!row.expirationTime || row.expirationTime.getTime() > Date.now()),
    );
    return { ok: true, data: { connected } };
  } catch (error) {
    safeLog("getCurrentPushStateAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Remove only this endpoint for this session user; other devices stay connected. */
export async function unsubscribePushAction(input: {
  endpoint: string;
}): Promise<ActionResult<{ deviceCount: number }>> {
  const user = await requireUser();
  const parsed = endpointInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That device connection is not valid." };

  try {
    await pushRepo.deleteSubscriptionByEndpoint(user.id, parsed.data.endpoint);
    const deviceCount = await pushRepo.countActiveSubscriptions(user.id);
    if (deviceCount === 0) {
      await settingsRepo.updateUserSettings(user.id, { notificationsEnabled: false });
    }
    revalidatePath("/settings");
    return { ok: true, data: { deviceCount } };
  } catch (error) {
    safeLog("unsubscribePushAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * One connected device, as the browser is allowed to see it.
 *
 * Deliberately NOT the database row. The endpoint, the p256dh and auth keys and
 * every delivery diagnostic stay server side: the endpoint is a capability URL
 * that anyone holding it could push to, and the keys decrypt the payload. What
 * the list needs is a name, when it joined and whether it is still working, so
 * that is all that crosses.
 */
export type PushDevice = {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSuccessAt: string | null;
  /** True for the subscription belonging to the browser making this request. */
  isCurrentDevice: boolean;
};

/**
 * The authenticated user's active push devices, newest first.
 *
 * `currentEndpoint` is optional and is used ONLY to mark one row as "this
 * device". It is matched against rows already scoped to the session user, so a
 * guessed or stolen endpoint reveals nothing: an endpoint belonging to someone
 * else simply matches no row in this user's list.
 */
export async function listPushDevicesAction(input?: {
  currentEndpoint?: string | null;
}): Promise<ActionResult<{ devices: PushDevice[] }>> {
  const user = await requireUser();

  let currentEndpoint: string | null = null;
  if (input?.currentEndpoint) {
    const parsed = endpointInputSchema.safeParse({ endpoint: input.currentEndpoint });
    // A malformed endpoint is not an error worth failing the list over. The
    // page still renders; nothing is marked as the current device.
    if (parsed.success) currentEndpoint = parsed.data.endpoint;
  }

  try {
    const rows = await pushRepo.listActiveSubscriptions(user.id);
    return {
      ok: true,
      data: {
        devices: rows.map((row) => ({
          id: row.id,
          deviceLabel: row.deviceLabel,
          createdAt: row.createdAt.toISOString(),
          lastSuccessAt: row.lastSuccessAt ? row.lastSuccessAt.toISOString() : null,
          isCurrentDevice: currentEndpoint !== null && row.endpoint === currentEndpoint,
        })),
      },
    };
  } catch (error) {
    safeLog("listPushDevicesAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Disconnect one device by id, including a device other than this one.
 *
 * This is what makes a lost laptop revocable from a phone. The id alone is not
 * authority: `deleteSubscription` filters on the session user as well, so an id
 * belonging to another account deletes nothing and reports not-found.
 */
export async function disconnectPushDeviceAction(input: {
  id: string;
}): Promise<ActionResult<{ deviceCount: number }>> {
  const user = await requireUser();
  const parsed = pushSubscriptionIdSchema.safeParse(input.id);
  if (!parsed.success) return { ok: false, error: "That device is not valid." };

  try {
    const removed = await pushRepo.deleteSubscription(user.id, parsed.data);
    if (!removed) return { ok: false, error: "That device is no longer connected." };

    const deviceCount = await pushRepo.countActiveSubscriptions(user.id);
    // Unchanged from the single-device behaviour: the last device leaving turns
    // notifications off, and any remaining device keeps them on.
    if (deviceCount === 0) {
      await settingsRepo.updateUserSettings(user.id, { notificationsEnabled: false });
    }
    revalidatePath("/settings");
    return { ok: true, data: { deviceCount } };
  } catch (error) {
    safeLog("disconnectPushDeviceAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Send a functional test to this owned device, never to the user's other devices. */
export async function sendTestPushAction(input: {
  endpoint: string;
}): Promise<ActionResult<{ sent: boolean }>> {
  const user = await requireUser();
  const parsed = endpointInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That device connection is not valid." };

  try {
    const subscription = await pushRepo.getSubscriptionByEndpoint(user.id, parsed.data.endpoint);
    if (
      !subscription ||
      subscription.disabledAt ||
      (subscription.expirationTime && subscription.expirationTime.getTime() <= Date.now())
    ) {
      return { ok: false, error: "Notifications are not enabled on this device." };
    }

    const settings = await settingsRepo.getOrCreateUserSettings(user.id);
    const notification = await automationRepo.claimNotification(user.id, {
      kind: "test",
      dedupeKey: `push:test:${randomUUID()}`,
      localDate: zonedToday(new Date(), settings.timezone),
      entityType: "push_subscription",
      entityId: subscription.id,
      payload: { subscriptionId: subscription.id },
    });
    if (!notification) return { ok: false, error: GENERIC_ERROR };

    const result = await sendNotificationToSubscription({
      userId: user.id,
      notificationId: notification.id,
      subscriptionId: subscription.id,
      payload: {
        title: "GoHa is connected",
        body: "Smart notifications are ready on this device.",
        url: "/today",
        icon: "/icons/goha-192.png",
        tag: "goha-connection-test",
      },
      urgency: "normal",
    });

    if (result.succeeded > 0) return { ok: true, data: { sent: true } };
    if (result.permanentFailures > 0 || result.reason === "subscription_not_active") {
      return {
        ok: false,
        error: "This device connection is no longer active. Enable notifications again.",
      };
    }
    return { ok: false, error: "Could not send the test notification. Please try again." };
  } catch (error) {
    safeLog("sendTestPushAction failed", error);
    return { ok: false, error: "Could not send the test notification. Please try again." };
  }
}
