"use client";

import {
  BellRing,
  CheckCircle2,
  Clock3,
  Flag,
  Laptop,
  MonitorSmartphone,
  RefreshCw,
  Send,
  Smartphone,
  Sunrise,
  Unplug,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createPushPairingAction,
  disconnectPushDeviceAction,
  listPushDevicesAction,
  type PushDevice,
  type PushOverview,
} from "@/app/(app)/settings/push-actions";
import { usePushDevice } from "@/components/pwa/use-push-device";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SettingsCard } from "@/components/settings/settings-card";
import { displayDeviceLabel } from "@/lib/push/device-label";

const BENEFITS = [
  { icon: Sunrise, label: "Morning Brief" },
  { icon: BellRing, label: "Evening Summary" },
  { icon: Flag, label: "Deadline reminders" },
  { icon: Clock3, label: "Focus reminders" },
];

type Pairing = {
  qrSvg: string;
  expiresAt: string;
  startingDeviceCount: number;
};

function deviceCountLabel(count: number) {
  return `${count} ${count === 1 ? "device" : "devices"} connected`;
}

/** "Aug 27". The year is noise for something the user connected themselves. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Web Push device management, for every platform GoHa supports.
 *
 * This was an iPhone-only card, which described the feature far more narrowly
 * than it worked: the same standard Push API flow already succeeded in desktop
 * Chrome and Edge, but every word and icon here said "iPhone", so nobody on a
 * laptop had any reason to press the button. Nothing in the backend changed to
 * support this; the capability was always there.
 *
 * iPhone-specific guidance survives, but only where the running browser
 * actually needs it: iOS refuses Web Push until the app is on the Home Screen,
 * and that is worth explaining precisely when it is true.
 */
export function NotificationDevicesCard({
  initial,
  className,
}: {
  initial: PushOverview;
  className?: string;
}) {
  const device = usePushDevice(initial);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [pairingPending, setPairingPending] = useState(false);
  const [pairingExpired, setPairingExpired] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const overview = device.overview ?? initial;
  const refreshOverview = device.refreshOverview;
  const currentEndpoint = device.currentEndpoint;

  /*
   * The endpoint is sent so the server can mark one row as "this device". It
   * is matched only against rows already scoped to the session user, and it is
   * never rendered: it is a capability URL, and anyone holding it could push.
   */
  const loadDevices = useCallback(async () => {
    const result = await listPushDevicesAction({ currentEndpoint });
    if (result.ok) setDevices(result.data.devices);
  }, [currentEndpoint]);

  useEffect(() => {
    /*
     * Deferred by a tick, matching `inspectCurrentDevice` in the push hook.
     * The device list is external state being read in, not state derived
     * during render, and settling it inside the effect body makes React
     * cascade a second render before the first has painted.
     */
    const timer = window.setTimeout(() => void loadDevices(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDevices]);

  useEffect(() => {
    if (!pairing) return;

    let stopped = false;
    async function checkCompletion() {
      if (Date.now() >= new Date(pairing!.expiresAt).getTime()) {
        if (!stopped) setPairingExpired(true);
        return;
      }

      const next = await refreshOverview();
      if (stopped || !next) return;
      if (next.deviceCount > pairing!.startingDeviceCount || next.pendingPairing === null) {
        setPairing(null);
        setPairingExpired(false);
        void loadDevices();
        toast.success("That device is ready for GoHa notifications.");
      }
    }

    const timer = window.setInterval(() => void checkCompletion(), 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pairing, refreshOverview, loadDevices]);

  async function createPairing() {
    if (!overview.pushConfigured) {
      toast.error("GoHa notifications are not configured yet.");
      return;
    }

    setPairingPending(true);
    setPairingExpired(false);
    try {
      const result = await createPushPairingAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPairing({ ...result.data, startingDeviceCount: overview.deviceCount });
      device.setOverview((value) =>
        value ? { ...value, pendingPairing: { expiresAt: result.data.expiresAt } } : value,
      );
    } catch {
      toast.error("GoHa could not prepare device setup. Please try again.");
    } finally {
      setPairingPending(false);
    }
  }

  async function enableThisDevice() {
    const result = await device.enable();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSetupOpen(false);
    await loadDevices();
    toast.success("Notifications are enabled on this device.");
  }

  async function sendTest() {
    const result = await device.sendTest();
    if (result.ok) toast.success("Test notification sent.");
    else toast.error(result.error);
  }

  async function disconnectThisDevice() {
    const result = await device.disconnect();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDisconnectOpen(false);
    await loadDevices();
    toast.success("Notifications were disconnected on this device.");
  }

  /** Remove any device by id, including one the user is not sitting at. */
  async function removeDevice(target: PushDevice) {
    setRemovingId(target.id);
    try {
      const result = await disconnectPushDeviceAction({ id: target.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      device.setOverview((value) =>
        value ? { ...value, deviceCount: result.data.deviceCount } : value,
      );
      // The browser's own subscription is now inert server side; re-reading
      // keeps the "this device" state honest without a page reload.
      if (target.isCurrentDevice) await device.inspectCurrentDevice();
      await loadDevices();
      toast.success(`${displayDeviceLabel(target.deviceLabel)} was disconnected.`);
    } catch {
      toast.error("GoHa could not disconnect that device.");
    } finally {
      setRemovingId(null);
    }
  }

  const connectedHere = device.currentConnected === true;

  return (
    <SettingsCard
      className={className}
      icon={<MonitorSmartphone className="size-5" />}
      title="Notification Devices"
      description="Connect this device to receive GoHa reminders and notifications."
    >
      <ul className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="flex items-center gap-2 rounded-xl bg-fill-quaternary px-3 py-2.5 text-callout text-label-secondary"
          >
            <Icon className="size-4 shrink-0 text-blue" aria-hidden />
            {label}
          </li>
        ))}
      </ul>

      {!overview.pushConfigured ? (
        <p
          role="status"
          className="rounded-xl bg-fill-quaternary px-4 py-3 text-callout text-label-secondary"
        >
          Notifications are not available yet. GoHa still needs its notification service
          configured.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3 rounded-xl bg-fill-quaternary px-4 py-4">
            <CheckCircle2
              className={connectedHere ? "mt-0.5 size-5 shrink-0 text-green" : "mt-0.5 size-5 shrink-0 text-label-tertiary"}
              aria-hidden
            />
            <div>
              <h3 className="text-subhead text-label">
                {connectedHere ? "Notifications Enabled" : "Notifications are off on this device"}
              </h3>
              <p className="mt-1 text-callout text-label-secondary">
                {overview.deviceCount > 0
                  ? connectedHere
                    ? deviceCountLabel(overview.deviceCount)
                    : `${deviceCountLabel(overview.deviceCount)}, but not this browser. You can add it without changing the others.`
                  : "No devices are connected to this account yet."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            {connectedHere ? (
              <>
                <Button variant="secondary" onClick={sendTest} loading={device.pending}>
                  <Send aria-hidden />
                  Send Test Notification
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDisconnectOpen(true)}
                  disabled={device.pending}
                >
                  <Unplug aria-hidden />
                  Disconnect this device
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setSetupOpen(true)}
                disabled={device.availability === "checking"}
              >
                <BellRing aria-hidden />
                Enable Notifications
              </Button>
            )}
            <Button variant="outline" onClick={createPairing} loading={pairingPending}>
              <Smartphone aria-hidden />
              {overview.pendingPairing ? "Make a new QR code" : "Connect another device"}
            </Button>
          </div>

          {devices && devices.length > 0 ? (
            <section aria-labelledby="connected-devices-heading" className="flex flex-col gap-2">
              <h3
                id="connected-devices-heading"
                className="text-caption font-medium uppercase tracking-wide text-label-tertiary"
              >
                Connected devices
              </h3>
              <ul className="flex flex-col gap-2">
                {devices.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 rounded-xl bg-fill-quaternary px-4 py-3"
                  >
                    <Laptop className="size-4 shrink-0 text-label-secondary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-subhead text-label">
                        <span className="break-words">{displayDeviceLabel(entry.deviceLabel)}</span>
                        {entry.isCurrentDevice ? (
                          <span className="rounded-full bg-blue-fill px-2 py-0.5 text-caption font-medium text-white">
                            This device
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-footnote text-label-tertiary">
                        Connected {shortDate(entry.createdAt)}
                        {entry.lastSuccessAt
                          ? ` · Last notified ${shortDate(entry.lastSuccessAt)}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void removeDevice(entry)}
                      loading={removingId === entry.id}
                      aria-label={`Disconnect ${displayDeviceLabel(entry.deviceLabel)}`}
                    >
                      Disconnect
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <Modal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        title="Enable notifications"
        description="Turn on GoHa notifications for the device you are using now."
      >
        <div className="flex flex-col gap-5 px-6 py-5">
          {/* Shown only when THIS browser genuinely cannot subscribe yet, which
              in practice means iOS before the app is on the Home Screen. */}
          {device.availability === "needs_install" ? (
            <InstallSteps />
          ) : device.availability === "unsupported" ? (
            <Guidance
              title="Notifications are not supported here"
              detail="This browser does not support Web Push. Try the latest Chrome, Edge, Firefox, or Safari."
            />
          ) : device.availability === "denied" ? (
            <Guidance
              title="Notifications are blocked"
              detail="Open this browser's site settings, allow notifications for GoHa, then return here."
            />
          ) : (
            <>
              <Guidance
                title="Ready to ask for permission"
                detail="Your browser will show its own permission prompt after you choose Enable Notifications."
              />
              <div className="flex justify-end">
                <Button
                  onClick={enableThisDevice}
                  loading={device.pending || device.availability === "checking"}
                >
                  <BellRing aria-hidden />
                  Enable Notifications
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={pairing !== null}
        onClose={() => setPairing(null)}
        title={pairingExpired ? "This setup code expired" : "Connect another device"}
        description={
          pairingExpired
            ? "Make a fresh code to continue."
            : "Scan this short-lived code with the phone or tablet you want to connect."
        }
      >
        <div className="flex flex-col gap-5 px-6 py-5">
          {pairingExpired ? (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setPairing(null);
                  void createPairing();
                }}
                loading={pairingPending}
              >
                <RefreshCw aria-hidden />
                Make a new QR code
              </Button>
            </div>
          ) : (
            <>
              <ol className="flex flex-col gap-3">
                {[
                  ["Scan with the other device's camera", "The code opens GoHa's secure setup page there."],
                  ["Sign in to the same GoHa account", "The setup code never replaces your normal sign-in."],
                  ["On iPhone, add GoHa to the Home Screen", "iOS only allows notifications from an installed web app. Android and desktop can skip this."],
                  ["Choose Enable Notifications", "Allow the permission prompt when it appears."],
                ].map(([title, detail], index) => (
                  <li key={title} className="flex gap-3">
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-fill text-footnote font-semibold text-white"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-subhead text-label">{title}</p>
                      <p className="mt-0.5 text-footnote text-label-tertiary">{detail}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="flex flex-col items-center gap-2">
                <div
                  className="rounded-xl bg-white p-3 [&_svg]:block [&_svg]:size-52"
                  dangerouslySetInnerHTML={{ __html: pairing?.qrSvg ?? "" }}
                  role="img"
                  aria-label="Short-lived device setup code"
                />
                <p className="text-center text-footnote text-label-tertiary">
                  This code expires in about ten minutes and works once.
                </p>
              </div>

              <p className="rounded-xl bg-fill-quaternary px-3 py-2.5 text-footnote text-label-secondary">
                Scanning only opens setup. The device is connected after it signs in and explicitly
                allows notifications.
              </p>

              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setPairing(null)}>
                  Finish later
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        title="Disconnect this device?"
        description="Your other connected devices will keep receiving notifications."
      >
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <Button variant="ghost" onClick={() => setDisconnectOpen(false)} disabled={device.pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={disconnectThisDevice} loading={device.pending}>
            Disconnect this device
          </Button>
        </div>
      </Modal>
    </SettingsCard>
  );
}

function Guidance({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl bg-fill-quaternary px-4 py-4">
      <p className="text-subhead text-label">{title}</p>
      <p className="mt-1 text-callout text-label-secondary">{detail}</p>
    </div>
  );
}

/**
 * iOS is the only platform that requires installation before Web Push, so this
 * renders only for a browser that reported it cannot subscribe yet.
 */
function InstallSteps() {
  return (
    <div className="space-y-4">
      <Guidance
        title="Add GoHa to your Home Screen first"
        detail="On iPhone and iPad, open the Share menu, choose Add to Home Screen, and keep Open as Web App turned on."
      />
      <ol className="list-decimal space-y-2 pl-5 text-callout text-label-secondary">
        <li>Open GoHa using the new Home Screen icon.</li>
        <li>Return to Settings and choose Enable Notifications.</li>
        <li>Tap Allow when the permission prompt appears.</li>
      </ol>
      <p className="text-footnote text-label-tertiary">
        iOS does not allow a website to add itself to the Home Screen automatically.
      </p>
    </div>
  );
}
