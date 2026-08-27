import { z } from "zod";

import {
  DEFAULT_COLOR_KEY,
  DEFAULT_ICON_KEY,
  isHexColor,
  normalizeHex,
  LIFE_AREA_COLOR_KEYS,
  LIFE_AREA_DESCRIPTION_MAX,
  LIFE_AREA_ICON_KEYS,
  LIFE_AREA_NAME_MAX,
  LIFE_AREA_WEIGHT_MAX,
  LIFE_AREA_WEIGHT_MIN,
} from "@/lib/life-areas";

/**
 * Validation for Life Area create/edit input. This is the server boundary
 * contract (CLAUDE.md section 5): Server Actions parse untrusted input with this
 * schema before touching the database, and the form uses it for inline client
 * validation so both sides agree.
 */
export const lifeAreaFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give this area a name.")
    .max(LIFE_AREA_NAME_MAX, `Keep the name to ${LIFE_AREA_NAME_MAX} characters or fewer.`),
  description: z
    .string()
    .trim()
    .max(
      LIFE_AREA_DESCRIPTION_MAX,
      `Keep the description to ${LIFE_AREA_DESCRIPTION_MAX} characters or fewer.`,
    )
    .optional()
    // Normalize empty/whitespace to null so the DB stores an absent description.
    .transform((value) => (value && value.length > 0 ? value : null)),
  /*
   * One of the six original keys, or a custom `#rrggbb`.
   *
   * Still a closed set, not free text: a value that is neither is rejected at
   * the boundary rather than stored and rendered as nothing. Widening this is
   * what let custom colours reuse the existing column instead of needing a
   * migration, and the legacy keys keep validating exactly as before.
   */
  color: z
    .string()
    .default(DEFAULT_COLOR_KEY)
    .refine(
      (value) => LIFE_AREA_COLOR_KEYS.includes(value as never) || isHexColor(value),
      "Choose a colour from the palette, or enter one like #4a7ab5.",
    )
    .transform((value) => normalizeHex(value) ?? value),
  icon: z.enum(LIFE_AREA_ICON_KEYS as unknown as [string, ...string[]]).default(DEFAULT_ICON_KEY),
  weight: z.coerce
    .number()
    .int("Importance must be a whole number.")
    .min(LIFE_AREA_WEIGHT_MIN, `Importance must be at least ${LIFE_AREA_WEIGHT_MIN}.`)
    .max(LIFE_AREA_WEIGHT_MAX, `Importance can be at most ${LIFE_AREA_WEIGHT_MAX}.`)
    .default(LIFE_AREA_WEIGHT_MIN),
});

/** Raw input as accepted from the form (before defaults/transforms). */
export type LifeAreaFormInput = z.input<typeof lifeAreaFormSchema>;
/** Parsed, normalized values ready for the repository. */
export type LifeAreaFormValues = z.output<typeof lifeAreaFormSchema>;

/** A life area id. Used to validate ids arriving from the client. */
export const lifeAreaIdSchema = z.uuid("That life area could not be found.");

export type LifeAreaFieldErrors = Partial<Record<keyof LifeAreaFormValues, string>>;

/** Reduce a ZodError to the first message per field, for inline form display. */
export function toFieldErrors(error: z.ZodError): LifeAreaFieldErrors {
  const errors: LifeAreaFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) {
      errors[key as keyof LifeAreaFormValues] = issue.message;
    }
  }
  return errors;
}
