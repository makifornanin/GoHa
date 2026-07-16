import { describe, expect, it } from "vitest";

import { isValidTimeZone } from "@/lib/timezones";
import {
  displayNameSchema,
  preferencesSchema,
  themeSchema,
  timezoneSchema,
  weekStartSchema,
} from "@/lib/validations/settings";

describe("displayNameSchema", () => {
  it("trims and accepts a normal name", () => {
    const result = displayNameSchema.safeParse("  Mark  ");
    expect(result.success && result.data).toBe("Mark");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(displayNameSchema.safeParse("").success).toBe(false);
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
  });

  it("accepts a name exactly at the 80-char limit and rejects one over", () => {
    expect(displayNameSchema.safeParse("a".repeat(80)).success).toBe(true);
    expect(displayNameSchema.safeParse("a".repeat(81)).success).toBe(false);
  });
});

describe("themeSchema", () => {
  it("accepts the three next-themes values", () => {
    for (const theme of ["light", "dark", "system"]) {
      expect(themeSchema.safeParse(theme).success).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(themeSchema.safeParse("solarized").success).toBe(false);
    expect(themeSchema.safeParse("").success).toBe(false);
  });
});

describe("timezoneSchema", () => {
  it("accepts a real IANA zone and trims", () => {
    const result = timezoneSchema.safeParse("  Asia/Manila  ");
    expect(result.success && result.data).toBe("Asia/Manila");
  });

  it("rejects a non-existent zone", () => {
    expect(timezoneSchema.safeParse("Mars/Olympus_Mons").success).toBe(false);
    expect(timezoneSchema.safeParse("").success).toBe(false);
  });
});

describe("weekStartSchema", () => {
  it("coerces numeric strings and accepts the full 0..6 range", () => {
    for (let day = 0; day <= 6; day++) {
      expect(weekStartSchema.safeParse(String(day)).success).toBe(true);
    }
    const coerced = weekStartSchema.safeParse("1");
    expect(coerced.success && coerced.data).toBe(1);
  });

  it("rejects out-of-range and non-integer values", () => {
    expect(weekStartSchema.safeParse(-1).success).toBe(false);
    expect(weekStartSchema.safeParse(7).success).toBe(false);
    expect(weekStartSchema.safeParse(2.5).success).toBe(false);
  });
});

describe("preferencesSchema", () => {
  it("accepts a valid timezone + week start pair", () => {
    const result = preferencesSchema.safeParse({
      timezone: "America/New_York",
      weekStartsOn: 0,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({ timezone: "America/New_York", weekStartsOn: 0 });
  });

  it("fails if either field is invalid", () => {
    expect(
      preferencesSchema.safeParse({ timezone: "Nowhere/Void", weekStartsOn: 1 }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({ timezone: "Asia/Manila", weekStartsOn: 9 }).success,
    ).toBe(false);
  });
});

describe("isValidTimeZone", () => {
  it("recognizes real zones and rejects junk", () => {
    expect(isValidTimeZone("Asia/Manila")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
