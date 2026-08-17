"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import QRCode from "qrcode";
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

export type SentSummary = {
  id: string;
  kind: string;
  date: string;
  at: string;
};

export type AutomationOverview = {
  tokens: TokenSummary[];
  requests: RequestSummary[];
  sent: SentSummary[];
  /** Where the automations should point. Read from the request, not guessed. */
  baseUrl: string;
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

  const [tokens, requests, sent] = await Promise.all([
    automationRepo.listTokens(user.id),
    automationRepo.listRecentRequests(user.id, 20),
    automationRepo.listRecentNotifications(user.id, 10),
  ]);

  return {
    tokens: tokens.map(toSummary),
    requests: requests.map((request) => ({
      id: request.id,
      route: request.route,
      status: request.status,
      at: request.createdAt.toISOString(),
    })),
    sent: sent.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      date: entry.localDate,
      at: entry.sentAt.toISOString(),
    })),
    baseUrl: await resolveBaseUrl(),
  };
}

/**
 * The URL an automation should call.
 *
 * Taken from the request headers rather than an env var, so the QR code handed
 * to the phone points at wherever the owner is actually reading this page. A
 * hardcoded localhost in a deployed app would be a QR code that silently leads
 * nowhere, which is worse than no QR code at all.
 */
async function resolveBaseUrl(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  if (!host) return process.env.BETTER_AUTH_URL ?? "";
  const proto = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * The token as a QR code, so the phone never types a 45-character secret.
 *
 * Rendered SERVER-side and handed over as finished SVG markup: the encoder
 * never reaches the browser bundle, and the secret is already in this response
 * anyway. The payload is the same JSON the Shortcut expects, so scanning it
 * with the Camera app and pasting into Shortcuts is one step, not four.
 *
 * Failure is not fatal. The secret is displayed as text beside it, and losing
 * the convenience of a QR code must never cost the owner the credential.
 */
async function qrSvgFor(baseUrl: string, secret: string): Promise<string | null> {
  try {
    return await QRCode.toString(JSON.stringify({ url: baseUrl, token: secret }), {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      // Transparent background with black modules; the card sits it on a
      // light surface in both themes so it always scans.
      color: { dark: "#000000", light: "#00000000" },
    });
  } catch (error) {
    console.error("QR generation failed", error);
    return null;
  }
}

/** Mint a token. The secret in the result is the only copy that will exist. */
export async function createAutomationTokenAction(input: {
  name: string;
  scope?: "read" | "read_write";
  expiresInDays?: number | null;
}): Promise<ActionResult<{ token: TokenSummary; secret: string; qrSvg: string | null }>> {
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

    const qrSvg = await qrSvgFor(await resolveBaseUrl(), secret.secret);

    revalidatePath("/settings");
    return { ok: true, data: { token: toSummary(row), secret: secret.secret, qrSvg } };
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
