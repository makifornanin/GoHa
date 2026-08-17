import { z } from "zod";

/**
 * Zod at the automation boundary (CLAUDE.md section 5). Same discipline as the
 * Server Actions: nothing reaches a repository unvalidated, and the messages
 * are written for whoever is debugging a workflow at seven in the morning.
 */

export const TOKEN_NAME_MAX = 60;
export const DELIVERY_KIND_MAX = 60;
export const DELIVERY_DETAIL_MAX = 500;

/** A local calendar date, never an instant (CLAUDE.md section 6). */
export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a local date in YYYY-MM-DD form.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "That is not a real date.");

/**
 * The name an automation gives what it sends. Constrained to a slug so the
 * ledger stays groupable: "morning-brief" and "Morning Brief " must not become
 * two different kinds that both think they are first.
 */
export const deliveryKindSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Name what you are sending, e.g. \"morning-brief\".")
  .max(DELIVERY_KIND_MAX, `Keep the kind under ${DELIVERY_KIND_MAX} characters.`)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and hyphens.");

export const claimDeliverySchema = z.object({
  kind: deliveryKindSchema,
  /** Optional: defaults to the owner's local today, resolved on the server. */
  date: isoDateSchema.optional(),
  detail: z
    .string()
    .trim()
    .max(DELIVERY_DETAIL_MAX, `Keep the detail under ${DELIVERY_DETAIL_MAX} characters.`)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
});

export type ClaimDeliveryInput = z.infer<typeof claimDeliverySchema>;

export const tokenNameSchema = z
  .string()
  .trim()
  .min(1, "Give the token a name you will recognise later.")
  .max(TOKEN_NAME_MAX, `Keep the name under ${TOKEN_NAME_MAX} characters.`);

export const tokenScopeSchema = z.enum(["read", "read_write"]);

export const createTokenSchema = z.object({
  name: tokenNameSchema,
  scope: tokenScopeSchema.default("read"),
  /** Days until it expires. Absent means it does not expire on its own. */
  expiresInDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
});

export type CreateTokenInput = z.input<typeof createTokenSchema>;
