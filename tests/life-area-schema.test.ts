import { describe, expect, it } from "vitest";

import {
  DEFAULT_COLOR_KEY,
  DEFAULT_ICON_KEY,
  LIFE_AREA_DESCRIPTION_MAX,
  LIFE_AREA_NAME_MAX,
} from "@/lib/life-areas";
import {
  lifeAreaFormSchema,
  lifeAreaIdSchema,
  toFieldErrors,
} from "@/lib/validations/life-area";

describe("lifeAreaFormSchema", () => {
  it("accepts a minimal input and applies defaults", () => {
    const result = lifeAreaFormSchema.safeParse({ name: "Health" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      name: "Health",
      description: null,
      color: DEFAULT_COLOR_KEY,
      icon: DEFAULT_ICON_KEY,
      weight: 1,
    });
  });

  it("trims the name", () => {
    const result = lifeAreaFormSchema.safeParse({ name: "  Career  " });
    expect(result.success && result.data.name).toBe("Career");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(lifeAreaFormSchema.safeParse({ name: "" }).success).toBe(false);
    expect(lifeAreaFormSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name longer than the limit", () => {
    const tooLong = "a".repeat(LIFE_AREA_NAME_MAX + 1);
    const result = lifeAreaFormSchema.safeParse({ name: tooLong });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(toFieldErrors(result.error).name).toBeDefined();
  });

  it("accepts a name exactly at the limit", () => {
    const atLimit = "a".repeat(LIFE_AREA_NAME_MAX);
    expect(lifeAreaFormSchema.safeParse({ name: atLimit }).success).toBe(true);
  });

  it("normalizes empty or whitespace description to null", () => {
    expect(lifeAreaFormSchema.safeParse({ name: "X", description: "" }).success).toBe(true);
    const a = lifeAreaFormSchema.safeParse({ name: "X", description: "   " });
    expect(a.success && a.data.description).toBeNull();
    const b = lifeAreaFormSchema.safeParse({ name: "X", description: "  keep me  " });
    expect(b.success && b.data.description).toBe("keep me");
  });

  it("rejects a description longer than the limit", () => {
    const result = lifeAreaFormSchema.safeParse({
      name: "X",
      description: "d".repeat(LIFE_AREA_DESCRIPTION_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown color and icon keys", () => {
    expect(lifeAreaFormSchema.safeParse({ name: "X", color: "neon" }).success).toBe(false);
    expect(lifeAreaFormSchema.safeParse({ name: "X", icon: "spaceship" }).success).toBe(false);
  });

  it("accepts every valid weight and coerces numeric strings", () => {
    for (const weight of [1, 2, 3, 4, 5]) {
      expect(lifeAreaFormSchema.safeParse({ name: "X", weight }).success).toBe(true);
    }
    const coerced = lifeAreaFormSchema.safeParse({ name: "X", weight: "3" });
    expect(coerced.success && coerced.data.weight).toBe(3);
  });

  it("rejects out-of-range and non-integer weights", () => {
    expect(lifeAreaFormSchema.safeParse({ name: "X", weight: 0 }).success).toBe(false);
    expect(lifeAreaFormSchema.safeParse({ name: "X", weight: 6 }).success).toBe(false);
    expect(lifeAreaFormSchema.safeParse({ name: "X", weight: 2.5 }).success).toBe(false);
  });
});

describe("lifeAreaIdSchema", () => {
  it("accepts a valid UUID and rejects anything else", () => {
    expect(lifeAreaIdSchema.safeParse("3f6b2b1e-9c2a-4a1b-8e2d-9b1c2d3e4f5a").success).toBe(true);
    expect(lifeAreaIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(lifeAreaIdSchema.safeParse("").success).toBe(false);
  });
});

describe("toFieldErrors", () => {
  it("returns the first message per field", () => {
    const result = lifeAreaFormSchema.safeParse({ name: "", weight: 99 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = toFieldErrors(result.error);
    expect(errors.name).toBeDefined();
    expect(errors.weight).toBeDefined();
    expect(typeof errors.name).toBe("string");
  });
});
