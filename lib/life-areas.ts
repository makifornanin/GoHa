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

/** Curated icon set for life areas. Keys are stable; components map them to lucide. */
export const LIFE_AREA_ICON_KEYS = [
  "target",
  "briefcase",
  "heart",
  "wallet",
  "growth",
  "family",
  "rocket",
  "home",
  "fitness",
  "sparkles",
  "leaf",
  "globe",
] as const;
export type LifeAreaIconKey = (typeof LIFE_AREA_ICON_KEYS)[number];
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
