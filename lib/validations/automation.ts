import { z } from "zod";

/**
 * Zod at the automation boundary (CLAUDE.md section 5). Same discipline as the
 * Server Actions: nothing reaches a repository unvalidated, and the messages
 * are written for whoever is debugging a workflow at seven in the morning.
 */

export const TOKEN_NAME_MAX = 60;
export const DEDUPE_KEY_MAX = 200;
export const BRAIN_DUMP_MAX = 2000;

/** A local calendar date, never an instant (CLAUDE.md section 6). */
export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a local date in YYYY-MM-DD form.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "That is not a real date.");

/** The kinds the log accepts, matching the `notification_kind` enum. */
export const notificationKindSchema = z.enum([
  "morning_brief",
  "evening_summary",
  "deadline",
  "focus_overrun",
  "streak_risk",
  "graveyard",
  "review_draft",
  "health",
  "sabbath",
]);

/**
 * The claim itself.
 *
 * `dedupeKey` is free text because the scheme keys on things that are not days
 * (`deadline:{taskId}:{dueAtIso}`, `focus:{sessionId}:overrun`). It is trimmed
 * and length-capped, and that is all: inventing a format here would break the
 * moment a guide adds a kind, and the uniqueness that matters is enforced by
 * the database.
 */
export const claimLogSchema = z.object({
  kind: notificationKindSchema,
  dedupeKey: z
    .string()
    .trim()
    .min(1, "A dedupeKey is required so a repeat run cannot send twice.")
    .max(DEDUPE_KEY_MAX, `Keep the dedupeKey under ${DEDUPE_KEY_MAX} characters.`),
  /** Defaults to the OWNER's local today, resolved server-side. */
  localDate: isoDateSchema.optional(),
  entityType: z.string().trim().max(40).optional().nullable(),
  entityId: z.uuid().optional().nullable(),
  /** What was sent. Read back for repeat detection (Guide 05, step 1.4). */
  payload: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type ClaimLogInput = z.infer<typeof claimLogSchema>;

/** Voice capture from a Shortcut, straight into the Brain Dump inbox. */
export const brainDumpCaptureSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Nothing to capture.")
    .max(BRAIN_DUMP_MAX, `Keep it under ${BRAIN_DUMP_MAX} characters.`),
});

/** The AI's weekly review draft. Length-capped so the '[AI draft] ' prefix fits. */
export const reviewDraftSchema = z.object({
  weekStart: isoDateSchema,
  wins: z.string().trim().min(1).max(1500).optional().nullable(),
  challenges: z.string().trim().min(1).max(1500).optional().nullable(),
  nextWeekFocus: z.string().trim().min(1).max(1500).optional().nullable(),
});

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

/**
 * Quotes and verses pushed in by an automation.
 *
 * GoHa ships no content of its own: the pool is fed from whatever source you
 * trust, so this is the shape that door accepts. Length caps match the column;
 * `verified` is deliberately not a field, because it is not something a request
 * gets to assert (BUILD_PLAN hard rule 6).
 */
export const QUOTE_TEXT_MAX = 500;
export const QUOTE_BATCH_MAX = 200;

const quoteEntrySchema = z
  .object({
    source: z.enum(["quote", "verse"]),
    text: z
      .string()
      .trim()
      .min(1, "A quote needs text.")
      .max(QUOTE_TEXT_MAX, `Keep the text under ${QUOTE_TEXT_MAX} characters.`),
    /** "Proverbs 16:3 (WEB)", "Annie Dillard". */
    attribution: z.string().trim().max(200).optional().nullable(),
    /** A second rendering, e.g. a Tagalog translation. */
    translation: z.string().trim().max(QUOTE_TEXT_MAX).optional().nullable(),
    /** Free tag. "rest" is the pool the Sabbath message draws from. */
    theme: z.string().trim().max(40).optional().nullable(),
    /** Show this one on this exact local date, beating the pool pick. */
    pinnedFor: isoDateSchema.optional().nullable(),
    /** Shorthand for "pin to the owner's today", resolved server-side. */
    pinToday: z.boolean().optional(),
  })
  .refine((value) => !(value.pinnedFor && value.pinToday), {
    message: "Use pinnedFor or pinToday, not both.",
    path: ["pinToday"],
  });

export const pushQuotesSchema = z.object({
  quotes: z
    .array(quoteEntrySchema)
    .min(1, "Send at least one quote.")
    .max(QUOTE_BATCH_MAX, `Send at most ${QUOTE_BATCH_MAX} at a time.`),
});

export type PushQuotesInput = z.input<typeof pushQuotesSchema>;
