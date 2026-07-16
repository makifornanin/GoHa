"use server";

import { revalidatePath } from "next/cache";

import { lifeAreasRepo, type LifeArea } from "@/db";
import { requireUser } from "@/lib/session";
import {
  lifeAreaFormSchema,
  lifeAreaIdSchema,
  toFieldErrors,
  type LifeAreaFieldErrors,
  type LifeAreaFormInput,
} from "@/lib/validations/life-area";

/** Discriminated result every Life Area action returns. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: LifeAreaFieldErrors };

const GENERIC_ERROR = "Something went wrong saving that. Please try again.";

/**
 * Create a life area for the signed-in owner. Identity comes from the session
 * (never from the client), input is Zod-validated, and the repository scopes the
 * write to the user (CLAUDE.md section 5).
 */
export async function createLifeAreaAction(
  input: LifeAreaFormInput,
): Promise<ActionResult<LifeArea>> {
  const user = await requireUser();

  const parsed = lifeAreaFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    const area = await lifeAreasRepo.createLifeArea(user.id, parsed.data);
    revalidatePath("/life-areas");
    return { ok: true, data: area };
  } catch (error) {
    console.error("createLifeAreaAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Edit an existing life area the caller owns. */
export async function updateLifeAreaAction(
  id: string,
  input: LifeAreaFormInput,
): Promise<ActionResult<LifeArea>> {
  const user = await requireUser();

  const idResult = lifeAreaIdSchema.safeParse(id);
  if (!idResult.success) {
    return { ok: false, error: "That life area could not be found." };
  }

  const parsed = lifeAreaFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    const area = await lifeAreasRepo.updateLifeArea(user.id, idResult.data, parsed.data);
    if (!area) return { ok: false, error: "That life area could not be found." };
    revalidatePath("/life-areas");
    return { ok: true, data: area };
  } catch (error) {
    console.error("updateLifeAreaAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Archive (soft-delete) a life area. Valuable entities are never hard-deleted. */
export async function archiveLifeAreaAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const idResult = lifeAreaIdSchema.safeParse(id);
  if (!idResult.success) {
    return { ok: false, error: "That life area could not be found." };
  }

  try {
    const area = await lifeAreasRepo.archiveLifeArea(user.id, idResult.data);
    if (!area) return { ok: false, error: "That life area could not be found." };
    revalidatePath("/life-areas");
    return { ok: true, data: { id: area.id } };
  } catch (error) {
    console.error("archiveLifeAreaAction failed", error);
    return { ok: false, error: "Could not archive that area. Please try again." };
  }
}

/** Restore a previously archived life area. */
export async function restoreLifeAreaAction(id: string): Promise<ActionResult<LifeArea>> {
  const user = await requireUser();

  const idResult = lifeAreaIdSchema.safeParse(id);
  if (!idResult.success) {
    return { ok: false, error: "That life area could not be found." };
  }

  try {
    const area = await lifeAreasRepo.restoreLifeArea(user.id, idResult.data);
    if (!area) return { ok: false, error: "That life area could not be found." };
    revalidatePath("/life-areas");
    return { ok: true, data: area };
  } catch (error) {
    console.error("restoreLifeAreaAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
