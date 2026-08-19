import { NextResponse } from "next/server";
import { z } from "zod";

import { pushRepo } from "@/db";
import { hashPairingSecret } from "@/lib/push/pairing";
import {
  PUSH_PAIRING_COOKIE,
  pushPairingCookieOptions,
} from "@/lib/push/pairing-cookie";

const MAX_BODY_LENGTH = 256;
const stageSchema = z.object({
  code: z.string().regex(/^goha_pair_[A-Za-z0-9_-]{43}$/),
});

const UNAVAILABLE = "That pairing code is no longer available.";

function json(body: { ok: boolean; error?: string }, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Exchange the fragment value for a short-lived HttpOnly handoff cookie.
 *
 * This route is intentionally public: it stages setup intent but never creates
 * a session, returns account data, or establishes subscription ownership.
 * Final ownership still requires normal Better Auth authentication.
 */
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_LENGTH) return json({ ok: false, error: UNAVAILABLE }, 400);

    let candidate: unknown;
    try {
      candidate = JSON.parse(text);
    } catch {
      return json({ ok: false, error: UNAVAILABLE }, 400);
    }

    const parsed = stageSchema.safeParse(candidate);
    if (!parsed.success) return json({ ok: false, error: UNAVAILABLE }, 400);

    const pairing = await pushRepo.getPairingSessionByHash(hashPairingSecret(parsed.data.code));
    const now = new Date();
    if (
      !pairing ||
      pairing.consumedAt ||
      pairing.issuedAt.getTime() > now.getTime() ||
      pairing.expiresAt.getTime() <= now.getTime()
    ) {
      return json({ ok: false, error: UNAVAILABLE }, 400);
    }

    const response = json({ ok: true }, 200);
    response.cookies.set(
      PUSH_PAIRING_COOKIE,
      pairing.secretHash,
      pushPairingCookieOptions(pairing.expiresAt),
    );
    return response;
  } catch (error) {
    // Never log the request body: it contains the one-time setup secret.
    console.error("Push pairing staging failed", error instanceof Error ? error.name : "Error");
    return json({ ok: false, error: "Setup is temporarily unavailable. Please try again." }, 503);
  }
}
