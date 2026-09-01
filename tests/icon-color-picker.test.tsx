import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ColorPicker } from "@/components/ui/color-picker";
import { IconPicker } from "@/components/ui/icon-picker";
import { lifeAreaIconMap } from "@/components/life-areas/icon";
import {
  COLOR_PRESETS,
  COMMON_ICON_KEYS,
  DEFAULT_ICON_KEY,
  ICON_GROUPS,
  LIFE_AREA_COLOR_KEYS,
  LIFE_AREA_ICON_KEYS,
  RECOMMENDED_COLORS,
  entityTint,
  isHexColor,
  normalizeHex,
  readableForeground,
  resolveAreaColor,
  toIconKey,
} from "@/lib/life-areas";
import { habitFormSchema } from "@/lib/validations/habit";

const ROOT = process.cwd();

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

  /** Open the full library, which is collapsed until asked for. */
  async function expand() {
    await userEvent.click(screen.getByRole("button", { name: /show more icons/i }));
  }

  it("starts collapsed: a short row, no library, no search", () => {
    /*
     * The point of the change. Rendering forty-three glyphs on sight made the
     * icon field the tallest thing in the form and pushed the save button off
     * screen at laptop heights.
     */
    setup();
    expect(screen.queryByRole("searchbox", { name: /search icons/i })).toBeNull();
    expect(screen.queryByText("Work")).toBeNull();
    expect(screen.queryByText("Planning")).toBeNull();
    expect(screen.getAllByRole("radio").length).toBeLessThanOrEqual(COMMON_ICON_KEYS.length + 1);
  });

  it("offers enough common icons to answer most categories without expanding", () => {
    setup();
    expect(screen.getAllByRole("radio").length).toBeGreaterThanOrEqual(6);
  });

  it("keeps the current icon visible in the collapsed row even when uncommon", () => {
    // "rocket" is not one of the common eight; collapsing must still show what
    // is selected rather than a row with nothing checked in it.
    setup("rocket");
    const chosen = screen.getAllByRole("radio", { name: "rocket" })[0];
    expect(chosen.getAttribute("aria-checked")).toBe("true");
  });

  it("selects a common icon while collapsed", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getAllByRole("radio", { name: "briefcase" })[0]);
    expect(onChange).toHaveBeenCalledWith("briefcase");
  });

  it("shows the group headings once expanded", async () => {
    setup();
    await expand();
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText("Planning")).toBeTruthy();
  });

  it("collapses again on request", async () => {
    setup();
    await expand();
    expect(screen.getByRole("searchbox", { name: /search icons/i })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /show fewer icons/i }));
    expect(screen.queryByRole("searchbox", { name: /search icons/i })).toBeNull();
    expect(screen.queryByText("Work")).toBeNull();
  });

  it("announces the expanded state for assistive technology", async () => {
    setup();
    expect(
      screen.getByRole("button", { name: /show more icons/i }).getAttribute("aria-expanded"),
    ).toBe("false");
    await expand();
    expect(
      screen.getByRole("button", { name: /show fewer icons/i }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("selects an icon", async () => {
    const { onChange } = setup();
    await expand();
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
    await expand();
    await userEvent.type(screen.getByRole("searchbox", { name: /search icons/i }), "music");
    // Scoped to the LIBRARY: the quick row stays visible above it and keeps
    // showing the common icons, which is the point of it.
    const library = within(screen.getByRole("radiogroup", { name: /all icons/i }));
    expect(library.getByRole("radio", { name: "music" })).toBeTruthy();
    expect(library.queryByRole("radio", { name: "wallet" })).toBeNull();
  });

  it("filters by group name, so 'money' finds the wallet", async () => {
    setup();
    await expand();
    await userEvent.type(screen.getByRole("searchbox", { name: /search icons/i }), "money");
    const library = within(screen.getByRole("radiogroup", { name: /all icons/i }));
    expect(library.getByRole("radio", { name: "wallet" })).toBeTruthy();
    // And nothing from an unrelated group survived the filter.
    expect(library.queryByRole("radio", { name: "music" })).toBeNull();
  });

  it("says so when nothing matches", async () => {
    setup();
    await expand();
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

  /** Open the full palette and the custom control, both collapsed by default. */
  async function expand() {
    await userEvent.click(screen.getByRole("button", { name: /more colours/i }));
  }

  it("starts compact: a short row, no hex field, no full palette", () => {
    // Seeded with a recommended colour, so the row is exactly the six. With an
    // unsaved value the derived fallback may not be one of them, and the row
    // correctly gains a seventh swatch showing what is currently in use.
    setup("#4a7ab5");
    expect(screen.queryByRole("textbox", { name: /custom colour hex/i })).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(RECOMMENDED_COLORS.length);
    expect(screen.queryByRole("radio", { name: "Plum" })).toBeNull();
  });

  it("shows what is in use when nothing has been saved yet", () => {
    // The derived fallback is a real colour the entity is already drawn with,
    // so it belongs in the row rather than leaving it looking unset.
    setup(null);
    expect(screen.getAllByRole("radio").length).toBeLessThanOrEqual(RECOMMENDED_COLORS.length + 1);
    expect(screen.getAllByRole("radio").some((r) => r.getAttribute("aria-checked") === "true")).toBe(true);
  });

  it("offers a small, distinct set of recommended colours", () => {
    setup();
    expect(RECOMMENDED_COLORS.length).toBeGreaterThanOrEqual(5);
    expect(RECOMMENDED_COLORS.length).toBeLessThanOrEqual(6);
    // Every recommendation is a real preset, so the two cannot drift apart.
    for (const rec of RECOMMENDED_COLORS) {
      expect(COLOR_PRESETS.some((p) => p.hex === rec.hex && p.label === rec.label)).toBe(true);
    }
  });

  it("keeps a custom colour visible in the compact row", () => {
    /*
     * A custom colour is in none of the six. Showing the row with nothing
     * selected would read as "no colour chosen" when one plainly is.
     */
    setup("#123456");
    expect(
      screen.getByRole("radio", { name: /current colour/i }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("keeps a non-recommended preset visible in the compact row", () => {
    setup("#9c5f97"); // Plum: a real preset, but not one of the six
    expect(
      screen.getByRole("radio", { name: /current colour/i }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("reveals the whole palette and the custom control on request", async () => {
    setup();
    await expand();
    expect(screen.getByRole("radio", { name: "Plum" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /custom colour hex/i })).toBeTruthy();
    expect(screen.getByLabelText(/pick a custom colour/i)).toBeTruthy();
  });

  it("offers a native swatch, so the primary path needs no typing", async () => {
    setup();
    await expand();
    const swatch = screen.getByLabelText(/pick a custom colour/i) as HTMLInputElement;
    expect(swatch.type).toBe("color");
  });

  it("commits a colour chosen from the native swatch", async () => {
    const { onChange } = setup();
    await expand();
    const swatch = screen.getByLabelText(/pick a custom colour/i) as HTMLInputElement;
    fireEvent.change(swatch, { target: { value: "#123456" } });
    expect(onChange).toHaveBeenCalledWith("#123456");
  });

  it("commits a preset", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Violet" }));
    expect(onChange).toHaveBeenCalledWith("#8168b0");
  });

  it("commits a valid custom value on Enter", async () => {
    const { onChange } = setup();
    await expand();
    const field = screen.getByRole("textbox", { name: /custom colour hex/i });
    await userEvent.type(field, "#4a7ab5{Enter}");
    expect(onChange).toHaveBeenCalledWith("#4a7ab5");
  });

  it("normalizes shorthand and case on the way in", async () => {
    const { onChange } = setup();
    await expand();
    await userEvent.type(screen.getByRole("textbox", { name: /custom colour hex/i }), "ABC{Enter}");
    expect(onChange).toHaveBeenCalledWith("#aabbcc");
  });

  it("rejects a malformed value and says so, without committing", async () => {
    const { onChange } = setup();
    await expand();
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

/**
 * One picker, everywhere it matters.
 *
 * GoHa had three colour controls: the shared picker in Life Areas, a six-key
 * row of its own in Habits, and a third inline palette in the planner's category
 * editor. Only one of them could reach a custom colour, so the same question
 * got a different answer depending on which form you were in.
 *
 * Checked at the source rather than through three renders, because what matters
 * is that no surface grows its own again.
 */
describe("colour and icon selection is shared", () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
  const SURFACES = [
    "components/life-areas/life-area-form-modal.tsx",
    "components/habits/habit-form-modal.tsx",
    "components/planner/planner-view.tsx",
  ];

  it.each(SURFACES)("%s uses the shared pickers", (rel) => {
    const src = read(rel);
    expect(src).toContain("@/components/ui/color-picker");
    expect(src).toContain("@/components/ui/icon-picker");
  });

  it.each(SURFACES)("%s does not hand-roll a palette", (rel) => {
    /*
     * The specific shape each one had: mapping the key list into swatch buttons.
     * Importing the keys is fine (defaults still need them); iterating them into
     * a control is the thing that made a second picker.
     */
    const src = read(rel);
    expect(src).not.toMatch(/LIFE_AREA_COLOR_KEYS\.map/);
    expect(src).not.toMatch(/LIFE_AREA_ICON_KEYS\.map/);
  });

  it("paints a custom colour with a validated value, never a raw string", () => {
    // entityTint is the only thing that turns a stored colour into CSS, and it
    // only ever emits a hex that normalizeHex has already accepted.
    const custom = entityTint(resolveAreaColor("#8168b0", "x"));
    expect(custom.solid.style?.backgroundColor).toBe("#8168b0");
    expect(custom.tile.style?.color).toBe("#8168b0");
    expect(custom.tile.style?.backgroundColor).toBe("#8168b026");
    expect(custom.solid.className).toBe("");
  });

  it("leaves preset colours on their existing classes", () => {
    // Nothing about an entity saved before custom colours existed changes.
    const preset = entityTint(resolveAreaColor("teal", "x"));
    expect(preset.solid.className).toBeTruthy();
    expect(preset.solid.style).toBeUndefined();
    expect(preset.tile.style).toBeUndefined();
  });

  it("never produces CSS from a value that is not a colour", () => {
    // A junk stored value resolves to a PRESET, so it can only ever emit a class.
    const junk = entityTint(resolveAreaColor("javascript:alert(1)", "x"));
    expect(junk.solid.style).toBeUndefined();
    expect(junk.solid.className).toBeTruthy();
  });
});

/**
 * Habits can now hold a custom colour, and still hold every old one.
 *
 * The column was already `text`, so this widened what validates rather than
 * what is stored: no migration, and every habit saved as "teal" keeps working.
 */
describe("habit colour accepts the same range as a life area", () => {
  const parse = (color: string) =>
    habitFormSchema.safeParse({
      name: "Walk",
      type: "boolean",
      scheduleType: "daily",
      color,
    });

  it("accepts a custom hex", () => {
    const result = parse("#8168b0");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.color).toBe("#8168b0");
  });

  it("normalizes shorthand and case on the way in", () => {
    const result = parse("ABC");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.color).toBe("#aabbcc");
  });

  it("still accepts every legacy key", () => {
    for (const key of LIFE_AREA_COLOR_KEYS) {
      expect(parse(key).success, key).toBe(true);
    }
  });

  it("rejects anything that is not a colour", () => {
    for (const bad of ["blue-ish", "#12", "rgb(1,2,3)", "javascript:alert(1)"]) {
      expect(parse(bad).success, bad).toBe(false);
    }
  });
});
