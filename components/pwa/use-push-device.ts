"use client";

import { useCallback, useEffect, useState } from "react";

import { currentDeviceLabel } from "@/lib/push/device-label";
import {
  getCurrentPushStateAction,
  listPushOverviewAction,
  sendTestPushAction,
  subscribePushAction,
  unsubscribePushAction,
  type PushOverview,
} from "@/app/(app)/settings/push-actions";

export type PushAvailability =
  | "checking"
  | "ready"
  | "needs_install"
  | "unsupported"
  | "denied";

type OperationResult = { ok: true } | { ok: false; error: string };

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export function isStandaloneWebApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as NavigatorWithStandalone).standalone === true
  );
}

export function supportsBrowserPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Convert the URL-safe VAPID representation into the BufferSource Push API expects. */
export function applicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const normalized = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(normalized);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes.buffer;
}

function serializableSubscription(subscription: PushSubscription) {
  const value = subscription.toJSON();
  const p256dh = value.keys?.p256dh;
  const auth = value.keys?.auth;
  if (!value.endpoint || !p256dh || !auth) {
    throw new Error("The browser returned an incomplete push subscription.");
  }

  return {
    endpoint: value.endpoint,
    expirationTime: value.expirationTime ?? null,
    keys: { p256dh, auth },
  };
}

/**
 * Current-browser Web Push state and the only operations that may change it.
 *
 * Merely mounting this hook never asks for notification permission. `enable`
 * is called by a visible button, preserving the user gesture required by iOS
 * and other browsers.
 */
export function usePushDevice(
  initial: PushOverview | null,
  { authenticated = true }: { authenticated?: boolean } = {},
) {
  const [overview, setOverview] = useState(initial);
  const [availability, setAvailability] = useState<PushAvailability>("checking");
  const [currentConnected, setCurrentConnected] = useState<boolean | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [pending, setPending] = useState(false);

  const inspectCurrentDevice = useCallback(async () => {
    // Keep state updates on the asynchronous side of the mount effect. The
    // browser inspection is external synchronization, not render derivation.
    await Promise.resolve();
    if (!supportsBrowserPush()) {
      setAvailability(isStandaloneWebApp() ? "unsupported" : "needs_install");
      setCurrentConnected(false);
      setSubscription(null);
      return;
    }

    setAvailability(Notification.permission === "denied" ? "denied" : "ready");

    try {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      setSubscription(current);
      if (!current) {
        setCurrentConnected(false);
        return;
      }

      // The public QR landing page may be opened in a browser that already has
      // a subscription from some earlier account. Until Better Auth confirms a
      // session, never send that endpoint to an authenticated Server Action.
      if (!authenticated) {
        setCurrentConnected(false);
        return;
      }

      const state = await getCurrentPushStateAction({ endpoint: current.endpoint });
      setCurrentConnected(state.ok && state.data.connected);
    } catch {
      setCurrentConnected(false);
      setAvailability(isStandaloneWebApp() ? "unsupported" : "needs_install");
    }
  }, [authenticated]);

  useEffect(() => {
    const timer = window.setTimeout(() => void inspectCurrentDevice(), 0);
    return () => window.clearTimeout(timer);
  }, [inspectCurrentDevice]);

  const refreshOverview = useCallback(async (): Promise<PushOverview | null> => {
    if (!authenticated) return null;
    try {
      const next = await listPushOverviewAction();
      setOverview(next);
      return next;
    } catch {
      return null;
    }
  }, [authenticated]);

  const enable = useCallback(async (): Promise<OperationResult> => {
    if (!authenticated) {
      return { ok: false, error: "Sign in before enabling notifications." };
    }
    if (!overview?.pushConfigured || !overview.vapidPublicKey) {
      return { ok: false, error: "GoHa notifications are not configured yet." };
    }
    if (!supportsBrowserPush()) {
      setAvailability(isStandaloneWebApp() ? "unsupported" : "needs_install");
      return {
        ok: false,
        error: isStandaloneWebApp()
          ? "Notifications are not supported in this Home Screen app."
          : "Add GoHa to your Home Screen before enabling notifications on this iPhone.",
      };
    }

    setPending(true);
    let created: PushSubscription | null = null;
    try {
      let permission = Notification.permission;
      if (permission === "default") {
        // This call stays directly inside the button-triggered operation.
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        setAvailability(permission === "denied" ? "denied" : "ready");
        return {
          ok: false,
          error:
            permission === "denied"
              ? "Notifications are blocked for GoHa in this device's settings."
              : "Notifications were not enabled.",
        };
      }

      const registration = await navigator.serviceWorker.ready;
      const key = applicationServerKey(overview.vapidPublicKey);
      const deviceLabel = currentDeviceLabel();

      let current = await registration.pushManager.getSubscription();
      if (!current) {
        current = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        created = current;
      }

      let result = await subscribePushAction({
        ...serializableSubscription(current),
        deviceLabel,
      });

      /*
       * This browser was still holding a subscription created under a
       * DIFFERENT GoHa account, so the server refused to move it. That refusal
       * is correct and stays untouched; what was wrong was leaving the person
       * stuck with it.
       *
       * Discarding the stale subscription makes the push service issue a new
       * endpoint, which belongs to nobody and can be claimed normally. Exactly
       * one retry: if the fresh endpoint is somehow taken too, something is
       * wrong that retrying will not fix, and a loop would just hammer the
       * push service.
       */
      if (!result.ok && result.code === "foreign_subscription") {
        await current.unsubscribe().catch(() => false);
        current = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        created = current;
        result = await subscribePushAction({
          ...serializableSubscription(current),
          deviceLabel,
        });
      }

      if (!result.ok) {
        if (created) await created.unsubscribe().catch(() => false);
        return { ok: false, error: result.error };
      }

      setSubscription(current);
      setCurrentConnected(true);
      setAvailability("ready");
      setOverview((value) =>
        value
          ? {
              ...value,
              deviceCount: result.data.deviceCount,
              pendingPairing: result.data.paired ? null : value.pendingPairing,
            }
          : value,
      );
      return { ok: true };
    } catch {
      if (created) await created.unsubscribe().catch(() => false);
      return { ok: false, error: "GoHa could not enable notifications on this device." };
    } finally {
      setPending(false);
    }
  }, [authenticated, overview]);

  const disconnect = useCallback(async (): Promise<OperationResult> => {
    if (!authenticated) {
      return { ok: false, error: "Sign in before changing this device." };
    }
    if (!subscription) {
      return { ok: false, error: "This device does not have an active GoHa connection." };
    }

    setPending(true);
    try {
      const result = await unsubscribePushAction({ endpoint: subscription.endpoint });
      if (!result.ok) return { ok: false, error: result.error };

      // Server-side deactivation is authoritative. Browser cleanup is best
      // effort; a stale browser subscription cannot receive after the row is
      // inactive and can be safely reused if the person reconnects.
      await subscription.unsubscribe().catch(() => false);
      setSubscription(null);
      setCurrentConnected(false);
      setOverview((value) =>
        value ? { ...value, deviceCount: result.data.deviceCount } : value,
      );
      return { ok: true };
    } catch {
      return { ok: false, error: "GoHa could not disconnect this device." };
    } finally {
      setPending(false);
    }
  }, [authenticated, subscription]);

  const sendTest = useCallback(async (): Promise<OperationResult> => {
    if (!authenticated) {
      return { ok: false, error: "Sign in before sending a test notification." };
    }
    if (!subscription || !currentConnected) {
      return { ok: false, error: "Enable notifications on this device first." };
    }

    setPending(true);
    try {
      const result = await sendTestPushAction({ endpoint: subscription.endpoint });
      if (!result.ok) return { ok: false, error: result.error };
      return result.data.sent
        ? { ok: true }
        : { ok: false, error: "The test notification could not be delivered." };
    } catch {
      return { ok: false, error: "The test notification could not be delivered." };
    } finally {
      setPending(false);
    }
  }, [authenticated, currentConnected, subscription]);

  return {
    overview,
    setOverview,
    availability,
    currentConnected,
    /*
     * The live endpoint of THIS browser, used only to mark one row in the
     * device list as the current device. It is a capability URL, so it goes
     * straight to an authenticated Server Action and is never rendered.
     */
    currentEndpoint: subscription?.endpoint ?? null,
    pending,
    enable,
    disconnect,
    sendTest,
    refreshOverview,
    inspectCurrentDevice,
  };
}
