"use client";

import {
  BellRing,
  CheckCircle2,
  Clock3,
  Flag,
  HeartPulse,
  RefreshCw,
  Smartphone,
  Sunrise,
  Unplug,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createAutomationTokenAction,
  revokeAutomationTokenAction,
  type AutomationOverview,
  type TokenSummary,
} from "@/app/(app)/settings/automation-actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const IPHONE_CONNECTION = {
  name: "GoHa iPhone",
  // Delivery de-duplication uses the existing write-protected log endpoint.
  // This stays an implementation detail; the consumer never has to choose or
  // understand a permission level.
  scope: "read_write" as const,
  expiresInDays: null,
};

const BENEFITS = [
  { icon: Sunrise, label: "Morning Brief" },
  { icon: BellRing, label: "Daily progress summary" },
  { icon: Flag, label: "Deadline reminders" },
  { icon: HeartPulse, label: "Habit nudges" },
  { icon: Clock3, label: "Focus alerts" },
];

type Confirmation = "reconnect" | "disconnect" | null;

/**
 * Consumer-facing wrapper around the existing automation connection.
 *
 * The server action still owns creation, hashing, QR encoding, user scoping,
 * and revocation. This component deliberately keeps only the finished QR SVG
 * in state: the returned secret is never rendered, copied, persisted, or put
 * into a URL.
 */
export function IphoneConnectionCard({
  initial,
  className,
}: {
  initial: AutomationOverview;
  className?: string;
}) {
  const [data, setData] = useState(initial);
  const [pairingQr, setPairingQr] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [pending, startTransition] = useTransition();

  const activeConnections = data.tokens.filter((entry) => entry.active);
  const connectionCreated = activeConnections.length > 0;

  function markRevoked(ids: Set<string>) {
    if (ids.size === 0) return;
    const revokedAt = new Date().toISOString();
    setData((current) => ({
      ...current,
      tokens: current.tokens.map((entry) =>
        ids.has(entry.id) ? { ...entry, active: false, revokedAt } : entry,
      ),
    }));
  }

  async function revokeConnections(tokens: TokenSummary[]): Promise<boolean> {
    const results = await Promise.all(
      tokens.map(async (entry) => {
        try {
          const result = await revokeAutomationTokenAction(entry.id);
          return result.ok ? entry.id : null;
        } catch {
          return null;
        }
      }),
    );
    const revokedIds = new Set(results.filter((id): id is string => id !== null));
    markRevoked(revokedIds);
    return revokedIds.size === tokens.length;
  }

  async function createPairingCode(): Promise<boolean> {
    let result;
    try {
      result = await createAutomationTokenAction(IPHONE_CONNECTION);
    } catch {
      toast.error("GoHa could not create the iPhone connection. Please try again.");
      return false;
    }

    if (!result.ok) {
      toast.error("GoHa could not create the iPhone connection. Please try again.");
      return false;
    }

    const { token, qrSvg } = result.data;
    if (!qrSvg) {
      // A row already exists at this point. Turn it off immediately rather than
      // leave an active connection the user was never able to pair.
      let cleanedUp = false;
      try {
        cleanedUp = (await revokeAutomationTokenAction(token.id)).ok;
      } catch {
        // The state below remains honest if cleanup could not be confirmed.
      }
      const safeToken = cleanedUp
        ? { ...token, active: false, revokedAt: new Date().toISOString() }
        : token;
      setData((current) => ({ ...current, tokens: [safeToken, ...current.tokens] }));
      toast.error(
        cleanedUp
          ? "GoHa could not prepare the pairing code. Choose Connect your iPhone to try again."
          : "GoHa could not prepare the pairing code. Choose Reconnect iPhone to try again.",
      );
      return false;
    }

    setData((current) => ({ ...current, tokens: [token, ...current.tokens] }));
    // Do not retain result.data.secret. The QR is its only consumer-facing form.
    setPairingQr(qrSvg);
    return true;
  }

  function connect() {
    startTransition(async () => {
      await createPairingCode();
    });
  }

  function reconnect() {
    const currentConnections = activeConnections;
    startTransition(async () => {
      const revoked = await revokeConnections(currentConnections);
      if (!revoked) {
        toast.error("GoHa could not safely replace the current connection. Please try again.");
        setConfirmation(null);
        return;
      }

      setConfirmation(null);
      await createPairingCode();
    });
  }

  function disconnect() {
    const currentConnections = activeConnections;
    startTransition(async () => {
      const revoked = await revokeConnections(currentConnections);
      setConfirmation(null);
      if (!revoked) {
        toast.error("Some of the connection could not be turned off. Please try again.");
        return;
      }
      toast.success("Your iPhone connection was turned off.");
    });
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1 lg:p-6",
        className,
      )}
    >
      <div className="mb-6 flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-label-secondary"
          aria-hidden
        >
          <Smartphone className="size-5" />
        </span>
        <div>
          <h2 className="text-headline text-label">Connect your iPhone</h2>
          <p className="mt-0.5 text-callout text-label-secondary">
            Connect your iPhone to receive smart GoHa notifications using Apple&apos;s Shortcuts app.
          </p>
        </div>
      </div>

      {connectionCreated ? (
        <div className="flex flex-col gap-5" aria-live="polite">
          <div className="flex items-start gap-3 rounded-xl bg-fill-quaternary px-4 py-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green" aria-hidden />
            <div>
              <h3 className="text-subhead text-label">iPhone connection created</h3>
              <p className="mt-1 text-callout text-label-secondary">
                GoHa has prepared your private connection. It cannot see whether setup finished on
                your phone, so reconnect if you did not complete every step.
              </p>
            </div>
          </div>

          <p className="text-callout text-label-secondary">
            Your notification choices are in the settings above. Reconnecting makes a fresh
            one-time pairing code; disconnecting stops this connection.
          </p>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmation("reconnect")} disabled={pending}>
              <RefreshCw className="size-4" aria-hidden />
              Reconnect iPhone
            </Button>
            <Button variant="outline" onClick={() => setConfirmation("disconnect")} disabled={pending}>
              <Unplug className="size-4" aria-hidden />
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="flex justify-end">
            <Button onClick={connect} loading={pending} size="lg">
              <Smartphone className="size-4" aria-hidden />
              Connect your iPhone
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={pairingQr !== null}
        onClose={() => setPairingQr(null)}
        title="Finish connecting your iPhone"
        description="Use the GoHa setup Shortcut to scan this one-time pairing code."
      >
        <div className="flex flex-col gap-5 px-6 py-5">
          <ol className="flex flex-col gap-3">
            {[
              ["Open the GoHa Shortcut", "Install it first if it is not already in Apple's Shortcuts app."],
              ["Run the setup Shortcut", "Keep it open until it asks for the pairing code."],
              ["Scan the QR code", "Scan the code below only when the setup Shortcut asks."],
              ["Complete the one-time setup", "Follow the remaining prompts on your iPhone."],
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

          {pairingQr ? (
            <div className="flex flex-col items-center gap-2">
              <div
                className="rounded-xl bg-white p-3 [&_svg]:block [&_svg]:size-52"
                // The server produced this SVG with the existing QR encoder.
                // It contains no user-authored markup.
                dangerouslySetInnerHTML={{ __html: pairingQr }}
                role="img"
                aria-label="One-time iPhone pairing code"
              />
              <p className="text-center text-footnote text-label-tertiary">
                Keep this code private. It disappears when you close this screen.
              </p>
            </div>
          ) : null}

          <p className="rounded-xl bg-fill-quaternary px-3 py-2.5 text-footnote text-label-secondary">
            This QR code does not install the Shortcut or create Apple Personal Automations. If you
            close it before finishing, use Reconnect iPhone to make a fresh code.
          </p>

          <div className="flex justify-end">
            <Button onClick={() => setPairingQr(null)}>Done</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={confirmation === "disconnect" ? "Disconnect your iPhone?" : "Reconnect your iPhone?"}
        description={
          confirmation === "disconnect"
            ? "GoHa notifications and any Shortcuts using this account's connections will stop."
            : "Any current GoHa connections for this account will stop, then GoHa will make a fresh one-time pairing code."
        }
      >
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <Button variant="ghost" onClick={() => setConfirmation(null)} disabled={pending}>
            Cancel
          </Button>
          {confirmation === "disconnect" ? (
            <Button variant="destructive" onClick={disconnect} loading={pending}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={reconnect} loading={pending}>
              Reconnect iPhone
            </Button>
          )}
        </div>
      </Modal>
    </section>
  );
}
