import { describe, expect, it } from "vitest";

import {
  deriveDeviceLabel,
  displayDeviceLabel,
  UNNAMED_DEVICE_LABEL,
} from "@/lib/push/device-label";
import { PUSH_DEVICE_LABEL_MAX } from "@/lib/validations/push";

/**
 * Device labels are cosmetic, and these tests hold them to a cosmetic standard:
 * a plausible name, or nothing. What they mainly guard is ORDER, because every
 * Chromium browser carries "Chrome" in its user agent and every WebKit browser
 * carries "Safari", so a naive check labels the entire web Chrome or Safari.
 */

const UA = {
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/140.0.0.0 Mobile Safari/537.36",
  opera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/115.0.0.0",
};

describe("deriveDeviceLabel", () => {
  it("names the common desktop browsers", () => {
    expect(deriveDeviceLabel({ userAgent: UA.windowsChrome })).toBe("Windows · Chrome");
    expect(deriveDeviceLabel({ userAgent: UA.windowsFirefox })).toBe("Windows · Firefox");
    expect(deriveDeviceLabel({ userAgent: UA.macChrome })).toBe("macOS · Chrome");
    expect(deriveDeviceLabel({ userAgent: UA.macSafari })).toBe("macOS · Safari");
  });

  it("does not call Edge, Opera or Samsung Internet 'Chrome'", () => {
    // Each of these user agents contains the literal token "Chrome/". Getting
    // this wrong would label every device on the account identically.
    expect(deriveDeviceLabel({ userAgent: UA.windowsEdge })).toBe("Windows · Edge");
    expect(deriveDeviceLabel({ userAgent: UA.opera })).toBe("Windows · Opera");
    expect(deriveDeviceLabel({ userAgent: UA.androidSamsung })).toBe(
      "Android · Samsung Internet",
    );
  });

  it("does not call every WebKit browser 'Safari'", () => {
    // Chrome on iOS is WebKit and its UA ends in "Safari/604.1".
    expect(deriveDeviceLabel({ userAgent: UA.iphoneChrome })).toBe("iPhone · Chrome");
    expect(deriveDeviceLabel({ userAgent: UA.iphoneSafari })).toBe("iPhone · Safari");
  });

  it("separates iPad from macOS", () => {
    // iPadOS deliberately reports a Mac-like UA; the iPad token comes first.
    expect(deriveDeviceLabel({ userAgent: UA.ipadSafari })).toBe("iPad · Safari");
  });

  it("names Android", () => {
    // Android UAs also contain "Linux", so order matters here too.
    expect(deriveDeviceLabel({ userAgent: UA.androidChrome })).toBe("Android · Chrome");
  });

  it("prefers the platform the browser volunteers over the user agent string", () => {
    expect(
      deriveDeviceLabel({ userAgent: UA.windowsChrome, platform: "Windows" }),
    ).toBe("Windows · Chrome");
    expect(deriveDeviceLabel({ userAgent: UA.macChrome, platform: "macOS" })).toBe(
      "macOS · Chrome",
    );
  });

  it("ignores the deliberate junk entries in client hint brands", () => {
    /*
     * Chromium intentionally injects a fake brand to break naive parsers. It
     * must never become somebody's device name.
     */
    const label = deriveDeviceLabel({
      userAgent: "",
      brands: [
        { brand: "Not;A=Brand" },
        { brand: "Chromium" },
        { brand: "Microsoft Edge" },
      ],
    });
    expect(label).toBe("Microsoft Edge");
  });

  it("returns null rather than guessing when nothing is recognisable", () => {
    expect(deriveDeviceLabel({ userAgent: "" })).toBeNull();
    expect(deriveDeviceLabel({ userAgent: null, platform: null, brands: null })).toBeNull();
    expect(deriveDeviceLabel({ userAgent: "totally-unknown-agent/1.0" })).toBeNull();
  });

  it("falls back to whichever half it could determine", () => {
    expect(deriveDeviceLabel({ userAgent: "Mozilla/5.0 (Windows NT 10.0)" })).toBe("Windows");
  });

  it("never exceeds the column limit", () => {
    const label = deriveDeviceLabel({
      userAgent: "",
      brands: [{ brand: "x".repeat(500) }],
    });
    expect(label!.length).toBeLessThanOrEqual(PUSH_DEVICE_LABEL_MAX);
  });
});

describe("displayDeviceLabel", () => {
  it("renders existing NULL labels gracefully", () => {
    // Every subscription created before labels existed has a null here, and
    // those rows stay perfectly valid.
    expect(displayDeviceLabel(null)).toBe(UNNAMED_DEVICE_LABEL);
    expect(displayDeviceLabel(undefined)).toBe(UNNAMED_DEVICE_LABEL);
    expect(displayDeviceLabel("")).toBe(UNNAMED_DEVICE_LABEL);
    expect(displayDeviceLabel("   ")).toBe(UNNAMED_DEVICE_LABEL);
  });

  it("passes a real label through", () => {
    expect(displayDeviceLabel("Windows · Chrome")).toBe("Windows · Chrome");
    expect(displayDeviceLabel("  iPhone · Safari  ")).toBe("iPhone · Safari");
  });
});
