"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { z } from "zod";

import { appSettingsRepo, invitesRepo } from "@/db";
import { createInviteCode, formatInviteCode, inviteState } from "@/lib/invite";
import { requireUser } from "@/lib/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Issuing invitations.
 *
 * The code is generated here and returned exactly once, in the response to the
 * click that created it, as a ready-made link. The database keeps only its
 * hash, so a dump does not hand anyone a working invitation and there is no
 * copy to come back for.
 */

const GENERIC_ERROR = "Something went wrong. Please try again.";
const idSchema = z.uuid("That invitation could not be found.");

const createSchema = z.object({
  label: z
    .string()
    .trim()
    .max(60, "Keep the note under 60 characters.")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  /** Optional: lock the invitation to one address. */
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address, or leave it blank.")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value && value.length > 0 ? value : null)),
  expiresInDays: z.coerce.number().int().min(1).max(90).nullable().optional(),
});

export type InviteSummary = {
  id: string;
  label: string | null;
  email: string | null;
  prefix: string;
  state: "usable" | "revoked" | "expired" | "used";
  createdAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
};

function toSummary(invite: {
  id: string;
  label: string | null;
  email: string | null;
  codePrefix: string;
  createdAt: Date;
  expiresAt: Date | null;
  claimedAt: Date | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}): InviteSummary {
  return {
    id: invite.id,
    label: invite.label,
    email: invite.email,
    prefix: invite.codePrefix,
    state: inviteState(invite),
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
  };
}

/** The origin to build the link from, read from the request rather than guessed. */
async function baseUrl(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  if (!host) return process.env.BETTER_AUTH_URL ?? "";
  const proto =
    incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type PeopleOverview = {
  invites: InviteSummary[];
  signupMode: "open" | "invite_only";
  /** Only the owner may change the policy; everyone else sees it read-only. */
  isOwner: boolean;
};

export async function listInvitesAction(): Promise<PeopleOverview> {
  const user = await requireUser();
  const [rows, signupMode, owner] = await Promise.all([
    invitesRepo.listInvites(user.id),
    appSettingsRepo.getSignupMode(),
    appSettingsRepo.isOwner(user.id),
  ]);
  return { invites: rows.map(toSummary), signupMode, isOwner: owner };
}

/**
 * Open or close sign-up for the whole install.
 *
 * Owner only, checked server-side. This is the one setting in GoHa that is not
 * personal: it decides who can create an account at all, so it cannot be
 * something any account can change about everyone else.
 */
export async function setSignupModeAction(
  mode: "open" | "invite_only",
): Promise<ActionResult<{ signupMode: "open" | "invite_only" }>> {
  const user = await requireUser();

  if (!(await appSettingsRepo.isOwner(user.id))) {
    return { ok: false, error: "Only the owner of this GoHa can change who may sign up." };
  }
  if (mode !== "open" && mode !== "invite_only") {
    return { ok: false, error: "That is not a sign-up mode." };
  }

  try {
    const saved = await appSettingsRepo.setSignupMode(mode);
    revalidatePath("/settings");
    revalidatePath("/login");
    return { ok: true, data: { signupMode: saved } };
  } catch (error) {
    console.error("setSignupModeAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Create one. The returned link is the only copy of the code that will exist.
 */
export async function createInviteAction(input: {
  label?: string;
  email?: string;
  expiresInDays?: number | null;
}): Promise<ActionResult<{ invite: InviteSummary; link: string; code: string; qrSvg: string | null }>> {
  const user = await requireUser();

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  try {
    const generated = createInviteCode();
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const row = await invitesRepo.createInvite(user.id, {
      codeHash: generated.hash,
      codePrefix: generated.prefix,
      email: parsed.data.email,
      label: parsed.data.label,
      expiresAt,
    });

    const link = `${await baseUrl()}/register?invite=${generated.code}`;
    // A QR code as well as a link: an invitation usually travels to a phone,
    // and pointing a camera at the screen beats sending a URL through a chat
    // app that may rewrite or truncate it.
    const qrSvg = await QRCode.toString(link, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: "#000000", light: "#00000000" },
    }).catch(() => null);

    revalidatePath("/settings");
    return {
      ok: true,
      data: {
        invite: toSummary(row),
        link,
        // Grouped for reading aloud, when the link cannot be clicked.
        code: formatInviteCode(generated.code),
        qrSvg,
      },
    };
  } catch (error) {
    console.error("createInviteAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Withdraw an unused invitation. An accepted one is history, not a switch. */
export async function revokeInviteAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const revoked = await invitesRepo.revokeInvite(user.id, parsed.data);
    if (!revoked) {
      return { ok: false, error: "That invitation is already used or withdrawn." };
    }
    revalidatePath("/settings");
    return { ok: true, data: { id: parsed.data } };
  } catch (error) {
    console.error("revokeInviteAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function deleteInviteAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const deleted = await invitesRepo.deleteInvite(user.id, parsed.data);
    if (!deleted) return { ok: false, error: "That invitation could not be found." };
    revalidatePath("/settings");
    return { ok: true, data: { id: parsed.data } };
  } catch (error) {
    console.error("deleteInviteAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
