const DEFAULT_NOTIFICATION = {
  title: "GoHa",
  body: "You have a new GoHa update.",
  icon: "/icons/goha-192.png",
  url: "/today",
};

function safeSameOriginUrl(value, fallbackPath) {
  const fallback = new URL(fallbackPath, globalThis.location.origin);
  if (typeof value !== "string" || value.length === 0) return fallback.href;

  try {
    const candidate = new URL(value, globalThis.location.origin);
    if (
      candidate.origin !== globalThis.location.origin ||
      candidate.username ||
      candidate.password
    ) {
      return fallback.href;
    }
    return candidate.href;
  } catch {
    return fallback.href;
  }
}

function readPushPayload(event) {
  if (!event.data) return {};

  try {
    const payload = event.data.json();
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

globalThis.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : DEFAULT_NOTIFICATION.title;
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : DEFAULT_NOTIFICATION.body;
  const icon = safeSameOriginUrl(payload.icon, DEFAULT_NOTIFICATION.icon);
  const url = safeSameOriginUrl(payload.url, DEFAULT_NOTIFICATION.url);
  const tag =
    typeof payload.tag === "string" && payload.tag.trim()
      ? payload.tag.trim().slice(0, 64)
      : undefined;

  // Every push is user-visible, including an empty or malformed payload. This
  // fulfils Push API's userVisibleOnly promise and avoids background-only work.
  event.waitUntil(
    globalThis.registration.showNotification(title, {
      body,
      icon,
      ...(tag ? { tag } : {}),
      data: { url },
    }),
  );
});

globalThis.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = safeSameOriginUrl(
    event.notification.data?.url,
    DEFAULT_NOTIFICATION.url,
  );

  event.waitUntil(
    (async () => {
      const windows = await globalThis.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        let sameOrigin = false;
        try {
          sameOrigin = new URL(client.url).origin === globalThis.location.origin;
        } catch {
          // Ignore malformed client URLs and try another window.
        }
        if (!sameOrigin) continue;

        try {
          if (client.url !== target && "navigate" in client) {
            await client.navigate(target);
          }
          await client.focus();
          return;
        } catch {
          // A stale window may disappear while the click is handled. Opening a
          // fresh one below is the reliable fallback.
        }
      }

      await globalThis.clients.openWindow(target);
    })(),
  );
});
