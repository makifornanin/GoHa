export type WorkerNotification = {
  title: string;
  body: string;
  url: string;
};

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

/** Server-owned deterministic alternative when narration is unavailable. */
export function workerFallbackNotification(
  title: string,
  body: string,
  url: string,
): WorkerNotification {
  return { title: truncate(title, 80), body: truncate(body, 240), url };
}

/**
 * Final presentation is small, plain text, and may only navigate inside GoHa.
 * Parsing against a fixed base catches scheme-relative and backslash URLs that
 * a superficial `startsWith("/")` check would miss.
 */
export function validateWorkerNotification(value: unknown): WorkerNotification | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["title", "body", "url"].includes(key))) return null;
  if (
    typeof input.title !== "string" ||
    typeof input.body !== "string" ||
    typeof input.url !== "string"
  ) {
    return null;
  }
  const title = input.title.trim();
  const body = input.body.trim();
  const url = input.url.trim();
  if (!title || title.length > 80 || !body || body.length > 240 || !url || url.length > 512) {
    return null;
  }
  if (
    /[\u0000-\u001f\u007f]/.test(title) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)
  ) {
    return null;
  }
  try {
    const base = new URL("https://goha.invalid/");
    const parsed = new URL(url, base);
    if (!url.startsWith("/") || url.startsWith("//") || parsed.origin !== base.origin) return null;
  } catch {
    return null;
  }
  return { title, body, url };
}
