"use server";

import { revalidatePath } from "next/cache";

import { brainDumpRepo, type BrainDumpItem } from "@/db";
import type { ConvertTarget } from "@/db/repositories/brain-dump";
import { convertTargetConfig } from "@/lib/brain-dump";
import { requireUser } from "@/lib/session";
import {
  brainDumpContentSchema,
  brainDumpIdSchema,
  convertTargetSchema,
  noteColorSchema,
} from "@/lib/validations/brain-dump";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

export async function captureBrainDumpItemAction(content: string): Promise<ActionResult<BrainDumpItem>> {
  const user = await requireUser();

  const parsed = brainDumpContentSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  try {
    const item = await brainDumpRepo.createBrainDumpItem(user.id, parsed.data);
    revalidatePath("/brain-dump");
    return { ok: true, data: item };
  } catch (error) {
    console.error("captureBrainDumpItemAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updateBrainDumpItemAction(
  id: string,
  content: string,
): Promise<ActionResult<BrainDumpItem>> {
  const user = await requireUser();

  const idResult = brainDumpIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: idResult.error.issues[0]?.message ?? GENERIC_ERROR };
  const parsed = brainDumpContentSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  try {
    const item = await brainDumpRepo.updateBrainDumpItem(user.id, idResult.data, { content: parsed.data });
    if (!item) return { ok: false, error: "That item could not be updated." };
    revalidatePath("/brain-dump");
    return { ok: true, data: item };
  } catch (error) {
    console.error("updateBrainDumpItemAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Recolour a sticky note. The colour KEY is validated against the palette. */
export async function setBrainDumpColorAction(
  id: string,
  color: string,
): Promise<ActionResult<BrainDumpItem>> {
  const user = await requireUser();

  const idResult = brainDumpIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: idResult.error.issues[0]?.message ?? GENERIC_ERROR };
  const parsed = noteColorSchema.safeParse(color);
  if (!parsed.success) return { ok: false, error: "That colour is not available." };

  try {
    const item = await brainDumpRepo.updateBrainDumpItem(user.id, idResult.data, {
      color: parsed.data,
    });
    if (!item) return { ok: false, error: "That item could not be updated." };
    revalidatePath("/brain-dump");
    return { ok: true, data: item };
  } catch (error) {
    console.error("setBrainDumpColorAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function archiveBrainDumpItemAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = brainDumpIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That item could not be found." };

  try {
    const item = await brainDumpRepo.archiveBrainDumpItem(user.id, idResult.data);
    if (!item) return { ok: false, error: "That item could not be archived." };
    revalidatePath("/brain-dump");
    return { ok: true, data: { id: item.id } };
  } catch (error) {
    console.error("archiveBrainDumpItemAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function restoreBrainDumpItemAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = brainDumpIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That item could not be found." };

  try {
    const item = await brainDumpRepo.restoreBrainDumpItem(user.id, idResult.data);
    if (!item) return { ok: false, error: "That item could not be restored." };
    revalidatePath("/brain-dump");
    return { ok: true, data: { id: item.id } };
  } catch (error) {
    console.error("restoreBrainDumpItemAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function deleteBrainDumpItemAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const idResult = brainDumpIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That item could not be found." };

  try {
    const deleted = await brainDumpRepo.deleteBrainDumpItem(user.id, idResult.data);
    if (!deleted) return { ok: false, error: "That item could not be found." };
    revalidatePath("/brain-dump");
    return { ok: true, data: { id: idResult.data } };
  } catch (error) {
    console.error("deleteBrainDumpItemAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Convert an item to a Task / Goal / Habit atomically. The repository's gated CTE
 * makes this idempotent, so a double click never creates two entities: the
 * second call finds the item already converted and returns a friendly message.
 */
export async function convertBrainDumpItemAction(
  id: string,
  target: ConvertTarget,
): Promise<ActionResult<{ entityId: string; target: ConvertTarget }>> {
  const user = await requireUser();

  const idResult = brainDumpIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "That item could not be found." };
  const targetResult = convertTargetSchema.safeParse(target);
  if (!targetResult.success) return { ok: false, error: "Choose a valid conversion." };

  try {
    const result = await brainDumpRepo.convertBrainDumpItem(user.id, idResult.data, targetResult.data);
    if (!result) {
      return { ok: false, error: "That item was already converted." };
    }
    revalidatePath("/brain-dump");
    revalidatePath(convertTargetConfig[targetResult.data].module);
    revalidatePath("/today");
    return { ok: true, data: { entityId: result.entityId, target: targetResult.data } };
  } catch (error) {
    console.error("convertBrainDumpItemAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
