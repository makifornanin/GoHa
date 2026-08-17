"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { automationRepo } from "@/db";
import { createToken } from "@/lib/automation/token";
import { requireUser } from "@/lib/session";
import { createTokenSchema } from "@/lib/validations/automation";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Managing the keys to the automation surface.
 *
 * The secret is generated here and returned exactly once, in the response to
 * the click that created it. It is never stored, never re-derivable from the
 * row, and never sent again: what the database holds is a SHA-256 hash and a
 * short prefix for recognising it on screen. Losing it means minting a new one,
 * which is the correct trade for a credential that can read the owner's whole
 * day.
 */

const idSchema = z.uuid("That token could not be found.");
const GENERIC_ERROR = "Something went wrong. Please try again.";

export type TokenSummary = {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "read_write";
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  /** Usable right now: not revoked, not past its expiry. */
  active: boolean;
};

export type RequestSummary = {
  id: string;
  route: string;
  status: number;
  at: string;
};

export type DeliverySummary = {
  id: string;
  kind: string;
  date: string;
  detail: string | null;
  at: string;
};

export type AutomationOverview = {
  tokens: TokenSummary[];
  requests: RequestSummary[];
  deliveries: DeliverySummary[];
};

function toSummary(token: {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: "read" | "read_write";
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}): TokenSummary {
  const now = Date.now();
  return {
    id: token.id,
    name: token.name,
    prefix: token.tokenPrefix,
    scope: token.scope,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
    active: !token.revokedAt && (!token.expiresAt || token.expiresAt.getTime() > now),
  };
}

/**
 * Everything the Automation card shows.
 *
 * Loaded on demand rather than with the Settings page: most visits to Settings
 * are about the theme, and three extra queries on every one of them buys
 * nothing. The same reasoning the Archive card already uses.
 */
export async function listAutomationAction(): Promise<AutomationOverview> {
  const user = await requireUser();

  const [tokens, requests, deliveries] = await Promise.all([
    automationRepo.listTokens(user.id),
    automationRepo.listRecentRequests(user.id, 20),
    automationRepo.listRecentDeliveries(user.id, 10),
  ]);

  return {
    tokens: tokens.map(toSummary),
    requests: requests.map((request) => ({
      id: request.id,
      route: request.route,
      status: request.status,
      at: request.createdAt.toISOString(),
    })),
    deliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      kind: delivery.kind,
      date: delivery.deliveryDate,
      detail: delivery.detail,
      at: delivery.createdAt.toISOString(),
    })),
  };
}

/** Mint a token. The secret in the result is the only copy that will exist. */
export async function createAutomationTokenAction(input: {
  name: string;
  scope?: "read" | "read_write";
  expiresInDays?: number | null;
}): Promise<ActionResult<{ token: TokenSummary; secret: string }>> {
  const user = await requireUser();

  const parsed = createTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the token details." };
  }

  try {
    const secret = createToken();
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const row = await automationRepo.createTokenRecord(user.id, {
      name: parsed.data.name,
      tokenHash: secret.hash,
      tokenPrefix: secret.prefix,
      scope: parsed.data.scope,
      expiresAt,
    });

    revalidatePath("/settings");
    return { ok: true, data: { token: toSummary(row), secret: secret.secret } };
  } catch (error) {
    console.error("createAutomationTokenAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Stop a token working, immediately, while keeping its history.
 *
 * Revoke is the answer to "I pasted it somewhere I should not have", so it must
 * not also erase the record of what that token had been doing.
 */
export async function revokeAutomationTokenAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const revoked = await automationRepo.revokeToken(user.id, parsed.data);
    if (!revoked) return { ok: false, error: "That token is already revoked." };
    revalidatePath("/settings");
    return { ok: true, data: { id: parsed.data } };
  } catch (error) {
    console.error("revokeAutomationTokenAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Delete a revoked token and let its request log detach from it. */
export async function deleteAutomationTokenAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const deleted = await automationRepo.deleteToken(user.id, parsed.data);
    if (!deleted) return { ok: false, error: "That token could not be found." };
    revalidatePath("/settings");
    return { ok: true, data: { id: parsed.data } };
  } catch (error) {
    console.error("deleteAutomationTokenAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
