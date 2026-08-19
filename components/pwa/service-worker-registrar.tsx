"use client";

import { useEffect } from "react";

/**
 * Registers GoHa's push-only service worker once for the whole application.
 *
 * Registration is capability-detected and intentionally does not request
 * notification permission. Permission belongs to the explicit user action in
 * the future device-connection UI; asking during page load is both hostile UX
 * and rejected by platforms that require a user gesture.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .catch((error: unknown) => {
        // Registration failure must not make the app unusable. It is still
        // useful in development diagnostics and contains no credential data.
        console.error("GoHa service worker registration failed.", error);
      });
  }, []);

  return null;
}
