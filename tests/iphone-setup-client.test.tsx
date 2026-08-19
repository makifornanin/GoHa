import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PushOverview } from "@/app/(app)/settings/push-actions";

const replace = vi.fn();
const refresh = vi.fn();
const getStagedState = vi.fn();
const enable = vi.fn();
const signOut = vi.fn();

let availability = "needs_install";
let currentConnected = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("@/app/(app)/settings/push-actions", () => ({
  getStagedPairingStateAction: (...args: unknown[]) => getStagedState(...args),
}));

vi.mock("@/components/pwa/use-push-device", () => ({
  usePushDevice: () => ({
    availability,
    currentConnected,
    pending: false,
    enable,
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: (...args: unknown[]) => signOut(...args) },
}));

const { IphoneSetupClient } = await import("@/components/pwa/iphone-setup-client");

const OVERVIEW: PushOverview = {
  deviceCount: 0,
  pendingPairing: null,
  vapidPublicKey: "AQIDBA",
  pushConfigured: true,
};

describe("iPhone setup page client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    availability = "needs_install";
    currentConnected = false;
    enable.mockResolvedValue({ ok: true });
    signOut.mockResolvedValue({ error: null });
    getStagedState.mockResolvedValue({ ok: true, data: { state: "valid" } });
    window.history.replaceState({}, "", "/iphone/setup");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("strips the fragment, stages it in the request body, then sends a signed-out user to login", async () => {
    const stage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", stage);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    window.history.replaceState({}, "", "/iphone/setup#pair=one-time-secret");

    render(
      <IphoneSetupClient signedIn={false} hasStagedPairing={false} initialOverview={null} />,
    );

    await waitFor(() => expect(window.location.hash).toBe(""));
    await waitFor(() =>
      expect(stage).toHaveBeenCalledWith(
        "/api/push/pairing/stage",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ code: "one-time-secret" }),
          credentials: "same-origin",
          cache: "no-store",
        }),
      ),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?redirectTo=%2Fiphone%2Fsetup"),
    );
    expect(window.location.href).not.toContain("one-time-secret");
    expect(storage).not.toHaveBeenCalled();
    expect(getStagedState).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it("shows truthful Home Screen steps after the signed-in account is verified", async () => {
    render(<IphoneSetupClient signedIn hasStagedPairing initialOverview={OVERVIEW} />);

    expect(await screen.findByRole("heading", { name: "Add GoHa to your Home Screen" })).toBeInTheDocument();
    expect(screen.getByText("Open GoHa using its new Home Screen icon.")).toBeInTheDocument();
    expect(screen.getByText(/does not grant notification permission/i)).toBeInTheDocument();
    expect(enable).not.toHaveBeenCalled();
  });

  it("rejects a different signed-in account without revealing the intended account", async () => {
    getStagedState.mockResolvedValue({ ok: true, data: { state: "wrong_account" } });
    render(<IphoneSetupClient signedIn hasStagedPairing initialOverview={OVERVIEW} />);

    expect(await screen.findByRole("heading", { name: "Use the same GoHa account" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@|milcamark7/i);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("shows one generic unavailable state for a rejected staged code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    window.history.replaceState({}, "", "/iphone/setup#pair=expired-secret");

    render(<IphoneSetupClient signedIn hasStagedPairing initialOverview={OVERVIEW} />);

    expect(
      await screen.findByRole("heading", { name: "This setup code is no longer available" }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("expired-secret");
    expect(getStagedState).not.toHaveBeenCalled();
  });

  it("continues a staged HttpOnly-cookie flow after a signed-out reload", async () => {
    render(<IphoneSetupClient signedIn={false} hasStagedPairing initialOverview={null} />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?redirectTo=%2Fiphone%2Fsetup"),
    );
    expect(getStagedState).not.toHaveBeenCalled();
  });
});
