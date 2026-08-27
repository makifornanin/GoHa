import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ColorPicker } from "@/components/ui/color-picker";
import { IconPicker } from "@/components/ui/icon-picker";
import { lifeAreaIconMap } from "@/components/life-areas/icon";
import {
  COLOR_PRESETS,
  DEFAULT_ICON_KEY,
  ICON_GROUPS,
  LIFE_AREA_COLOR_KEYS,
  LIFE_AREA_ICON_KEYS,
  isHexColor,
  normalizeHex,
  readableForeground,
  resolveAreaColor,
  toIconKey,
} from "@/lib/life-areas";

/**
 * The expanded icon catalog and the colour picker.
 *
 * Both extend data that is already in the database, so the thing most worth
 * protecting is not the new range but the old values: an area saved as "growth"
 * or "teal" months ago has to keep rendering exactly as it did. The custom
 * colour path adds the other risk, which is a malformed value being stored and
 * rendering as nothing at all.
 */

afterEach(cleanup);

describe("icon catalog", () => {
  it("keeps every original key working", () => {
    // These are in the database. Losing one would blank an existing area.
    for (const legacy of [
      "target", "briefcase", "heart", "wallet", "growth",
      "family", "rocket", "home", "fitness", "sparkles", "leaf", "globe",
    ]) {
      expect(LIFE_AREA_ICON_KEYS).toContain(legacy);
      expect(toIconKey(legacy)).toBe(legacy);
      expect(lifeAreaIconMap[legacy as never]).toBeTruthy();
    }
  });

  it("covers the requested areas of life", () => {
    for (const key of [
      "code", "automation", "school", "reading", "savings", "food", "sleep",
      "relationships", "friends", "travel", "music", "spirituality",
      "planning", "routines", "habits",
    ]) {
      expect(LIFE_AREA_ICON_KEYS).toContain(key);
    }
  });

  it("gives every key a glyph from the one family", () => {
    for (const key of LIFE_AREA_ICON_KEYS) {
      expect(lifeAreaIconMap[key], `${key} has no icon`).toBeTruthy();
    }
  });

  it("still falls back safely for a key that is no longer known", () => {
    expect(toIconKey("something-retired")).toBe(DEFAULT_ICON_KEY);
    expect(toIconKey(null)).toBe(DEFAULT_ICON_KEY);
  });

  it("is grouped rather than one flat wall", () => {
    expect(ICON_GROUPS.length).toBeGreaterThanOrEqual(6);
    expect(LIFE_AREA_ICON_KEYS.length).toBeGreaterThanOrEqual(35);
  });
});

describe("icon picker", () => {
  function setup(value = DEFAULT_ICON_KEY) {
    const onChange = vi.fn();
    render(<IconPicker value={value} onChange={onChange} />);
    return { onChange };
  }

  it("shows the group headings", () => {
    setup();
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText("Planning")).toBeTruthy();
  });

  it("selects an icon", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "code" }));
    expect(onChange).toHaveBeenCalledWith("code");
  });

  it("marks the current icon as checked, not merely coloured", () => {
    setup("rocket");
    const chosen = screen.getAllByRole("radio", { name: "rocket" })[0];
    expect(chosen.getAttribute("aria-checked")).toBe("true");
  });

  it("filters by key", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox", { name: /search icons/i }), "music");
    expect(screen.getByRole("radio", { name: "music" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "wallet" })).toBeNull();
  });

  it("filters by group name, so 'money' finds the wallet", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox", { name: /search icons/i }), "money");
    expect(screen.getByRole("radio", { name: "wallet" })).toBeTruthy();
  });

  it("says so when nothing matches", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox", { name: /search icons/i }), "zzzz");
    expect(screen.getByText(/no icons match/i)).toBeTruthy();
  });
});

describe("colour values", () => {
  it("accepts the forms people actually type", () => {
    expect(normalizeHex("#4a7ab5")).toBe("#4a7ab5");
    expect(normalizeHex("4A7AB5")).toBe("#4a7ab5");
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("  #4a7ab5  ")).toBe("#4a7ab5");
  });

  it("rejects anything that is not a colour rather than guessing", () => {
    for (const bad of ["", "blue-ish", "#12", "#1234567", "rgb(1,2,3)", "#ggg", null]) {
      expect(normalizeHex(bad as string), `${bad} should be rejected`).toBeNull();
    }
  });

  it("does not mistake a legacy key for a colour", () => {
    // "beige" is a stored key, not a hex, and must keep resolving as a preset.
    for (const key of LIFE_AREA_COLOR_KEYS) expect(isHexColor(key)).toBe(false);
  });

  it("keeps existing saved keys rendering as presets", () => {
    for (const key of LIFE_AREA_COLOR_KEYS) {
      const resolved = resolveAreaColor(key, "area-1");
      expect(resolved.kind).toBe("preset");
      // Preset colours still carry their Tailwind classes, so nothing about an
      // area saved before custom colours existed changes.
      expect(resolved.dot).toBeTruthy();
      expect(resolved.tile).toBeTruthy();
    }
  });

  it("resolves a custom colour to itself with no class to apply", () => {
    const resolved = resolveAreaColor("#8168b0", "area-1");
    expect(resolved.kind).toBe("custom");
    expect(resolved.fill).toBe("#8168b0");
    expect(resolved.dot).toBeNull();
  });

  it("falls back to a stable preset for an unusable stored value", () => {
    const a = resolveAreaColor("not-a-colour", "area-1");
    const b = resolveAreaColor("not-a-colour", "area-1");
    expect(a.kind).toBe("preset");
    expect(a.fill).toBe(b.fill);
  });

  it("picks a readable foreground by luminance, not by taste", () => {
    expect(readableForeground("#ffffff")).toBe("#111111");
    expect(readableForeground("#111111")).toBe("#ffffff");
    // Pale sand wants dark text; deep plum wants light.
    expect(readableForeground("#b09372")).toBe("#111111");
    expect(readableForeground("#9c5f97")).toBe("#ffffff");
  });

  it("offers a broad but muted palette", () => {
    expect(COLOR_PRESETS.length).toBeGreaterThanOrEqual(12);
    for (const preset of COLOR_PRESETS) {
      expect(normalizeHex(preset.hex)).toBe(preset.hex);
    }
  });
});

describe("colour picker", () => {
  function setup(value: string | null = null) {
    const onChange = vi.fn();
    render(<ColorPicker value={value} onChange={onChange} entityId="area-1" />);
    return { onChange };
  }

  it("commits a preset", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Violet" }));
    expect(onChange).toHaveBeenCalledWith("#8168b0");
  });

  it("commits a valid custom value on Enter", async () => {
    const { onChange } = setup();
    const field = screen.getByRole("textbox", { name: /custom colour hex/i });
    await userEvent.type(field, "#4a7ab5{Enter}");
    expect(onChange).toHaveBeenCalledWith("#4a7ab5");
  });

  it("normalizes shorthand and case on the way in", async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByRole("textbox", { name: /custom colour hex/i }), "ABC{Enter}");
    expect(onChange).toHaveBeenCalledWith("#aabbcc");
  });

  it("rejects a malformed value and says so, without committing", async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByRole("textbox", { name: /custom colour hex/i }), "nope{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    const message = screen.getByRole("alert");
    expect(message.textContent).toMatch(/#4a7ab5/);
    // Announced as invalid, not only shown in red.
    expect(screen.getByRole("textbox", { name: /custom colour hex/i }).getAttribute("aria-invalid")).toBe("true");
  });

  it("marks the saved preset as selected when reopened", () => {
    setup("#8168b0");
    const chosen = screen.getByRole("radio", { name: "Violet" });
    expect(chosen.getAttribute("aria-checked")).toBe("true");
    // A tick as well as the ring: this control's whole subject is colour, so
    // selection cannot be carried by colour alone.
    expect(within(chosen).queryByRole("img", { hidden: true }) ?? chosen.querySelector("svg")).toBeTruthy();
  });
});
