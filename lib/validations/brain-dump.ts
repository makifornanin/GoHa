import { z } from "zod";

import { BRAIN_DUMP_CONTENT_MAX, CONVERT_TARGETS, NOTE_COLOR_KEYS } from "@/lib/brain-dump";

export const brainDumpContentSchema = z
  .string()
  .trim()
  .min(1, "Write something to capture.")
  .max(BRAIN_DUMP_CONTENT_MAX, `Keep it under ${BRAIN_DUMP_CONTENT_MAX} characters.`);

export const brainDumpIdSchema = z.uuid("That item could not be found.");

export const convertTargetSchema = z.enum(CONVERT_TARGETS);

/** A sticky-note colour key. Rejects anything outside the palette. */
export const noteColorSchema = z.enum(NOTE_COLOR_KEYS);
