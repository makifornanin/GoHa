/**
 * Shared, client-safe constants for the Life Areas feature: the palette and icon
 * sets a user can pick from, plus field limits. This is the single source of
 * truth reused by the Zod schema, the form pickers, and the card renderer, so
 * validation and UI can never drift apart. No hex values live here: colors are
 * expressed as design tokens (CLAUDE.md section 9).
 */

export const LIFE_AREA_NAME_MAX = 60;
export const LIFE_AREA_DESCRIPTION_MAX = 280;
export const LIFE_AREA_WEIGHT_MIN = 1;
export const LIFE_AREA_WEIGHT_MAX = 5;

/** Accent color keys. Each maps to on-brand token utilities (see below). */
export const LIFE_AREA_COLOR_KEYS = [
  "teal",
  "bronze",
  "violet",
  "beige",
  "lavender",
  "slate",
] as const;
export type LifeAreaColorKey = (typeof LIFE_AREA_COLOR_KEYS)[number];
export const DEFAULT_COLOR_KEY: LifeAreaColorKey = "teal";

/**
 * Token-based utility classes per accent, drawn from the Apple system palette
 * (docs/GOHA_DESIGN_SPEC.md section 4): app chrome stays neutral, color comes
 * from user data. The stored KEYS are unchanged (they live in the database and
 * the Zod enum); only their rendered colors are remapped. `tile` styles the
 * icon chip, `blob` the ambient corner accent, `swatch` the picker dot, `dot`
 * the 8px list indicator, `fill` the raw color for checkbox fills.
 */
export const lifeAreaColorConfig: Record<
  LifeAreaColorKey,
  { label: string; tile: string; blob: string; swatch: string; dot: string; fill: string }
> = {
  teal: {
    label: "Teal",
    tile: "bg-system-teal/15 text-system-teal",
    blob: "bg-system-teal/8",
    swatch: "bg-system-teal",
    dot: "bg-system-teal",
    fill: "var(--system-teal)",
  },
  bronze: {
    label: "Orange",
    tile: "bg-orange/15 text-orange",
    blob: "bg-orange/8",
    swatch: "bg-orange",
    dot: "bg-orange",
    fill: "var(--orange)",
  },
  violet: {
    label: "Purple",
    tile: "bg-purple/15 text-purple",
    blob: "bg-purple/8",
    swatch: "bg-purple",
    dot: "bg-purple",
    fill: "var(--purple)",
  },
  beige: {
    label: "Yellow",
    tile: "bg-yellow/20 text-orange",
    blob: "bg-yellow/10",
    swatch: "bg-yellow",
    dot: "bg-yellow",
    fill: "var(--yellow)",
  },
  lavender: {
    label: "Indigo",
    tile: "bg-indigo/15 text-indigo",
    blob: "bg-indigo/8",
    swatch: "bg-indigo",
    dot: "bg-indigo",
    fill: "var(--indigo)",
  },
  slate: {
    label: "Gray",
    tile: "bg-gray-5 text-label-secondary",
    blob: "bg-gray-5/50",
    swatch: "bg-gray-1",
    dot: "bg-gray-1",
    fill: "var(--gray-1)",
  },
};

/**
 * The icon catalog, grouped for the picker.
 *
 * Keys are STABLE and stored in the database, so the original twelve keep both
 * their names and their meaning: an area saved as "growth" still renders the
 * same glyph it always did. Everything here is lucide, the one family GoHa
 * already uses, so nothing looks borrowed from another set.
 *
 * Grouped rather than dumped into one grid. Forty-odd icons in a flat wall is
 * slower to search than a list of headings, and the headings are also what make
 * the picker answer the real question, which is "what is this area about"
 * rather than "which of these little pictures do I like".
 */
export const ICON_GROUPS = [
  {
    label: "Work",
    keys: ["briefcase", "business", "code", "automation", "projects", "meeting"],
  },
  {
    label: "Learning",
    keys: ["growth", "school", "reading", "language", "science"],
  },
  {
    label: "Money",
    keys: ["wallet", "savings", "investing", "shopping"],
  },
  {
    label: "Body",
    keys: ["heart", "fitness", "food", "sleep", "outdoors", "medical"],
  },
  {
    label: "People",
    keys: ["family", "relationships", "friends", "pets"],
  },
  {
    label: "Life",
    keys: ["home", "travel", "car", "leaf", "globe"],
  },
  {
    label: "Making",
    keys: ["creativity", "music", "writing", "photo", "design"],
  },
  {
    label: "Inner",
    keys: ["spirituality", "mindfulness", "sparkles", "journal"],
  },
  {
    label: "Planning",
    keys: ["target", "planning", "routines", "habits", "rocket", "milestone"],
  },
] as const;

/** One key from any group. Derived, so a group edit updates the type with it. */
export type LifeAreaIconKey = (typeof ICON_GROUPS)[number]["keys"][number];

/** Every key, flattened. The order here is the order the picker shows them in. */
export const LIFE_AREA_ICON_KEYS: readonly LifeAreaIconKey[] = ICON_GROUPS.flatMap(
  (group) => group.keys as readonly LifeAreaIconKey[],
);
export const DEFAULT_ICON_KEY: LifeAreaIconKey = "target";

/**
 * The colour to preselect for a NEW life area: the first one not already in use.
 *
 * Every area used to default to the same key, so a fresh system rendered its
 * areas in identical colours with identical icons and they were impossible to
 * tell apart at a glance. The colour is the spine of the whole app's palette:
 * it tints this area's goals, tasks and habits everywhere else, so two areas
 * sharing one is a real loss of meaning, not just a cosmetic one.
 *
 * Falls back to the default once the palette is exhausted; the user can always
 * override the suggestion in the picker.
 */
export function nextUnusedColorKey(
  used: readonly (string | null | undefined)[],
): LifeAreaColorKey {
  const taken = new Set(used.map(toColorKey));
  return LIFE_AREA_COLOR_KEYS.find((key) => !taken.has(key)) ?? DEFAULT_COLOR_KEY;
}

/** Narrow an arbitrary stored value to a known color key, falling back to default. */
export function toColorKey(value: string | null | undefined): LifeAreaColorKey {
  return LIFE_AREA_COLOR_KEYS.includes(value as LifeAreaColorKey)
    ? (value as LifeAreaColorKey)
    : DEFAULT_COLOR_KEY;
}

/** Stable hash so an id always resolves to the same palette slot. */
function hashToIndex(id: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % length;
}

/**
 * The colour to PAINT something with: an explicit choice if there is one,
 * otherwise a stable colour derived from its id.
 *
 * `toColorKey` collapses every unset value to a single default, so anything
 * created without opening the colour picker came out the same teal. Areas named
 * "Health & Fitness" and "Career & Craft" were then visually identical, which
 * defeats the point of a colour-coded system: nothing could be told apart at a
 * glance, and the whole app read as monochrome.
 *
 * Deriving from the id keeps the choice stable across renders and sessions
 * (never random), and an explicit colour always wins.
 */
export function resolveColorKey(
  color: string | null | undefined,
  id: string,
): LifeAreaColorKey {
  if (LIFE_AREA_COLOR_KEYS.includes(color as LifeAreaColorKey)) {
    return color as LifeAreaColorKey;
  }
  return LIFE_AREA_COLOR_KEYS[hashToIndex(id, LIFE_AREA_COLOR_KEYS.length)];
}

/**
 * The colour for something that BELONGS to a life area (a goal, task, or
 * habit): its own explicit colour if set, otherwise its area's colour, and only
 * then a stable colour of its own.
 *
 * Inheriting from the area is what makes the palette mean something: everything
 * under "Health & Fitness" reads in one colour across Today, To-dos, Goals and
 * Habits, so the colour answers "which part of my life is this?" rather than
 * being decoration.
 */
export function entityColorKey(
  ownColor: string | null | undefined,
  area: { id: string; color: string | null } | null | undefined,
  fallbackId: string,
): LifeAreaColorKey {
  if (LIFE_AREA_COLOR_KEYS.includes(ownColor as LifeAreaColorKey)) {
    return ownColor as LifeAreaColorKey;
  }
  if (area) return resolveColorKey(area.color, area.id);
  return resolveColorKey(null, fallbackId);
}

/** Narrow an arbitrary stored value to a known icon key, falling back to default. */
export function toIconKey(value: string | null | undefined): LifeAreaIconKey {
  return LIFE_AREA_ICON_KEYS.includes(value as LifeAreaIconKey)
    ? (value as LifeAreaIconKey)
    : DEFAULT_ICON_KEY;
}

// ---------------------------------------------------------------------------
// Custom colours
// ---------------------------------------------------------------------------

/**
 * A broader palette, stored as hex in the SAME `color` column.
 *
 * The six original keys ("teal", "violet", ...) are unchanged and still resolve
 * through `lifeAreaColorConfig`, so every area saved before today renders
 * exactly as it did. New choices are written as `#rrggbb` instead, which the
 * column already accepts because it is plain text. That is the whole reason
 * there is no migration here: the shape of the data did not change, only the
 * range of values it can hold.
 *
 * Muted on purpose. These sit behind real content as dots, chips and edges, so
 * a saturated neon reads as an error state rather than as a category.
 */
export const COLOR_PRESETS: readonly { label: string; hex: string }[] = [
  { label: "Slate", hex: "#64748b" },
  { label: "Stone", hex: "#78716c" },
  { label: "Rose", hex: "#be5f6a" },
  { label: "Red", hex: "#c05b52" },
  { label: "Amber", hex: "#c08a3e" },
  { label: "Olive", hex: "#7d8c4e" },
  { label: "Green", hex: "#4f8a63" },
  { label: "Emerald", hex: "#3f8f7a" },
  { label: "Teal", hex: "#30b0c7" },
  { label: "Cyan", hex: "#4a90a4" },
  { label: "Blue", hex: "#4a7ab5" },
  { label: "Indigo", hex: "#6470b8" },
  { label: "Violet", hex: "#8168b0" },
  { label: "Plum", hex: "#9c5f97" },
  { label: "Clay", hex: "#a9705c" },
  { label: "Sand", hex: "#b09372" },
];

/**
 * The handful offered before anyone asks for more.
 *
 * Six is about what a row can hold at 390px without shrinking the targets, and
 * about as many as anyone compares at once. Chosen to be distinguishable from
 * each other rather than to mean anything: nothing in GoHa reads a category's
 * colour as a category, so "green" carries no promise about health and "blue"
 * none about work.
 *
 * Derived from COLOR_PRESETS by label so the two can never drift apart.
 */
export const RECOMMENDED_COLOR_LABELS = [
  "Blue",
  "Teal",
  "Green",
  "Amber",
  "Violet",
  "Slate",
] as const;

export const RECOMMENDED_COLORS: readonly { label: string; hex: string }[] =
  RECOMMENDED_COLOR_LABELS.map(
    (label) => COLOR_PRESETS.find((preset) => preset.label === label)!,
  );

/**
 * The icons shown before the library is opened.
 *
 * A spread across the groups rather than the first eight of one, so the
 * collapsed row can answer most categories without expanding: something for
 * work, study, body, money, home, planning and a neutral default.
 */
export const COMMON_ICON_KEYS: readonly LifeAreaIconKey[] = [
  "target",
  "briefcase",
  "growth",
  "heart",
  "fitness",
  "wallet",
  "home",
  "sparkles",
];

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Whether a stored value is a custom colour rather than one of the old keys. */
export function isHexColor(value: string | null | undefined): boolean {
  return typeof value === "string" && HEX_PATTERN.test(value.trim());
}

/**
 * Normalize user input to `#rrggbb`, or null when it is not a colour.
 *
 * Accepts the forms people actually type: with or without the hash, three
 * digits or six, any case. Anything else is rejected rather than guessed at, so
 * a typo becomes a visible validation message instead of a silently wrong
 * colour.
 */
export function normalizeHex(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;
  return `#${full}`;
}

/**
 * Relative luminance, for deciding whether a colour wants light or dark text.
 *
 * The sRGB coefficients from WCAG. A user is free to pick pale sand or deep
 * plum, and white-on-sand is unreadable while black-on-plum is too, so the
 * foreground is derived rather than fixed.
 */
export function hexLuminance(hex: string): number {
  const normalized = normalizeHex(hex) ?? "#000000";
  const channel = (pair: string) => {
    const value = parseInt(pair, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(normalized.slice(1, 3));
  const g = channel(normalized.slice(3, 5));
  const b = channel(normalized.slice(5, 7));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Readable foreground for a custom colour, chosen by luminance not by taste.
 *
 * The threshold is the real crossover, not a guess. WCAG contrast against white
 * is 1.05 / (L + 0.05) and against black is (L + 0.05) / 0.05; those are equal
 * at L = 0.179, so anything lighter takes dark text and anything darker takes
 * light. An earlier 0.45 put white on mid-tan, which measures about 2.7:1 and
 * is unreadable, where black on the same swatch measures about 7.8:1.
 */
const LUMINANCE_CROSSOVER = 0.179;

export function readableForeground(hex: string): "#ffffff" | "#111111" {
  return hexLuminance(hex) > LUMINANCE_CROSSOVER ? "#111111" : "#ffffff";
}

/**
 * The one colour answer for an entity, whichever form it was saved in.
 *
 * `fill` is always a usable CSS colour: a token reference for a legacy key, the
 * hex itself for a custom one. Call sites that only need a colour can use it
 * without caring which kind it is; the ones that style with Tailwind classes
 * check `tile`/`dot`, which are null for custom colours.
 */
export function resolveAreaColor(
  color: string | null | undefined,
  id: string,
): { kind: "preset" | "custom"; fill: string; tile: string | null; dot: string | null } {
  const hex = isHexColor(color) ? normalizeHex(color) : null;
  if (hex) return { kind: "custom", fill: hex, tile: null, dot: null };

  const key = resolveColorKey(color, id);
  const config = lifeAreaColorConfig[key];
  return { kind: "preset", fill: config.fill, tile: config.tile, dot: config.dot };
}

/**
 * How to paint a resolved entity colour, without ever emitting a raw CSS string.
 *
 * Preset colours keep their Tailwind classes, so nothing about an entity saved
 * before custom colours existed changes. A custom colour has no class to apply,
 * so it becomes an inline style built from a value `normalizeHex` has already
 * validated as `#rrggbb`: the hex itself for the foreground, and the same hex at
 * 15% for the tinted background, which is what the preset `tile` classes do.
 *
 * `solid` is for dots, bars and segments; `tile` is for the icon chips that need
 * a readable glyph on a tint.
 */
export function entityTint(resolved: ReturnType<typeof resolveAreaColor>): {
  solid: { className: string; style?: { backgroundColor: string } };
  tile: { className: string; style?: { backgroundColor: string; color: string } };
} {
  if (resolved.dot && resolved.tile) {
    return { solid: { className: resolved.dot }, tile: { className: resolved.tile } };
  }
  return {
    solid: { className: "", style: { backgroundColor: resolved.fill } },
    // `26` is 15% alpha in hex, matching the /15 the preset tiles use.
    tile: { className: "", style: { backgroundColor: `${resolved.fill}26`, color: resolved.fill } },
  };
}
