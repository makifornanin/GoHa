import { automationRepo } from "@/db";
import {
  authenticateAutomation,
  automationError,
  automationJson,
  finishAutomation,
  isFailure,
} from "@/lib/automation/request";
import { zonedToday } from "@/lib/date";
import { claimDeliverySchema } from "@/lib/validations/automation";
import { getUserDatePrefs } from "@/lib/user-settings";

const ROUTE = "POST /api/automation/deliveries";

/**
 * Claim a notification, once per (kind, local date).
 *
 * The only write on the automation surface, and it writes nothing about the
 * owner's work: it records that something was sent. Every flow must be assumed
 * to run twice, and the platform's own memory is not trustworthy for this (a
 * re-imported workflow starts with empty static data). The unique constraint
 * behind it is what makes this a claim rather than a hope.
 *
 *   { "claimed": true }   you are first, send it
 *   { "claimed": false }  someone already did, send nothing
 *
 * Requires a read_write token. Even so it cannot create, complete, or
 * reschedule anything: those stay behind the app's own Server Actions, where
 * ownership checks and revalidation live (guide, phase 5).
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticateAutomation(request, { route: ROUTE, scope: "read_write" });
  if (isFailure(auth)) return auth.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson({ error: "Send a JSON body." }, { status: 400 }),
      );
    }

    const parsed = claimDeliverySchema.safeParse(body);
    if (!parsed.success) {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson(
          { error: parsed.error.issues[0]?.message ?? "Check the request body." },
          { status: 400 },
        ),
      );
    }

    // The date defaults to the OWNER's local today, resolved from their saved
    // timezone, not the caller's clock: an automation platform set to UTC would
    // otherwise claim tomorrow eight hours early (CLAUDE.md section 6).
    const { timeZone } = await getUserDatePrefs(auth.userId);
    const deliveryDate = parsed.data.date ?? zonedToday(new Date(), timeZone);

    const claimed = await automationRepo.claimDelivery(auth.userId, {
      kind: parsed.data.kind,
      deliveryDate,
      detail: parsed.data.detail,
    });

    if (claimed) {
      return await finishAutomation(
        auth,
        ROUTE,
        automationJson(
          { claimed: true, kind: claimed.kind, date: claimed.deliveryDate },
          { status: 201 },
        ),
      );
    }

    const existing = await automationRepo.getDelivery(auth.userId, parsed.data.kind, deliveryDate);
    return await finishAutomation(
      auth,
      ROUTE,
      automationJson({
        claimed: false,
        kind: parsed.data.kind,
        date: deliveryDate,
        // What the first sender recorded, so a duplicate run can say what
        // already went out rather than guessing.
        sentAt: existing?.createdAt.toISOString() ?? null,
        detail: existing?.detail ?? null,
      }),
    );
  } catch (error) {
    await finishAutomation(auth, ROUTE, new Response(null, { status: 500 }));
    return automationError(ROUTE, error);
  }
}
