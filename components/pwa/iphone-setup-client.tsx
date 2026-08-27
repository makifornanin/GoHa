"use client";

import { BellRing, CheckCircle2, Home, LogIn, LogOut, Settings, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  getStagedPairingStateAction,
  type PushOverview,
} from "@/app/(app)/settings/push-actions";
import { usePushDevice } from "@/components/pwa/use-push-device";
import { Button, buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type SetupState =
  | "checking"
  | "redirecting"
  | "valid"
  | "wrong_account"
  | "expired"
  | "consumed"
  | "missing"
  | "unavailable"
  | "complete";

const LOGIN_TARGET = "/login?redirectTo=%2Fiphone%2Fsetup";

export function IphoneSetupClient({
  signedIn,
  hasStagedPairing,
  initialOverview,
}: {
  signedIn: boolean;
  hasStagedPairing: boolean;
  initialOverview: PushOverview | null;
}) {
  const router = useRouter();
  const device = usePushDevice(initialOverview, { authenticated: signedIn });
  const [state, setState] = useState<SetupState>("checking");
  const [signingOut, setSigningOut] = useState(false);
  const pairingCode = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (pairingCode.current === undefined) {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      pairingCode.current = fragment.get("pair");

      if (window.location.hash) {
        // Strip the secret before the first network wait. It never enters query
        // parameters, browser storage, React state, analytics, or a redirect URL.
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
    }
    const code = pairingCode.current;

    async function resolveSetup() {
      if (code) {
        try {
          const response = await fetch("/api/push/pairing/stage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
            credentials: "same-origin",
            cache: "no-store",
            referrerPolicy: "same-origin",
            signal: controller.signal,
          });
          if (!response.ok) {
            if (!cancelled) setState("unavailable");
            return;
          }
        } catch {
          if (!cancelled) setState("unavailable");
          return;
        }

        if (!signedIn) {
          if (!cancelled) {
            setState("redirecting");
            router.replace(LOGIN_TARGET);
          }
          return;
        }
      } else if (!signedIn) {
        if (hasStagedPairing) {
          setState("redirecting");
          router.replace(LOGIN_TARGET);
        } else {
          setState("missing");
        }
        return;
      }

      try {
        const result = await getStagedPairingStateAction();
        if (cancelled) return;
        setState(
          result.ok
            ? result.data.state === "none"
              ? "missing"
              : result.data.state
            : "unavailable",
        );
      } catch {
        if (!cancelled) setState("unavailable");
      }
    }

    void resolveSetup();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hasStagedPairing, router, signedIn]);

  async function enableNotifications() {
    const result = await device.enable();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setState("complete");
    toast.success("Your iPhone is ready for GoHa notifications.");
  }

  async function signOutForCorrectAccount() {
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        toast.error(result.error.message || "Could not sign out. Please try again.");
        setSigningOut(false);
        return;
      }
      router.replace(LOGIN_TARGET);
      router.refresh();
    } catch {
      toast.error("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <section className="rounded-3xl border border-separator-opaque bg-surface p-5 shadow-e2 sm:p-7">
      {state === "checking" || state === "redirecting" ? (
        <Status
          icon={<Smartphone />}
          title={state === "redirecting" ? "Taking you to sign in" : "Checking this setup code"}
          detail="This should only take a moment."
        />
      ) : state === "valid" ? (
        <ValidSetup
          availability={device.availability}
          currentConnected={device.currentConnected === true}
          pending={device.pending}
          onEnable={enableNotifications}
        />
      ) : state === "complete" || (state === "consumed" && device.currentConnected) ? (
        <div className="space-y-5">
          <Status
            icon={<CheckCircle2 className="text-green" />}
            title="Notifications enabled on this iPhone"
            detail="GoHa can now deliver the smart notifications you choose in Settings."
          />
          <SettingsLink />
        </div>
      ) : state === "wrong_account" ? (
        <div className="space-y-5">
          <Status
            icon={<LogIn />}
            title="Use the same GoHa account"
            detail="This setup code belongs to a different signed-in account. Sign out, then use the same account that created the QR code."
          />
          <div className="flex justify-end">
            <Button onClick={signOutForCorrectAccount} loading={signingOut}>
              <LogOut aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      ) : state === "expired" || state === "consumed" || state === "unavailable" ? (
        <div className="space-y-5">
          <Status
            icon={<Smartphone />}
            title={state === "expired" ? "This setup code expired" : "This setup code is no longer available"}
            detail="On your computer, return to Settings and make a new QR code. Setup codes expire quickly and work once."
          />
          <SettingsLink />
        </div>
      ) : (
        <div className="space-y-5">
          <Status
            icon={<Smartphone />}
            title="Start from GoHa Settings"
            detail="Open Connect your iPhone on the device where you use GoHa, then scan its QR code with this iPhone."
          />
          {signedIn ? <SettingsLink /> : null}
        </div>
      )}
    </section>
  );
}

function ValidSetup({
  availability,
  currentConnected,
  pending,
  onEnable,
}: {
  availability: ReturnType<typeof usePushDevice>["availability"];
  currentConnected: boolean;
  pending: boolean;
  onEnable: () => void;
}) {
  if (currentConnected) {
    return (
      <div className="space-y-5">
        <Status
          icon={<CheckCircle2 className="text-green" />}
          title="Notifications are already enabled"
          detail="Finish this one-time setup to confirm the QR code and keep this device connected."
        />
        <div className="flex justify-end">
          <Button onClick={onEnable} loading={pending}>
            <CheckCircle2 aria-hidden />
            Finish setup
          </Button>
        </div>
      </div>
    );
  }

  if (availability === "needs_install") {
    return (
      <div className="space-y-5">
        <Status
          icon={<Home />}
          title="Add GoHa to your Home Screen"
          detail="On iPhone, open the Share menu, choose Add to Home Screen, and keep Open as Web App turned on."
        />
        <ol className="space-y-3">
          {[
            "Add GoHa to your Home Screen.",
            "Open GoHa using its new Home Screen icon.",
            "Open Settings, then Connect your iPhone.",
            "Tap Enable Notifications, then Allow.",
          ].map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-callout text-label-secondary">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-fill text-footnote font-semibold text-white"
                aria-hidden
              >
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="text-footnote text-label-tertiary">
          Adding the icon does not grant notification permission. You still choose Enable and Allow
          inside the Home Screen app.
        </p>
      </div>
    );
  }

  if (availability === "denied") {
    return (
      <Status
        icon={<BellRing />}
        title="Notifications are blocked"
        detail="Open your iPhone notification settings, allow notifications for GoHa, then return here."
      />
    );
  }

  if (availability === "unsupported") {
    return (
      <Status
        icon={<Smartphone />}
        title="Notifications are not supported here"
        detail="Update your iPhone and open GoHa from its Home Screen icon, then try again."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Status
        icon={<BellRing />}
        title="Enable GoHa notifications"
        detail="Your iPhone will ask for permission only after you tap the button below."
      />
      <div className="flex justify-end">
        <Button onClick={onEnable} loading={pending || availability === "checking"}>
          <BellRing aria-hidden />
          Enable Notifications
        </Button>
      </div>
    </div>
  );
}

function Status({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary [&_svg]:size-5"
        aria-hidden
      >
        {icon}
      </span>
      <div>
        <h1 className="text-title-2 text-label">{title}</h1>
        <p className="mt-1 text-body text-label-secondary">{detail}</p>
      </div>
    </div>
  );
}

function SettingsLink() {
  return (
    <div className="flex justify-end">
      <Link href="/settings" className={cn(buttonVariants({ size: "lg" }))}>
        <Settings className="size-4" aria-hidden />
        Open GoHa Settings
      </Link>
    </div>
  );
}
