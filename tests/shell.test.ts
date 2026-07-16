import { describe, expect, it } from "vitest";

import { mobileNav, primaryNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

describe("primary navigation", () => {
  it("exposes every designed destination exactly once", () => {
    expect(primaryNav).toHaveLength(12);
    const hrefs = primaryNav.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("uses absolute route paths", () => {
    for (const item of primaryNav) {
      expect(item.href.startsWith("/")).toBe(true);
    }
  });

  it("mobile nav is a subset of the primary nav", () => {
    const hrefs = new Set(primaryNav.map((item) => item.href));
    for (const item of mobileNav) {
      expect(hrefs.has(item.href)).toBe(true);
    }
  });
});

describe("cn", () => {
  it("merges conflicting tailwind utilities, last one wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("text-on-surface", false, undefined, "font-semibold")).toBe(
      "text-on-surface font-semibold",
    );
  });
});
