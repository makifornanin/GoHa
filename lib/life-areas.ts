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

/** Narrow an arbitrary stored value to a known color key, falling back to default. */
export function toColorKey(value: string | null | undefined): LifeAreaColorKey {
  return LIFE_AREA_COLOR_KEYS.includes(value as LifeAreaColorKey)
    ? (value as LifeAreaColorKey)
    : DEFAULT_COLOR_KEY;
}

/** Narrow an arbitrary stored value to a known icon key, falling back to default. */
export function toIconKey(value: string | null | undefined): LifeAreaIconKey {
  return LIFE_AREA_ICON_KEYS.includes(value as LifeAreaIconKey)
    ? (value as LifeAreaIconKey)
    : DEFAULT_ICON_KEY;
}
