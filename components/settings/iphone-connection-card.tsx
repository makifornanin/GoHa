"use client";

import {
  BellRing,
  CheckCircle2,
  Clock3,
  Flag,
  MonitorSmartphone,
  RefreshCw,
  Send,
  Smartphone,
  Sunrise,
  Unplug,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createPushPairingAction,
  type PushOverview,
} from "@/app/(app)/settings/push-actions";
import { usePushDevice } from "@/components/pwa/use-push-device";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SettingsCard } from "@/components/settings/settings-card";

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

/**
 * Consumer iPhone onboarding through PWA Web Push.
 *
 * This component never creates or reads an automation credential. The QR is a
 * short-lived setup intent, and the connected state comes only from active push
 * subscriptions reported by the server.
 */
export function IphoneConnectionCard({
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

  const overview = device.overview ?? initial;
  const refreshOverview = device.refreshOverview;

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
      if (
        next.deviceCount > pairing!.startingDeviceCount ||
        next.pendingPairing === null
      ) {
        setPairing(null);
        setPairingExpired(false);
        toast.success("Your iPhone is ready for GoHa notifications.");
      }
    }

    const timer = window.setInterval(() => void checkCompletion(), 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pairing, refreshOverview]);

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
      setPairing({
        ...result.data,
        startingDeviceCount: overview.deviceCount,
      });
      device.setOverview((value) =>
        value
          ? {
              ...value,
              pendingPairing: { expiresAt: result.data.expiresAt },
            }
          : value,
      );
    } catch {
      toast.error("GoHa could not prepare iPhone setup. Please try again.");
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
    toast.success("Notifications are enabled on this device.");
  }

  async function sendTest() {
    const result = await device.sendTest();
    if (result.ok) {
      toast.success("Test notification sent.");
    } else {
      toast.error(result.error);
    }
  }

  async function disconnectThisDevice() {
    const result = await device.disconnect();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDisconnectOpen(false);
    toast.success("Notifications were disconnected on this device.");
  }

  return (
    <SettingsCard
      className={className}
      icon={<Smartphone className="size-5" />}
      title="Connect your iPhone"
      description="Receive GoHa smart notifications directly on your iPhone."
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
        <p role="status" className="rounded-xl bg-fill-quaternary px-4 py-3 text-callout text-label-secondary">
          Phone notifications are not available yet. GoHa still needs its notification service
          configured.
        </p>
      ) : overview.deviceCount > 0 ? (
        <div className="flex flex-col gap-4" aria-live="polite">
          <div className="flex items-start gap-3 rounded-xl bg-fill-quaternary px-4 py-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green" aria-hidden />
            <div>
              <h3 className="text-subhead text-label">
                {device.currentConnected
                  ? "Notifications enabled on this device"
                  : deviceCountLabel(overview.deviceCount)}
              </h3>
              <p className="mt-1 text-callout text-label-secondary">
                {device.currentConnected
                  ? deviceCountLabel(overview.deviceCount)
                  : "This browser is not one of them. You can set it up without changing your other devices."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            {device.currentConnected ? (
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
              <Button onClick={() => setSetupOpen(true)} disabled={device.availability === "checking"}>
                <Smartphone aria-hidden />
                Set up this device
              </Button>
            )}
            <Button variant="outline" onClick={createPairing} loading={pairingPending}>
              <MonitorSmartphone aria-hidden />
              Add another iPhone
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {overview.pendingPairing ? (
            <div className="rounded-xl bg-fill-quaternary px-4 py-3">
              <p className="text-subhead text-label">Finish connecting your iPhone</p>
              <p className="mt-1 text-callout text-label-secondary">
                A setup code was created but no phone has enabled notifications yet. Make a new
                code if the previous screen was closed.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setSetupOpen(true)}
              disabled={device.availability === "checking"}
            >
              <Smartphone aria-hidden />
              Set up this device
            </Button>
            <Button onClick={createPairing} loading={pairingPending}>
              <MonitorSmartphone aria-hidden />
              {overview.pendingPairing ? "Make a new QR code" : "Show QR code"}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        title="Set up this device"
        description="Enable notifications on the device you are using now."
      >
        <div className="flex flex-col gap-5 px-6 py-5">
          {device.availability === "needs_install" ? (
            <InstallSteps />
          ) : device.availability === "unsupported" ? (
            <Guidance
              title="Notifications are not supported here"
              detail="Update your device and open GoHa from its Home Screen icon, then try again."
            />
          ) : device.availability === "denied" ? (
            <Guidance
              title="Notifications are blocked"
              detail="Open your device's notification settings, allow notifications for GoHa, then return here."
            />
          ) : (
            <>
              <Guidance
                title="Ready to ask for permission"
                detail="Your device will show its own permission prompt after you tap Enable Notifications."
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
        title={pairingExpired ? "This setup code expired" : "Finish connecting your iPhone"}
        description={
          pairingExpired
            ? "Make a fresh code to continue."
            : "Scan this short-lived code using your iPhone Camera."
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
                  ["Scan with your iPhone Camera", "The code opens GoHa's secure phone setup page."],
                  ["Sign in to the same GoHa account", "The setup code never replaces your normal sign-in."],
                  ["Add GoHa to your Home Screen", "Use your browser's Share menu, then open the new GoHa icon."],
                  ["Tap Enable Notifications", "Tap Allow when your iPhone asks for permission."],
                ].map(([title, detail], index) => (
                  <li key={title} className="flex gap-3">
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue text-footnote font-semibold text-white"
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
                  aria-label="Short-lived iPhone setup code"
                />
                <p className="text-center text-footnote text-label-tertiary">
                  This code expires in about ten minutes and works once.
                </p>
              </div>

              <p className="rounded-xl bg-fill-quaternary px-3 py-2.5 text-footnote text-label-secondary">
                Scanning only opens setup. Your iPhone is connected after you add GoHa to the Home
                Screen and explicitly allow notifications.
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
        description="Other phones and browsers connected to this GoHa account will keep working."
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

function InstallSteps() {
  return (
    <div className="space-y-4">
      <Guidance
        title="Add GoHa to your Home Screen first"
        detail="On iPhone, open your browser's Share menu, choose Add to Home Screen, and keep Open as Web App turned on."
      />
      <ol className="list-decimal space-y-2 pl-5 text-callout text-label-secondary">
        <li>Open GoHa using the new Home Screen icon.</li>
        <li>Return to Settings and choose Set up this device.</li>
        <li>Tap Enable Notifications, then Allow.</li>
      </ol>
      <p className="text-footnote text-label-tertiary">
        iPhone does not allow a website to add itself to your Home Screen automatically.
      </p>
    </div>
  );
}
