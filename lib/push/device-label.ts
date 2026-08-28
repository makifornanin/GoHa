import { PUSH_DEVICE_LABEL_MAX } from "@/lib/validations/push";

/**
 * A human-readable name for the browser a subscription was created in.
 *
 * DISPLAY METADATA ONLY. This is never an identity, never a security check and
 * never a device fingerprint: it exists so that a list of four connected
 * devices reads as "Windows / Chrome" and "iPhone / Safari" rather than four
 * identical rows. Ownership is always the session user, and the only durable
 * identifier is the endpoint the push service issued.
 *
 * Because it is cosmetic, every branch here degrades to something sensible
 * rather than guessing hard. A wrong label is a cosmetic bug; treating a label
 * as though it meant something would be a real one.
 */

export type DeviceLabelHints = {
  /** `navigator.userAgent`. */
  userAgent?: string | null;
  /** `navigator.userAgentData.platform`, where the browser provides it. */
  platform?: string | null;
  /** `navigator.userAgentData.brands`, where the browser provides it. */
  brands?: readonly { brand?: string | null }[] | null;
};

/** Shown wherever a subscription predates labels, or none could be derived. */
export const UNNAMED_DEVICE_LABEL = "Unnamed device";

const SEPARATOR = " · "; // A middle dot, matching the rest of GoHa's metadata rows.

function osFrom(hints: DeviceLabelHints): string | null {
  const ua = hints.userAgent ?? "";
  /*
   * `userAgentData.platform` first where it exists: it is the value the
   * browser volunteers rather than one parsed out of a string that browsers
   * have spent two decades deliberately making misleading.
   */
  const declared = hints.platform?.trim();
  if (declared) {
    const known: Record<string, string> = {
      windows: "Windows",
      macos: "macOS",
      android: "Android",
      linux: "Linux",
      "chrome os": "ChromeOS",
      chromeos: "ChromeOS",
    };
    const match = known[declared.toLowerCase()];
    if (match) return match;
  }

  // iPadOS reports itself as a Mac, so the touch-capable check has to come
  // before the macOS one or every iPad is labelled a laptop.
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}

function browserFrom(hints: DeviceLabelHints): string | null {
  const ua = hints.userAgent ?? "";

  /*
   * On iOS every browser is WebKit wearing a different badge, and each badge
   * is its own token. These are checked first because their user agents also
   * contain "Safari" and would otherwise all read as Safari.
   */
  if (/CriOS/i.test(ua)) return "Chrome";
  if (/FxiOS/i.test(ua)) return "Firefox";
  if (/EdgiOS/i.test(ua)) return "Edge";
  if (/OPiOS|OPT\//i.test(ua)) return "Opera";

  /*
   * Order is load-bearing on desktop too. Edge, Opera, Brave and Samsung
   * Internet all carry "Chrome" in their user agent, so Chrome has to be the
   * last of that family to be tested or everything is labelled Chrome.
   */
  if (/Edg[A-Z]?\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Vivaldi/i.test(ua)) return "Vivaldi";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  // Safari's own token appears in nearly every WebKit UA, so it is only
  // believed once every impostor above has been ruled out.
  if (/Safari\//i.test(ua)) return "Safari";

  /*
   * Client hints as a last resort. The list always includes deliberate junk
   * entries ("Not;A=Brand") to stop exactly the kind of naive parsing this
   * would otherwise be, so anything unrecognised is dropped.
   */
  for (const entry of hints.brands ?? []) {
    const brand = entry?.brand?.trim();
    if (!brand || /not.?a.?brand/i.test(brand)) continue;
    if (/^Chromium$/i.test(brand)) continue;
    return brand;
  }
  return null;
}

/**
 * Build the label, or return null when nothing useful could be determined.
 *
 * Null rather than a placeholder: the column is nullable, and storing a real
 * null keeps an unknown device indistinguishable from one registered before
 * labels existed. Both render through {@link UNNAMED_DEVICE_LABEL}.
 */
export function deriveDeviceLabel(hints: DeviceLabelHints): string | null {
  const os = osFrom(hints);
  const browser = browserFrom(hints);
  if (!os && !browser) return null;

  const label = os && browser ? `${os}${SEPARATOR}${browser}` : (os ?? browser)!;
  return label.slice(0, PUSH_DEVICE_LABEL_MAX);
}

/** What the UI shows for a row whose label is null, empty or whitespace. */
export function displayDeviceLabel(label: string | null | undefined): string {
  const trimmed = label?.trim();
  return trimmed ? trimmed : UNNAMED_DEVICE_LABEL;
}

type NavigatorWithUaData = Navigator & {
  userAgentData?: {
    platform?: string;
    brands?: { brand: string; version: string }[];
  };
};

/** Read the hints from the live browser. Returns null outside one. */
export function currentDeviceLabel(): string | null {
  if (typeof navigator === "undefined") return null;
  const uaData = (navigator as NavigatorWithUaData).userAgentData;
  return deriveDeviceLabel({
    userAgent: navigator.userAgent,
    platform: uaData?.platform ?? null,
    brands: uaData?.brands ?? null,
  });
}
