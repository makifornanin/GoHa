import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The design system's type scale, declared as `--text-*` in `@theme`.
 *
 * tailwind-merge has to be told about these. It only knows Tailwind's stock font
 * sizes (`sm`, `lg`, ...), so it read `text-body` as a text COLOUR and treated it
 * as conflicting with `text-label`, silently dropping the size: every
 * `cn("text-body text-label")` in the primitives resolved to `text-label` alone
 * and rendered at the browser default instead of 14px. Listing the scale here
 * puts each name in the font-size group where it belongs.
 */
const FONT_SIZES = [
  "large-title",
  "title-1",
  "title-2",
  "title-3",
  "headline",
  "body",
  "callout",
  "subhead",
  "footnote",
  "caption",
  "display-lg",
  "display",
  "headline-lg",
  "headline-lg-mobile",
  "headline-md",
  "body-lg",
  "body-md",
  "body-sm",
  "label-md",
  "label-sm",
  "mono-xl",
  "mono-lg",
  "mono-md",
  "mono-sm",
] as const;

/** The `--color-*` tokens whose names would otherwise look like a font size. */
const TEXT_COLORS = [
  "label",
  "label-secondary",
  "label-tertiary",
  "label-quaternary",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
      "text-color": [{ text: [...TEXT_COLORS] }],
    },
  },
});

/** Merge conditional class names and de-duplicate conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
