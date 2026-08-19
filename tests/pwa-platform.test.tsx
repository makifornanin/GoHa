import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import manifest from "@/app/manifest";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PWA manifest", () => {
  it("declares a stable standalone app with install-sized icons", () => {
    const value = manifest();

    expect(value).toMatchObject({
      id: "/",
      name: "GoHa",
      short_name: "GoHa",
      start_url: "/today",
      scope: "/",
      display: "standalone",
    });
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/goha-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/icons/goha-512.png", sizes: "512x512" }),
        expect.objectContaining({ src: "/icons/goha-512.png", purpose: "maskable" }),
      ]),
    );

    const expectedSizes = [
      ["goha-192.png", 192],
      ["goha-512.png", 512],
      ["goha-apple-180.png", 180],
    ] as const;
    for (const [file, size] of expectedSizes) {
      const png = readFileSync(join(process.cwd(), "public", "icons", file));
      // PNG stores the IHDR width and height as two big-endian uint32 values.
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  });
});

describe("service worker registration", () => {
  it("registers at root without requesting notification permission", async () => {
    const register = vi.fn().mockResolvedValue({});
    const requestPermission = vi.fn();
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { requestPermission },
    });

    render(<ServiceWorkerRegistrar />);

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }),
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

type WorkerEvent = {
  data?: { json(): unknown };
  notification?: { data?: { url?: string }; close(): void };
  waitUntil(promise: Promise<unknown>): void;
};

function loadServiceWorker(options?: {
  windows?: Array<{
    url: string;
    navigate?: (url: string) => Promise<unknown>;
    focus: () => Promise<unknown>;
  }>;
}) {
  const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue(options?.windows ?? []);

  const worker = {
    URL,
    location: { origin: "https://goha.example" },
    registration: { showNotification },
    clients: { matchAll, openWindow },
    addEventListener(type: string, listener: (event: WorkerEvent) => void) {
      listeners.set(type, listener);
    },
  };

  runInNewContext(source, { globalThis: worker, URL });
  return { listeners, showNotification, matchAll, openWindow };
}

describe("push service worker", () => {
  it("always displays a visible fallback for an empty push", async () => {
    const { listeners, showNotification } = loadServiceWorker();
    let lifetime: Promise<unknown> = Promise.resolve();

    listeners.get("push")?.({
      waitUntil(promise) {
        lifetime = promise;
      },
    });
    await lifetime;

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      "GoHa",
      expect.objectContaining({
        body: "You have a new GoHa update.",
        icon: "https://goha.example/icons/goha-192.png",
        data: { url: "https://goha.example/today" },
      }),
    );
  });

  it("passes a bounded notification tag for platform-level replacement", async () => {
    const { listeners, showNotification } = loadServiceWorker();
    let lifetime: Promise<unknown> = Promise.resolve();

    listeners.get("push")?.({
      data: {
        json: () => ({
          title: "Morning brief",
          body: "Your day is ready.",
          tag: "brief:morning:2026-08-18",
        }),
      },
      waitUntil(promise) {
        lifetime = promise;
      },
    });
    await lifetime;

    expect(showNotification).toHaveBeenCalledWith(
      "Morning brief",
      expect.objectContaining({ tag: "brief:morning:2026-08-18" }),
    );
  });

  it("rejects a cross-origin click target before focusing an existing GoHa window", async () => {
    const navigate = vi.fn().mockResolvedValue(undefined);
    const focus = vi.fn().mockResolvedValue(undefined);
    const { listeners, openWindow } = loadServiceWorker({
      windows: [{ url: "https://goha.example/settings", navigate, focus }],
    });
    let lifetime: Promise<unknown> = Promise.resolve();
    const close = vi.fn();

    listeners.get("notificationclick")?.({
      notification: { data: { url: "https://attacker.example/phish" }, close },
      waitUntil(promise) {
        lifetime = promise;
      },
    });
    await lifetime;

    expect(close).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("https://goha.example/today");
    expect(focus).toHaveBeenCalledOnce();
    expect(openWindow).not.toHaveBeenCalled();
  });
});
