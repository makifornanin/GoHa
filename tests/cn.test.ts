import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

/**
 * tailwind-merge only knows Tailwind's stock font sizes. Without being told
 * about the design system's `--text-*` scale it read `text-body` as a text
 * COLOUR, decided it conflicted with `text-label`, and dropped the size: every
 * input, textarea and button in the primitives silently lost its type scale.
 * These lock that behaviour down in both directions.
 */
describe("cn", () => {
  it("keeps a type-scale class alongside a colour class", () => {
    expect(cn("text-body text-label")).toBe("text-body text-label");
    expect(cn("text-callout text-label-secondary")).toBe("text-callout text-label-secondary");
    expect(cn("text-footnote text-label-tertiary")).toBe("text-footnote text-label-tertiary");
    expect(cn("text-headline text-label")).toBe("text-headline text-label");
    expect(cn("text-mono-sm text-label-quaternary")).toBe("text-mono-sm text-label-quaternary");
  });

  it("keeps a type-scale class alongside a palette colour", () => {
    expect(cn("text-body text-blue")).toBe("text-body text-blue");
    expect(cn("text-title-2 text-red")).toBe("text-title-2 text-red");
  });

  it("does not confuse the label-* type sizes with the label colours", () => {
    expect(cn("text-label-sm text-label")).toBe("text-label-sm text-label");
    expect(cn("text-label-md text-label-secondary")).toBe("text-label-md text-label-secondary");
  });

  it("still collapses two classes from the same group", () => {
    expect(cn("text-body text-callout")).toBe("text-callout");
    expect(cn("text-label text-label-secondary")).toBe("text-label-secondary");
    expect(cn("p-2 p-4")).toBe("p-4");
  });

  it("still lets an override win, which is the reason cn exists", () => {
    expect(cn("text-body text-label", "text-footnote")).toBe("text-label text-footnote");
    expect(cn("rounded-lg", "rounded-full")).toBe("rounded-full");
  });
});
