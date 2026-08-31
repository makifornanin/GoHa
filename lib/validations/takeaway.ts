import { z } from "zod";

/**
 * The takeaway's contract, kept OUT of the Server Action file.
 *
 * A `"use server"` module may only export async functions, so a limit or a
 * schema declared there is a build error the moment anything imports it. It
 * also has to reach the browser: the composer counts characters as they are
 * typed, and a client that guessed at the limit would let someone write past it
 * and only discover the ceiling on save.
 */

/**
 * A takeaway is a thought, not an essay.
 *
 * Long enough to say something real, short enough that the field never becomes
 * a page. The purpose is a moment of reflection on one verse or quote, and a
 * box that invites a thousand words is a different feature.
 */
export const TAKEAWAY_MAX = 600;

export const takeawayBodySchema = z
  .string()
  .trim()
  .max(TAKEAWAY_MAX, `Keep it to ${TAKEAWAY_MAX} characters or fewer.`);
